import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createGitService } from '../src/main/services/git-service'

const temporaryPaths: string[] = []

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(temporaryPaths.splice(0).map(async (p) => rm(p, { recursive: true, force: true })))
})

async function createRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'kadris-git-test-'))
  temporaryPaths.push(dir)
  const { execFileSync } = await import('node:child_process')
  execFileSync('git', ['init', '--initial-branch=main'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  await writeFile(join(dir, 'README.md'), '# Test')
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: dir })
  return dir
}

describe('GitService', () => {
  it('detects a git repository', async () => {
    const dir = await createRepo()
    const svc = (await createGitService(dir))!
    const status = await svc.status()
    expect(status.currentBranch).toBeTruthy()
    expect(Array.isArray(status.files)).toBe(true)
  })

  it('returns status of a clean repo', async () => {
    const dir = await createRepo()
    const svc = (await createGitService(dir))!
    const status = await svc.status()
    expect(status.files).toHaveLength(0)
    expect(status.hasUnstaged).toBe(false)
  })

  it('shows modified files in status', async () => {
    const dir = await createRepo()
    await writeFile(join(dir, 'README.md'), '# Modified')
    const svc = (await createGitService(dir))!
    const status = await svc.status()
    expect(status.files.length).toBeGreaterThan(0)
    expect(status.files.some((f) => f.path === 'README.md')).toBe(true)
    expect(status.hasUnstaged).toBe(true)
  })

  it('returns a commit log', async () => {
    const dir = await createRepo()
    const svc = (await createGitService(dir))!
    const log = await svc.log()
    expect(log.commits.length).toBeGreaterThan(0)
    expect(log.commits[0]!.message).toContain('initial')
  })

  it('creates and lists branches', async () => {
    const dir = await createRepo()
    const svc = (await createGitService(dir))!
    const { execFileSync } = await import('node:child_process')
    execFileSync('git', ['branch', 'feature'], { cwd: dir })
    const branches = await svc.branch()
    expect(branches.branches.length).toBeGreaterThanOrEqual(2)
    expect(branches.branches.some((b) => b.name === 'feature')).toBe(true)
  })

  it('commits and reflects new commit', async () => {
    const dir = await createRepo()
    await writeFile(join(dir, 'new.txt'), 'content')
    const svc = (await createGitService(dir))!
    await svc.add(['new.txt'])
    await svc.commit('add new.txt')
    const log = await svc.log()
    expect(log.commits[0]!.message).toContain('add new.txt')
  })

  it('stash operations work', async () => {
    const dir = await createRepo()
    await writeFile(join(dir, 'stash-test.txt'), 'stash me')
    const svc = (await createGitService(dir))!
    await svc.add(['stash-test.txt'])
    await svc.stash('test stash')
    const list = await svc.stashList()
    expect(list.entries.length).toBeGreaterThan(0)
    await svc.stashPop()
    const listAfter = await svc.stashList()
    expect(listAfter.entries.length).toBe(0)
  })

  it('generates a diff', async () => {
    const dir = await createRepo()
    await writeFile(join(dir, 'README.md'), '# Modified Content')
    const svc = (await createGitService(dir))!
    const diff = await svc.diff()
    expect(diff.content).toBeTruthy()
    expect(diff.content).toContain('Modified Content')
  })

  it('returns null for non-repo directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kadris-git-test-'))
    temporaryPaths.push(dir)
    const result = await createGitService(dir)
    expect(result).toBeNull()
  })
})
