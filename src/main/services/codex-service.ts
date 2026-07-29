import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { randomUUID } from 'node:crypto'
import type { CodexAccount, CodexAuthEvent, CodexCliStatus, CodexRunEvent, CodexStatus } from '../../shared/contracts'

const VERSION_PATTERN = /(\d+)\.(\d+)\.(\d+)/
const VALID_VERSION_MAJOR = 0
const MINIMUM_VERSION_MINOR = 144
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000
const APP_SERVER_HANDSHAKE_TIMEOUT_MS = 5_000

interface PendingRequest {
  resolve: (response: unknown) => void
  reject: (error: Error) => void
}

export class CodexService {
  #cliPath: string | null = null
  #appServer: ChildProcess | null = null
  #pendingRequests = new Map<number, PendingRequest>()
  #requestId = 0
  #loginId: string | null = null
  #activeRun = new Map<string, ChildProcess>()
  #authListeners = new Set<(event: CodexAuthEvent) => void>()
  #runListeners = new Set<(event: CodexRunEvent) => void>()
  #cliStatus: CodexCliStatus = { state: 'notFound', version: null }
  #account: CodexAccount = null
  #loginTimeout: ReturnType<typeof setTimeout> | null = null
  readonly #detection: Promise<void>

  constructor(private readonly openExternal?: (url: string) => Promise<void>) {
    this.#detection = this.#detectCli()
  }

  getStatus(): CodexStatus {
    return {
      cli: this.#cliStatus,
      account: this.#account,
      requiresOpenaiAuth: this.#account?.type === 'chatgpt' ? null : null
    }
  }

  async fetchStatus(): Promise<CodexStatus> {
    try {
      await this.#detection
      await this.#ensureAppServer()
      const response = await this.#sendRequest('account/read', { refreshToken: false }) as {
        account?: CodexAccount
        requiresOpenaiAuth?: boolean
      }
      this.#account = response.account ?? null
      const status: CodexStatus = {
        cli: this.#cliStatus,
        account: this.#account,
        requiresOpenaiAuth: response.requiresOpenaiAuth ?? null
      }
      this.#emitAuthEvent({ type: 'statusChanged', status })
      return status
    } catch {
      return this.getStatus()
    }
  }

  async loginChatGPT(): Promise<{ loginId: string; loginUrl: string }> {
    const loginId = randomUUID()
    let authUrl = ''
    this.#loginId = loginId
    try {
      await this.#ensureAppServer()
      const response = await this.#sendRequest('account/login', { type: 'chatgpt' }) as {
        loginUrl?: string
        status?: string
      }
      authUrl = response.loginUrl ?? ''
      if (!authUrl) throw new Error('No login URL returned from Codex')
      const url = new URL(authUrl)
      if (url.protocol !== 'https:') throw new Error('Auth URL must use HTTPS')
      if (this.openExternal) await this.openExternal(authUrl)
    } catch (error) {
      this.#finishLogin(loginId, 'failed', error instanceof Error ? error.message : 'Login failed')
      throw error
    }
    const timeout = setTimeout(() => {
      this.#finishLogin(loginId, 'failed', 'Login timed out')
    }, LOGIN_TIMEOUT_MS)
    this.#loginTimeout = timeout
    return { loginId, loginUrl: authUrl }
  }

  async cancelLogin(loginId: string): Promise<void> {
    if (this.#loginTimeout) {
      clearTimeout(this.#loginTimeout)
      this.#loginTimeout = null
    }
    try {
      await this.#ensureAppServer()
      await this.#sendRequest('account/login/cancel', { loginId })
    } catch {
      // Ignore errors during cancel
    }
    this.#finishLogin(loginId, 'cancelled')
  }

  async logout(): Promise<void> {
    await this.#ensureAppServer()
    await this.#sendRequest('account/logout', {})
    this.#account = null
    const status = this.getStatus()
    this.#emitAuthEvent({ type: 'statusChanged', status })
  }

  run(runId: string, prompt: string, workspaceRoot: string): void {
    if (this.#activeRun.has(runId)) throw new Error('Run already in progress')
    if (!this.#cliPath) throw new Error('Codex CLI is not available')
    const args = [
      'exec', '--json', '--sandbox', 'read-only', '--color', 'never',
      '--ephemeral', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check',
      '-C', workspaceRoot, '-'
    ]
    const child = spawn(this.#cliPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })
    this.#activeRun.set(runId, child)
    this.#emitRunEvent({ runId, type: 'started' })
    const collectedText: string[] = []
    let finished = false
    const finish = (event: CodexRunEvent) => {
      if (finished) return
      finished = true
      this.#activeRun.delete(runId)
      this.#emitRunEvent(event)
    }
    child.stdin?.end(prompt)
    const rl = createInterface({ input: child.stdout })
    rl.on('line', (line) => {
      if (!line.trim()) return
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(line) as Record<string, unknown>
      } catch {
        return
      }
      if (parsed.type === 'item.completed') {
        const item = parsed.item as Record<string, unknown> | undefined
        if (item?.type === 'agent_message') {
          const message = item.message as Record<string, unknown> | undefined
          if (typeof message?.content === 'string') collectedText.push(message.content)
        }
      }
      if (parsed.type === 'turn.completed') {
        const exitCode = parsed.exitCode as number | undefined
        if (exitCode === 0) {
          finish({ runId, type: 'completed', text: collectedText.join('\n') })
        } else {
          finish({ runId, type: 'failed', code: 'PROCESS_FAILED', message: `Exit code ${exitCode ?? 'unknown'}` })
        }
      }
    })
    child.on('error', (error) => {
      finish({ runId, type: 'failed', code: 'PROCESS_FAILED', message: error.message.slice(0, 300) })
    })
    child.on('close', (code) => {
      if (finished) return
      if (code === 0 && collectedText.length > 0) {
        finish({ runId, type: 'completed', text: collectedText.join('\n') })
      } else if (code !== 0) {
        finish({ runId, type: 'failed', code: 'PROCESS_FAILED', message: `Process exited with code ${code}` })
      } else {
        finish({ runId, type: 'failed', code: 'PROCESS_FAILED', message: 'Process produced no output' })
      }
    })
  }

  cancelRun(runId: string): void {
    const child = this.#activeRun.get(runId)
    if (!child) return
    try { child.kill() } catch { /* Process may already have exited. */ }
    this.#activeRun.delete(runId)
    this.#emitRunEvent({ runId, type: 'cancelled' })
  }

  addAuthListener(listener: (event: CodexAuthEvent) => void): () => void {
    this.#authListeners.add(listener)
    return () => { this.#authListeners.delete(listener) }
  }

  addRunListener(listener: (event: CodexRunEvent) => void): () => void {
    this.#runListeners.add(listener)
    return () => { this.#runListeners.delete(listener) }
  }

  destroy(): void {
    if (this.#loginTimeout) {
      clearTimeout(this.#loginTimeout)
      this.#loginTimeout = null
    }
    if (this.#appServer) {
      try { this.#appServer.kill() } catch { /* Process may already have exited. */ }
      this.#appServer = null
    }
    for (const [, child] of this.#activeRun) {
      try { child.kill() } catch { /* Process may already have exited. */ }
    }
    this.#activeRun.clear()
    for (const [, pending] of this.#pendingRequests) {
      pending.reject(new Error('Service destroyed'))
    }
    this.#pendingRequests.clear()
  }

  #detectCli(): Promise<void> {
    return new Promise((resolveDetection) => {
      const command = process.platform === 'win32' ? 'where' : 'which'
      const child = spawn(command, ['codex'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
      let stdout = ''
      let discoveryFinished = false
      const finishDiscovery = (): void => {
        if (discoveryFinished) return
        discoveryFinished = true
        resolveDetection()
      }
      child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
      child.on('error', () => {
        this.#cliStatus = { state: 'notFound', version: null }
        finishDiscovery()
      })
      child.on('close', () => {
        if (discoveryFinished) return
        const path = stdout.trim().split('\n')[0]?.trim()
        if (!path || !existsSync(path)) {
          this.#cliStatus = { state: 'notFound', version: null }
          finishDiscovery()
          return
        }
        const versionChild = spawn(path, ['--version'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
        let versionOutput = ''
        let versionFinished = false
        const finishVersion = (status: CodexCliStatus, usablePath?: string): void => {
          if (versionFinished) return
          versionFinished = true
          clearTimeout(timer)
          this.#cliStatus = status
          this.#cliPath = usablePath ?? null
          finishDiscovery()
        }
        versionChild.stdout?.on('data', (chunk: Buffer) => { versionOutput += chunk.toString() })
        const timer = setTimeout(() => {
          try { versionChild.kill() } catch { /* Process may already have exited. */ }
          finishVersion({ state: 'unavailable', version: null })
        }, 3_000)
        versionChild.on('close', () => {
          const match = VERSION_PATTERN.exec(versionOutput)
          if (!match) {
            finishVersion({ state: 'unsupported', version: versionOutput.trim().slice(0, 40) || null })
            return
          }
          const major = parseInt(match[1]!, 10)
          const minor = parseInt(match[2]!, 10)
          const version = `${match[1]}.${match[2]}.${match[3]}`
          if (major === VALID_VERSION_MAJOR && minor >= MINIMUM_VERSION_MINOR) finishVersion({ state: 'ready', version }, path)
          else finishVersion({ state: 'unsupported', version })
        })
        versionChild.on('error', () => finishVersion({ state: 'unavailable', version: null }))
      })
    })
  }

  async #ensureAppServer(): Promise<void> {
    await this.#detection
    if (this.#appServer) return
    if (!this.#cliPath) throw new Error('Codex CLI is not available')
    const child = spawn(this.#cliPath, ['app-server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })
    this.#appServer = child
    const rl = createInterface({ input: child.stdout })
    rl.on('line', (line) => {
      if (!line.trim()) return
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(line) as Record<string, unknown>
      } catch {
        return
      }
      const id = parsed.id as number | undefined
      if (typeof id === 'number' && this.#pendingRequests.has(id)) {
        const pending = this.#pendingRequests.get(id)!
        this.#pendingRequests.delete(id)
        if ('error' in parsed) {
          const error = parsed.error as { message?: unknown }
          pending.reject(new Error(typeof error.message === 'string' ? error.message : 'Codex app-server request failed'))
        } else {
          pending.resolve(parsed.result)
        }
      }
      if (parsed.method === 'account/login/completed') {
        const params = parsed.params as Record<string, unknown> | undefined
        if (this.#loginId && params) {
          const outcome = (params.status as string) === 'ok' ? 'succeeded' : 'failed'
          const message = typeof params.error === 'string' ? params.error : undefined
          this.#finishLogin(this.#loginId, outcome, message)
        }
      }
      if (parsed.method === 'account/updated') {
        void this.fetchStatus().catch(() => undefined)
      }
    })
    child.on('error', () => {
      this.#appServer = null
    })
    child.on('close', () => {
      this.#appServer = null
      for (const [, pending] of this.#pendingRequests) {
        pending.reject(new Error('App server disconnected'))
      }
      this.#pendingRequests.clear()
    })
    await this.#sendRequest('initialize', {
      clientInfo: { name: 'kadris', title: 'Kadris', version: '0.1.0' }
    })
    this.#sendNotification('initialized', {})
  }

  #sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.#appServer?.stdin) {
        reject(new Error('App server is not running'))
        return
      }
      const id = ++this.#requestId
      const timeout = setTimeout(() => {
        this.#pendingRequests.delete(id)
        reject(new Error('Request timed out'))
      }, APP_SERVER_HANDSHAKE_TIMEOUT_MS)
      this.#pendingRequests.set(id, {
        resolve: (response) => {
          clearTimeout(timeout)
          resolve(response)
        },
        reject: (error) => {
          clearTimeout(timeout)
          reject(error)
        }
      })
      const message = JSON.stringify({ jsonrpc: '2.0', method, id, params }) + '\n'
      this.#appServer.stdin.write(message)
    })
  }

  #sendNotification(method: string, params: Record<string, unknown>): void {
    if (!this.#appServer?.stdin) throw new Error('App server is not running')
    this.#appServer.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
  }

  #finishLogin(loginId: string, outcome: 'succeeded' | 'failed' | 'cancelled', message?: string): void {
    if (this.#loginId !== loginId) return
    this.#loginId = null
    if (this.#loginTimeout) {
      clearTimeout(this.#loginTimeout)
      this.#loginTimeout = null
    }
    const event: CodexAuthEvent = { type: 'loginFinished', loginId, outcome }
    if (message) event.message = message
    this.#emitAuthEvent(event)
  }

  #emitAuthEvent(event: CodexAuthEvent): void {
    for (const listener of this.#authListeners) listener(event)
  }

  #emitRunEvent(event: CodexRunEvent): void {
    for (const listener of this.#runListeners) listener(event)
  }
}
