import type {
  CodexAuthEvent,
  CodexCancelLoginInput,
  CodexCancelRunInput,
  CodexRunInput,
  CodexRunEvent,
  CodexStatus,
  AppInfo,
  PlatformBridge,
  Result,
  Workspace
} from '../../../shared/contracts'
import type { TerminalDataEvent, TerminalExitEvent } from '../../../shared/terminal-contracts'
import type { TerminalCreateInput, TerminalInfo, TerminalWriteInput, TerminalResizeInput, TerminalCloseInput } from '../../../shared/terminal-contracts'
import type { AiProviderConfiguration, ApiKeyProviderId } from '../../../shared/ai-provider-contracts'
import { WebApiClient } from './WebApiClient'

type TerminalBridgeApi = PlatformBridge['terminal']

const OFFICIAL_LINKS: Record<ApiKeyProviderId, string> = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  google: 'https://aistudio.google.com/app/apikey',
  mistral: 'https://console.mistral.ai/api-keys',
  openrouter: 'https://openrouter.ai/settings/keys'
}

const unavailableProviders: AiProviderConfiguration = {
  secureStorageAvailable: false,
  providers: [
    { id: 'openai', kind: 'api-key', hasCredential: false },
    { id: 'anthropic', kind: 'api-key', hasCredential: false },
    { id: 'google', kind: 'api-key', hasCredential: false },
    { id: 'mistral', kind: 'api-key', hasCredential: false },
    { id: 'openrouter', kind: 'api-key', hasCredential: false },
    { id: 'ollama', kind: 'local', endpoint: 'http://127.0.0.1:11434' }
  ]
}

function unsupported<T>(message: string): Promise<Result<T>> {
  return Promise.resolve({ ok: false, error: { code: 'UNSUPPORTED', message } })
}

class WebTerminalBridge implements TerminalBridgeApi {
  #socket: WebSocket | null = null
  #connecting: Promise<WebSocket> | null = null
  #pending = new Map<string, { resolve: (result: Result<unknown>) => void; timeout: number }>()
  #dataListeners = new Set<(event: TerminalDataEvent) => void>()
  #exitListeners = new Set<(event: TerminalExitEvent) => void>()
  #authListeners = new Set<(event: CodexAuthEvent) => void>()
  #runListeners = new Set<(event: CodexRunEvent) => void>()

  constructor(private readonly client: WebApiClient) {}

  create(input: TerminalCreateInput): Promise<Result<TerminalInfo>> { return this.send<TerminalInfo>('terminal.create', input) }
  write(input: TerminalWriteInput): Promise<Result<null>> { return this.send<null>('terminal.write', input) }
  resize(input: TerminalResizeInput): Promise<Result<null>> { return this.send<null>('terminal.resize', input) }
  close(input: TerminalCloseInput): Promise<Result<null>> { return this.send<null>('terminal.close', input) }
  onData(listener: (event: TerminalDataEvent) => void): () => void { this.#dataListeners.add(listener); return () => this.#dataListeners.delete(listener) }
  onExit(listener: (event: TerminalExitEvent) => void): () => void { this.#exitListeners.add(listener); return () => this.#exitListeners.delete(listener) }
  onAuthEvent(listener: (event: CodexAuthEvent) => void): () => void { this.#authListeners.add(listener); void this.#connect().catch(() => undefined); return () => this.#authListeners.delete(listener) }
  onRunEvent(listener: (event: CodexRunEvent) => void): () => void { this.#runListeners.add(listener); void this.#connect().catch(() => undefined); return () => this.#runListeners.delete(listener) }

  async send<T>(action: string, input: unknown): Promise<Result<T>> {
    try {
      const socket = await this.#connect()
      const id = crypto.randomUUID()
      return await new Promise<Result<T>>((resolve) => {
        const timeout = window.setTimeout(() => {
          this.#pending.delete(id)
          resolve({ ok: false, error: { code: 'TIMEOUT', message: 'Terminal request timed out' } })
        }, 15_000)
        this.#pending.set(id, { resolve: (result) => resolve(result as Result<T>), timeout })
        socket.send(JSON.stringify({ id, action, input }))
      })
    } catch (error) {
      return { ok: false, error: { code: 'IO_ERROR', message: error instanceof Error ? error.message : 'Terminal connection failed' } }
    }
  }

  #connect(): Promise<WebSocket> {
    if (this.#socket?.readyState === WebSocket.OPEN) return Promise.resolve(this.#socket)
    if (this.#connecting) return this.#connecting
    this.#connecting = new Promise((resolve, reject) => {
      const socket = this.client.createWebSocket()
      socket.addEventListener('open', () => { this.#socket = socket; this.#connecting = null; resolve(socket) }, { once: true })
      socket.addEventListener('error', () => { this.#connecting = null; reject(new Error('Terminal WebSocket failed')) }, { once: true })
      socket.addEventListener('close', () => {
        if (this.#socket === socket) this.#socket = null
        for (const [, pending] of this.#pending) {
          window.clearTimeout(pending.timeout)
          pending.resolve({ ok: false, error: { code: 'IO_ERROR', message: 'Terminal connection closed' } })
        }
        this.#pending.clear()
      })
      socket.addEventListener('message', (message) => {
        const payload = JSON.parse(String(message.data)) as { id?: string; result?: Result<unknown>; event?: string; payload?: unknown }
        if (payload.id && payload.result) {
          const pending = this.#pending.get(payload.id)
          if (pending) { window.clearTimeout(pending.timeout); this.#pending.delete(payload.id); pending.resolve(payload.result) }
        } else if (payload.event === 'terminal.data') {
          for (const listener of this.#dataListeners) listener(payload.payload as TerminalDataEvent)
        } else if (payload.event === 'terminal.exit') {
          for (const listener of this.#exitListeners) listener(payload.payload as TerminalExitEvent)
        } else if (payload.event === 'codex.auth') {
          for (const listener of this.#authListeners) listener(payload.payload as CodexAuthEvent)
        } else if (payload.event === 'codex.run') {
          for (const listener of this.#runListeners) listener(payload.payload as CodexRunEvent)
        }
      })
    })
    return this.#connecting
  }
}

export function createWebPlatformBridge(): PlatformBridge {
  const client = new WebApiClient()
  const terminal = new WebTerminalBridge(client)
  const chooseWorkspace = async (): Promise<Result<Workspace | null>> => {
    const selected = window.prompt('Workspace path on the Kadris host')
    if (!selected) return { ok: true, value: null }
    return client.post<Workspace>('/api/workspace/open', { path: selected })
  }

  const bridge: PlatformBridge = {
    runtime: 'web-local' as const,
    capabilities: Object.freeze({ terminal: true, agent: true, secureCredentials: false, liveServer: true, nativeDialogs: false }),
    app: Object.freeze({ getInfo: () => client.get<AppInfo>('/api/app') }),
    workspace: Object.freeze({
      getCurrent: () => client.get<Workspace | null>('/api/workspace'),
      choose: chooseWorkspace,
      listDirectory: (input) => client.get(`/api/workspace/list?path=${encodeURIComponent(input.relativePath)}`),
      readFile: (input) => client.post('/api/files/read', input),
      readBinaryFile: (input) => client.post('/api/files/read-binary', input),
      createFile: (input) => client.post('/api/files/create', input),
      createFolder: (input) => client.post('/api/files/create-folder', input),
      saveFile: (input) => client.post('/api/files/save', input),
      rename: (input) => client.post('/api/files/rename', input),
      delete: (input) => client.post('/api/files/delete', input)
    }),
    terminal: Object.freeze(terminal),
    aiProviders: Object.freeze({
      getConfiguration: () => Promise.resolve({ ok: true as const, value: unavailableProviders }),
      saveApiKey: () => unsupported<AiProviderConfiguration>('Secure credential storage is unavailable in the local web runtime'),
      removeApiKey: () => unsupported<AiProviderConfiguration>('Secure credential storage is unavailable in the local web runtime'),
      setOllamaEndpoint: () => unsupported<AiProviderConfiguration>('Provider settings persistence is unavailable in the local web runtime'),
      openCredentialPage: ({ providerId }) => { window.open(OFFICIAL_LINKS[providerId], '_blank', 'noopener,noreferrer'); return Promise.resolve({ ok: true as const, value: null }) },
      openChatGPT: () => { window.open('https://chatgpt.com/', '_blank', 'noopener,noreferrer'); return Promise.resolve({ ok: true as const, value: null }) }
    }),
    codex: Object.freeze({
      getStatus: () => client.get<CodexStatus>('/api/agent/status'),
      loginChatGPT: async () => {
        const result = await client.post<{ loginId: string; loginUrl: string }>('/api/agent/login')
        if (!result.ok) return result
        window.open(result.value.loginUrl, '_blank', 'noopener,noreferrer')
        return { ok: true as const, value: null }
      },
      cancelLogin: (input: CodexCancelLoginInput) => client.post<null>('/api/agent/cancel-login', input),
      logout: () => client.post<null>('/api/agent/logout'),
      run: (input: CodexRunInput) => client.post<null>('/api/agent/run', input),
      cancelRun: (input: CodexCancelRunInput) => client.post<null>('/api/agent/cancel-run', input),
      onAuthEvent: (listener: (event: CodexAuthEvent) => void) => terminal.onAuthEvent(listener),
      onRunEvent: (listener: (event: CodexRunEvent) => void) => terminal.onRunEvent(listener)
    }),
    liveServer: Object.freeze({
      start: async (input) => {
        const result = await client.post<{ url: string }>('/api/live-server/start', input)
        if (!result.ok) return result
        window.open(result.value.url, '_blank', 'noopener,noreferrer')
        return { ok: true as const, value: null }
      },
      stop: () => client.post<null>('/api/live-server/stop'),
      getStatus: () => client.get<{ running: boolean; url: string | null; filePath: string | null }>('/api/live-server/status')
    })
  }
  return Object.freeze(bridge)
}
