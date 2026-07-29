import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { z } from 'zod'
import {
  IPC_CHANNELS,
  appInfoSchema,
  createFileInputSchema,
  createFolderInputSchema,
  codexAuthEventSchema,
  codexCancelLoginInputSchema,
  codexCancelRunInputSchema,
  codexLoginInputSchema,
  codexRunEventSchema,
  codexRunInputSchema,
  codexStatusSchema,
  deleteInputSchema,
  errorSchema,
  listDirectoryInputSchema,
  readWorkspaceFileInputSchema,
  readBinaryFileInputSchema,
  renameInputSchema,
  saveFileInputSchema,
  workspaceBinaryDocumentSchema,
  workspaceDocumentSchema,
  workspaceEntriesSchema,
  workspaceEntrySchema,
  workspaceSchema,
  type CodexAuthEvent,
  type CodexCancelLoginInput,
  type CodexCancelRunInput,
  type CodexLoginInput,
  type CodexRunEvent,
  type CodexRunInput,
  type CreateFileInput,
  type CreateFolderInput,
  type DeleteInput,
  type KadrisDesktopApi,
  type RenameInput,
  type Result,
  type SaveFileInput,
} from '../shared/contracts'
import {
  TERMINAL_CHANNELS,
  terminalCloseInputSchema,
  terminalCreateInputSchema,
  terminalDataEventSchema,
  terminalExitEventSchema,
  terminalInfoSchema,
  terminalResizeInputSchema,
  terminalWriteInputSchema,
  type TerminalCloseInput,
  type TerminalCreateInput,
  type TerminalDataEvent,
  type TerminalExitEvent,
  type TerminalResizeInput,
  type TerminalWriteInput
} from '../shared/terminal-contracts'
import {
  AI_PROVIDER_CHANNELS,
  aiProviderConfigurationSchema,
  openCredentialPageInputSchema,
  removeApiKeyInputSchema,
  saveApiKeyInputSchema,
  setOllamaEndpointInputSchema,
  type OpenCredentialPageInput,
  type RemoveApiKeyInput,
  type SaveApiKeyInput,
  type SetOllamaEndpointInput
} from '../shared/ai-provider-contracts'
import {
  LIVE_SERVER_CHANNELS,
  liveServerStartInputSchema,
  liveServerStatusSchema,
  type LiveServerStartInput
} from '../shared/live-server-contracts'
import {
  gitStatusSchema, gitDiffSchema, gitCommitLogSchema, gitBranchSchema, gitStashSchema,
  gitCommitInputSchema, gitCheckoutInputSchema, gitAddInputSchema,
  type GitAddInput, type GitCommitInput, type GitCheckoutInput
} from '../shared/git-contracts'
import { searchInputSchema, searchResultSchema, type SearchInput } from '../shared/search-contracts'
import { sessionStateSchema, type SessionState } from '../shared/session-contracts'
import { type PermissionRequest } from '../shared/permission-contracts'

const AUTH_EVENT_CHANNEL = 'codex:auth-event:v1'
const RUN_EVENT_CHANNEL = 'codex:run-event:v1'

function parseResult<T>(result: unknown, valueSchema: z.ZodType<T>): Result<T> {
  if (typeof result !== 'object' || result === null || !('ok' in result)) throw new Error('Malformed IPC response')
  const response = result as { ok: unknown; value?: unknown; error?: unknown }
  if (response.ok === true) return { ok: true, value: valueSchema.parse(response.value) }
  if (response.ok === false) return { ok: false, error: errorSchema.parse(response.error) }
  throw new Error('Malformed IPC response')
}

const nullableWorkspaceSchema = workspaceSchema.nullable()

const api: KadrisDesktopApi = Object.freeze({
  runtime: 'electron',
  capabilities: Object.freeze({ terminal: true, agent: true, secureCredentials: true, liveServer: true, nativeDialogs: true }),
  app: Object.freeze({
    getInfo: async () => parseResult(await ipcRenderer.invoke(IPC_CHANNELS.appGetInfo), appInfoSchema)
  }),
  workspace: Object.freeze({
    getCurrent: async () => parseResult(await ipcRenderer.invoke(IPC_CHANNELS.workspaceGetCurrent), nullableWorkspaceSchema),
    choose: async () => parseResult(await ipcRenderer.invoke(IPC_CHANNELS.workspaceChoose), nullableWorkspaceSchema),
    listDirectory: async (input: Parameters<KadrisDesktopApi['workspace']['listDirectory']>[0]) => {
      const parsed = listDirectoryInputSchema.parse(input)
      return parseResult(await ipcRenderer.invoke(IPC_CHANNELS.workspaceList, parsed), workspaceEntriesSchema)
    },
    readFile: async (input: Parameters<KadrisDesktopApi['workspace']['readFile']>[0]) => {
      const parsed = readWorkspaceFileInputSchema.parse(input)
      return parseResult(await ipcRenderer.invoke(IPC_CHANNELS.workspaceReadFile, parsed), workspaceDocumentSchema)
    },
    createFile: async (input: CreateFileInput) => {
      const parsed = createFileInputSchema.parse(input)
      return parseResult(await ipcRenderer.invoke(IPC_CHANNELS.workspaceCreateFile, parsed), workspaceEntrySchema)
    },
    createFolder: async (input: CreateFolderInput) => {
      const parsed = createFolderInputSchema.parse(input)
      return parseResult(await ipcRenderer.invoke(IPC_CHANNELS.workspaceCreateFolder, parsed), workspaceEntrySchema)
    },
    saveFile: async (input: SaveFileInput) => {
      const parsed = saveFileInputSchema.parse(input)
      return parseResult(await ipcRenderer.invoke(IPC_CHANNELS.workspaceSaveFile, parsed), z.null())
    },
    rename: async (input: RenameInput) => {
      const parsed = renameInputSchema.parse(input)
      return parseResult(await ipcRenderer.invoke(IPC_CHANNELS.workspaceRename, parsed), workspaceEntrySchema)
    },
    delete: async (input: DeleteInput) => {
      const parsed = deleteInputSchema.parse(input)
      return parseResult(await ipcRenderer.invoke(IPC_CHANNELS.workspaceDelete, parsed), z.null())
    },
    readBinaryFile: async (input: Parameters<KadrisDesktopApi['workspace']['readBinaryFile']>[0]) => {
      const parsed = readBinaryFileInputSchema.parse(input)
      return parseResult(await ipcRenderer.invoke(IPC_CHANNELS.workspaceReadBinaryFile, parsed), workspaceBinaryDocumentSchema)
    }
  }),
  terminal: Object.freeze({
    create: async (input: TerminalCreateInput) => {
      const parsed = terminalCreateInputSchema.parse(input)
      return parseResult(await ipcRenderer.invoke(TERMINAL_CHANNELS.create, parsed), terminalInfoSchema)
    },
    write: async (input: TerminalWriteInput) => {
      const parsed = terminalWriteInputSchema.parse(input)
      return parseResult(await ipcRenderer.invoke(TERMINAL_CHANNELS.write, parsed), z.null())
    },
    resize: async (input: TerminalResizeInput) => {
      const parsed = terminalResizeInputSchema.parse(input)
      return parseResult(await ipcRenderer.invoke(TERMINAL_CHANNELS.resize, parsed), z.null())
    },
    close: async (input: TerminalCloseInput) => {
      const parsed = terminalCloseInputSchema.parse(input)
      return parseResult(await ipcRenderer.invoke(TERMINAL_CHANNELS.close, parsed), z.null())
    },
    onData: (listener: (event: TerminalDataEvent) => void) => {
      const wrapped = (_event: IpcRendererEvent, payload: unknown): void => listener(terminalDataEventSchema.parse(payload))
      ipcRenderer.on(TERMINAL_CHANNELS.data, wrapped)
      return () => ipcRenderer.removeListener(TERMINAL_CHANNELS.data, wrapped)
    },
    onExit: (listener: (event: TerminalExitEvent) => void) => {
      const wrapped = (_event: IpcRendererEvent, payload: unknown): void => listener(terminalExitEventSchema.parse(payload))
      ipcRenderer.on(TERMINAL_CHANNELS.exit, wrapped)
      return () => ipcRenderer.removeListener(TERMINAL_CHANNELS.exit, wrapped)
    }
  }),
  aiProviders: Object.freeze({
    getConfiguration: async () => parseResult(await ipcRenderer.invoke(AI_PROVIDER_CHANNELS.getConfiguration), aiProviderConfigurationSchema),
    saveApiKey: async (input: SaveApiKeyInput) => {
      const parsed = saveApiKeyInputSchema.parse(input)
      return parseResult(await ipcRenderer.invoke(AI_PROVIDER_CHANNELS.saveApiKey, parsed), aiProviderConfigurationSchema)
    },
    removeApiKey: async (input: RemoveApiKeyInput) => {
      const parsed = removeApiKeyInputSchema.parse(input)
      return parseResult(await ipcRenderer.invoke(AI_PROVIDER_CHANNELS.removeApiKey, parsed), aiProviderConfigurationSchema)
    },
    setOllamaEndpoint: async (input: SetOllamaEndpointInput) => {
      const parsed = setOllamaEndpointInputSchema.parse(input)
      return parseResult(await ipcRenderer.invoke(AI_PROVIDER_CHANNELS.setOllamaEndpoint, parsed), aiProviderConfigurationSchema)
    },
    openCredentialPage: async (input: OpenCredentialPageInput) => {
      const parsed = openCredentialPageInputSchema.parse(input)
      return parseResult(await ipcRenderer.invoke(AI_PROVIDER_CHANNELS.openCredentialPage, parsed), z.null())
    },
    openChatGPT: async () => parseResult(await ipcRenderer.invoke(AI_PROVIDER_CHANNELS.openChatGPT), z.null())
  }),
  codex: Object.freeze({
    getStatus: async () => parseResult(await ipcRenderer.invoke(IPC_CHANNELS.codexGetStatus), codexStatusSchema),
    loginChatGPT: async (input: CodexLoginInput) => {
      const parsed = codexLoginInputSchema.parse(input)
      return parseResult(await ipcRenderer.invoke(IPC_CHANNELS.codexLoginChatGPT, parsed), z.null())
    },
    cancelLogin: async (input: CodexCancelLoginInput) => {
      const parsed = codexCancelLoginInputSchema.parse(input)
      return parseResult(await ipcRenderer.invoke(IPC_CHANNELS.codexCancelLogin, parsed), z.null())
    },
    logout: async () => parseResult(await ipcRenderer.invoke(IPC_CHANNELS.codexLogout), z.null()),
    run: async (input: CodexRunInput) => {
      const parsed = codexRunInputSchema.parse(input)
      return parseResult(await ipcRenderer.invoke(IPC_CHANNELS.codexRun, parsed), z.null())
    },
    cancelRun: async (input: CodexCancelRunInput) => {
      const parsed = codexCancelRunInputSchema.parse(input)
      return parseResult(await ipcRenderer.invoke(IPC_CHANNELS.codexCancelRun, parsed), z.null())
    },
    onAuthEvent: (listener: (event: CodexAuthEvent) => void) => {
      const wrapped = (_event: IpcRendererEvent, payload: unknown): void => listener(codexAuthEventSchema.parse(payload))
      ipcRenderer.on(AUTH_EVENT_CHANNEL, wrapped)
      return () => ipcRenderer.removeListener(AUTH_EVENT_CHANNEL, wrapped)
    },
    onRunEvent: (listener: (event: CodexRunEvent) => void) => {
      const wrapped = (_event: IpcRendererEvent, payload: unknown): void => listener(codexRunEventSchema.parse(payload))
      ipcRenderer.on(RUN_EVENT_CHANNEL, wrapped)
      return () => ipcRenderer.removeListener(RUN_EVENT_CHANNEL, wrapped)
    }
  }),
  liveServer: Object.freeze({
    start: async (input: LiveServerStartInput) => {
      const parsed = liveServerStartInputSchema.parse(input)
      return parseResult(await ipcRenderer.invoke(LIVE_SERVER_CHANNELS.start, parsed), z.null())
    },
    stop: async () => parseResult(await ipcRenderer.invoke(LIVE_SERVER_CHANNELS.stop), z.null()),
    getStatus: async () => parseResult(await ipcRenderer.invoke(LIVE_SERVER_CHANNELS.getStatus), liveServerStatusSchema)
  }),
  git: Object.freeze({
    isRepo: async () => parseResult(await ipcRenderer.invoke(IPC_CHANNELS.gitIsRepo), z.boolean()),
    init: async () => parseResult(await ipcRenderer.invoke(IPC_CHANNELS.gitInit), z.null()),
    status: async () => parseResult(await ipcRenderer.invoke(IPC_CHANNELS.gitStatus), gitStatusSchema),
    diff: async () => parseResult(await ipcRenderer.invoke(IPC_CHANNELS.gitDiff), gitDiffSchema),
    add: async (input: GitAddInput) => { const parsed = gitAddInputSchema.parse(input); return parseResult(await ipcRenderer.invoke(IPC_CHANNELS.gitAdd, parsed), z.null()) },
    commit: async (input: GitCommitInput) => { const parsed = gitCommitInputSchema.parse(input); return parseResult(await ipcRenderer.invoke(IPC_CHANNELS.gitCommit, parsed), z.null()) },
    log: async () => parseResult(await ipcRenderer.invoke(IPC_CHANNELS.gitLog), gitCommitLogSchema),
    branch: async () => parseResult(await ipcRenderer.invoke(IPC_CHANNELS.gitBranch), gitBranchSchema),
    checkout: async (input: GitCheckoutInput) => { const parsed = gitCheckoutInputSchema.parse(input); return parseResult(await ipcRenderer.invoke(IPC_CHANNELS.gitCheckout, parsed), z.null()) },
    stash: async () => parseResult(await ipcRenderer.invoke(IPC_CHANNELS.gitStash), z.null()),
    stashPop: async () => parseResult(await ipcRenderer.invoke(IPC_CHANNELS.gitStashPop), z.null()),
    stashList: async () => parseResult(await ipcRenderer.invoke(IPC_CHANNELS.gitStashList), gitStashSchema),
    push: async () => parseResult(await ipcRenderer.invoke(IPC_CHANNELS.gitPush), z.null()),
    pull: async () => parseResult(await ipcRenderer.invoke(IPC_CHANNELS.gitPull), z.null()),
    fetch: async () => parseResult(await ipcRenderer.invoke(IPC_CHANNELS.gitFetch), z.null())
  }),
  search: Object.freeze({
    query: async (input: SearchInput) => { const parsed = searchInputSchema.parse(input); return parseResult(await ipcRenderer.invoke(IPC_CHANNELS.searchQuery, parsed), searchResultSchema) }
  }),
  session: Object.freeze({
    save: async (state: SessionState) => { const parsed = sessionStateSchema.parse(state); return parseResult(await ipcRenderer.invoke(IPC_CHANNELS.sessionSave, parsed), z.null()) },
    load: async (): Promise<Result<SessionState | null>> => parseResult(await ipcRenderer.invoke(IPC_CHANNELS.sessionLoad), sessionStateSchema.nullable()),
    clear: async () => parseResult(await ipcRenderer.invoke(IPC_CHANNELS.sessionClear), z.null())
  }),
  permissions: Object.freeze({
    getPendingRequests: () => [] as PermissionRequest[],
    resolvePermission: () => undefined,
    getHistory: () => ({ approved: [] as string[], denied: [] as string[] }),
    setAutoApprove: () => undefined
  })
})

contextBridge.exposeInMainWorld('kadris', api)
