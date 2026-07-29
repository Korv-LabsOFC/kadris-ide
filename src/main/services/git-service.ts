import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import type { GitStatus, GitDiff, GitCommitLog, GitBranchInfo, GitStashInfo } from '../../shared/git-contracts'

const GIT_TIMEOUT_MS = 30_000

export class GitService {
  readonly #workspaceRoot: string

  constructor(workspaceRoot: string) {
    this.#workspaceRoot = workspaceRoot
  }

  async isRepo(): Promise<boolean> {
    try {
      await this.#run('rev-parse', ['--git-dir'])
      return true
    } catch { return false }
  }

  async init(): Promise<void> {
    await this.#run('init')
  }

  async status(): Promise<GitStatus> {
    const [branchOutput, statusOutput, trackingOutput] = await Promise.all([
      this.#run('rev-parse', ['--abbrev-ref', 'HEAD']),
      this.#run('status', ['--porcelain=v2', '--branch', '--untracked-files=normal']),
      this.#run('rev-list', ['--count', '--left-right', '@{upstream}...HEAD']).catch(() => '0\t0')
    ])
    const currentBranch = branchOutput.trim()
    const ahead = parseInt(trackingOutput.trim().split('\t')[0] ?? '0', 10)
    const behind = parseInt(trackingOutput.trim().split('\t')[1] ?? '0', 10)
    const files: GitStatus['files'] = []
    let hasUnstaged = false

    for (const line of statusOutput.split('\n')) {
      if (!line || line.startsWith('#')) continue
      if (line.startsWith('? ')) {
        const path = line.slice(2)
        files.push({ path, staged: false, kind: 'untracked' })
        hasUnstaged = true
        continue
      }
      const parts = line.split(' ')
      if (parts[0] !== '1' || parts.length < 9) continue
      const xy = parts[1]!
      const path = parts[8] ?? ''
      const staged = xy[0] !== '.' && xy[0] !== ' '
      if (!staged && xy[1] !== '.') hasUnstaged = true
      let kind: GitStatus['files'][number]['kind'] = 'modified'
      if (xy[0] === 'A' || xy[1] === 'A') kind = 'added'
      else if (xy[0] === 'D' || xy[1] === 'D') kind = 'deleted'
      else if (xy[0] === 'R' || xy[1] === 'R') kind = 'renamed'
      else if (xy[0] === 'C' || xy[1] === 'C') kind = 'copied'
      else if (xy[0] === 'U' || xy[1] === 'U') kind = 'unmerged'
      files.push({ path, staged, kind })
    }

    return { currentBranch, behind, ahead, files, hasUnstaged }
  }

  async diff(path?: string, staged = false): Promise<GitDiff> {
    const args = staged ? ['--cached'] : []
    if (path) args.push('--', path)
    else args.push('--', '.')
    const content = await this.#run('diff', args)
    return { path: path ?? '', staged, content }
  }

  async add(files: string[]): Promise<void> {
    await this.#run('add', ['--', ...files])
  }

  async addAll(): Promise<void> {
    await this.#run('add', ['-A'])
  }

  async unstage(path?: string): Promise<void> {
    await this.#run('reset', path ? ['--', path] : [])
  }

  async commit(message: string, all = false): Promise<string> {
    const args = ['commit', '-m', message]
    if (all) args.push('-a')
    const output = await this.#run('commit', ['-m', message, ...(all ? ['-a'] : [])])
    const match = output.match(/\[[\w-]+ [\da-f]+]/)
    return match?.[0] ?? 'committed'
  }

  async log(maxCount = 50): Promise<GitCommitLog> {
    const output = await this.#run('log', [
      `--max-count=${maxCount}`,
      '--format=%H%n%h%n%s%n%an%n%ae%n%at%n%D%n%x00',
      '--decorate=full'
    ])
    const commits: GitCommitLog['commits'] = []
    for (const entry of output.split('\0').filter(Boolean)) {
      const [hash, abbreviatedHash, message, author, authorEmail, timestamp, refs] = entry.split('\n')
      if (!hash || !abbreviatedHash) continue
      commits.push({
        hash, abbreviatedHash, message: message ?? '',
        author: author ?? '', authorEmail: authorEmail ?? '',
        timestamp: parseInt(timestamp ?? '0', 10),
        refs: refs?.trim() || undefined
      })
    }
    return { commits }
  }

  async branch(): Promise<GitBranchInfo> {
    const output = await this.#run('branch', ['-vv'])
    const branches: GitBranchInfo['branches'] = []
    for (const line of output.split('\n').filter(Boolean)) {
      const current = line.startsWith('* ')
      const cleaned = line.replace(/^\* /, '').trim()
      const parts = cleaned.split(/\s+/)
      const name = parts[0] ?? cleaned
      const tracking = parts.find((p) => p.includes('/'))
      branches.push({
        name,
        current,
        tracking,
        ahead: 0, behind: 0
      })
    }
    return { branches }
  }

  async checkout(branch: string, create = false): Promise<void> {
    await this.#run('checkout', create ? ['-b', branch] : [branch])
  }

  async stash(message?: string): Promise<void> {
    await this.#run('stash', message ? ['push', '-m', message] : ['push'])
  }

  async stashPop(): Promise<void> {
    await this.#run('stash', ['pop'])
  }

  async stashList(): Promise<GitStashInfo> {
    const output = await this.#run('stash', ['list']).catch(() => '')
    return {
      entries: output.split('\n').filter(Boolean).map((line, index) => ({
        index,
        message: line.replace(/^stash@\{\d+}: /, '')
      }))
    }
  }

  async clone(url: string, directory: string, branch?: string): Promise<void> {
    const args = ['clone', url, directory]
    if (branch) args.push('--branch', branch)
    await this.#run('clone', branch ? [url, directory, '--branch', branch] : [url, directory])
  }

  async push(remote = 'origin', branch?: string, force = false): Promise<void> {
    const args = ['push', remote, branch ?? 'HEAD']
    if (force) args.push('--force')
    await this.#run('push', args)
  }

  async pull(remote = 'origin', branch?: string): Promise<void> {
    const args = ['pull', remote, branch ?? 'HEAD']
    await this.#run('pull', args)
  }

  async fetch(remote = 'origin'): Promise<void> {
    await this.#run('fetch', [remote])
  }

  async remoteAdd(name: string, url: string): Promise<void> {
    await this.#run('remote', ['add', name, url])
  }

  async remoteRemove(name: string): Promise<void> {
    await this.#run('remote', ['remove', name])
  }

  async remotes(): Promise<{ name: string; url: string }[]> {
    const output = await this.#run('remote', ['-v'])
    const seen = new Set<string>()
    const remotes: { name: string; url: string }[] = []
    for (const line of output.split('\n').filter(Boolean)) {
      const [name, url] = line.split(/\s+/)
      if (!name || !url || seen.has(name)) continue
      seen.add(name)
      remotes.push({ name, url })
    }
    return remotes
  }

  async getConfig(key: string): Promise<string> {
    return (await this.#run('config', [key])).trim()
  }

  async setConfig(key: string, value: string): Promise<void> {
    await this.#run('config', [key, value])
  }

  #run(subcommand: string, args: string[] = []): Promise<string> {
    return new Promise((resolvePromise, reject) => {
      execFile('git', [subcommand, ...args], {
        cwd: this.#workspaceRoot,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      }, (error, stdout) => {
        if (error) {
          const message = error.message?.replace(this.#workspaceRoot, '.') ?? 'Git operation failed'
          reject(new Error(message.slice(0, 500)))
        } else {
          resolvePromise(stdout)
        }
      })
    })
  }
}

export async function createGitService(workspaceRoot: string): Promise<GitService | null> {
  try {
    const rootStat = await stat(workspaceRoot)
    if (!rootStat.isDirectory()) return null
    const service = new GitService(workspaceRoot)
    const valid = await service.isRepo()
    return valid ? service : null
  } catch { return null }
}
