import { z } from 'zod'
import type {
  TerminalCloseInput,
  TerminalCreateInput,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalInfo,
  TerminalResizeInput,
  TerminalWriteInput
} from './terminal-contracts'
import type {
  AiProviderConfiguration,
  OpenCredentialPageInput,
  RemoveApiKeyInput,
  SaveApiKeyInput,
  SetOllamaEndpointInput
} from './ai-provider-contracts'

export const IPC_CHANNELS = {
  appGetInfo: 'app:get-info:v1',
  workspaceGetCurrent: 'workspace:get-current:v1',
  workspaceChoose: 'workspace:choose:v1',
  workspaceList: 'workspace:list-directory:v1',
  workspaceReadFile: 'workspace:read-file:v1',
  workspaceCreateFile: 'workspace:create-file:v1',
  workspaceCreateFolder: 'workspace:create-folder:v1',
  workspaceSaveFile: 'workspace:save-file:v1',
  workspaceRename: 'workspace:rename:v1',
  workspaceDelete: 'workspace:delete:v1',
  workspaceReadBinaryFile: 'workspace:read-binary:v1',
  codexGetStatus: 'codex:get-status:v1',
  codexLoginChatGPT: 'codex:login-chatgpt:v1',
  codexCancelLogin: 'codex:cancel-login:v1',
  codexLogout: 'codex:logout:v1',
  codexRun: 'codex:run:v1',
  codexCancelRun: 'codex:cancel-run:v1'
} as const

export const errorSchema = z.object({
  code: z.enum(['INVALID_INPUT', 'NOT_FOUND', 'NOT_AUTHORIZED', 'IO_ERROR', 'INTERNAL_ERROR', 'UNSUPPORTED', 'TIMEOUT', 'RATE_LIMITED']),
  message: z.string().max(500)
})

export type AppError = z.infer<typeof errorSchema>
export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError }

export const appInfoSchema = z.object({
  name: z.string().max(80),
  version: z.string().max(40),
  platform: z.enum(['linux', 'win32', 'darwin', 'android', 'web'])
})

export const workspaceSchema = z.object({
  name: z.string().min(1).max(255),
  path: z.string().min(1).max(4096)
})

export const listDirectoryInputSchema = z.object({
  relativePath: z.string().max(4096).default('')
}).strict()

export const workspaceEntrySchema = z.object({
  name: z.string().min(1).max(255),
  relativePath: z.string().max(4096),
  kind: z.enum(['file', 'directory', 'symbolic-link'])
})

export const workspaceEntriesSchema = z.array(workspaceEntrySchema).max(5000)

export const readWorkspaceFileInputSchema = z.object({
  relativePath: z.string().min(1).max(4096)
}).strict()

export const workspaceDocumentSchema = z.object({
  name: z.string().min(1).max(255),
  relativePath: z.string().min(1).max(4096),
  content: z.string().max(2 * 1024 * 1024)
}).strict()

export const createFileInputSchema = z.object({
  relativePath: z.string().min(1).max(4096),
  content: z.string().max(2 * 1024 * 1024)
}).strict()

export const createFolderInputSchema = z.object({
  relativePath: z.string().min(1).max(4096)
}).strict()

export const saveFileInputSchema = z.object({
  relativePath: z.string().min(1).max(4096),
  content: z.string().max(2 * 1024 * 1024)
}).strict()

export const renameInputSchema = z.object({
  oldPath: z.string().min(1).max(4096),
  newPath: z.string().min(1).max(4096)
}).strict()

export const deleteInputSchema = z.object({
  relativePath: z.string().min(1).max(4096)
}).strict()

export const readBinaryFileInputSchema = z.object({
  relativePath: z.string().min(1).max(4096)
}).strict()

export const workspaceBinaryDocumentSchema = z.object({
  name: z.string().min(1).max(255),
  relativePath: z.string().min(1).max(4096),
  dataUrl: z.string().max(10 * 1024 * 1024)
}).strict()

export const codexPlanSchema = z.enum([
  'free', 'go', 'plus', 'pro', 'prolite',
  'team', 'business', 'enterprise', 'edu', 'unknown'
])

export const codexCliStatusSchema = z.object({
  state: z.enum(['notFound', 'unsupported', 'ready', 'unavailable']),
  version: z.string().nullable()
}).strict()

export const codexAccountSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('apiKey') }).strict(),
  z.object({
    type: z.literal('chatgpt'),
    email: z.string().nullable(),
    planType: codexPlanSchema
  }).strict(),
  z.object({ type: z.literal('amazonBedrock') }).strict()
]).nullable()

export const codexStatusSchema = z.object({
  cli: codexCliStatusSchema,
  account: codexAccountSchema,
  requiresOpenaiAuth: z.boolean().nullable()
}).strict()

export const codexLoginInputSchema = z.object({}).strict()

export const codexCancelLoginInputSchema = z.object({
  loginId: z.string().uuid()
}).strict()

export const codexRunInputSchema = z.object({
  runId: z.string().uuid(),
  prompt: z.string().min(1).max(12288)
}).strict()

export const codexCancelRunInputSchema = z.object({
  runId: z.string().uuid()
}).strict()

export const codexRunEventSchema = z.discriminatedUnion('type', [
  z.object({
    runId: z.string().uuid(),
    type: z.literal('started')
  }).strict(),
  z.object({
    runId: z.string().uuid(),
    type: z.literal('completed'),
    text: z.string().max(262144)
  }).strict(),
  z.object({
    runId: z.string().uuid(),
    type: z.literal('failed'),
    code: z.enum([
      'CLI_UNAVAILABLE', 'NOT_AUTHENTICATED', 'BUSY', 'TIMEOUT',
      'OUTPUT_LIMIT', 'PROTOCOL_ERROR', 'PROCESS_FAILED'
    ]),
    message: z.string().max(300)
  }).strict(),
  z.object({
    runId: z.string().uuid(),
    type: z.literal('cancelled')
  }).strict()
])

export const codexAuthEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('statusChanged'),
    status: codexStatusSchema
  }).strict(),
  z.object({
    type: z.literal('loginFinished'),
    loginId: z.string().uuid(),
    outcome: z.enum(['succeeded', 'failed', 'cancelled']),
    message: z.string().max(300).optional()
  }).strict()
])

export type AppInfo = z.infer<typeof appInfoSchema>
export type Workspace = z.infer<typeof workspaceSchema>
export type ListDirectoryInput = z.infer<typeof listDirectoryInputSchema>
export type WorkspaceEntry = z.infer<typeof workspaceEntrySchema>
export type ReadWorkspaceFileInput = z.infer<typeof readWorkspaceFileInputSchema>
export type WorkspaceDocument = z.infer<typeof workspaceDocumentSchema>
export type CreateFileInput = z.infer<typeof createFileInputSchema>
export type CreateFolderInput = z.infer<typeof createFolderInputSchema>
export type SaveFileInput = z.infer<typeof saveFileInputSchema>
export type RenameInput = z.infer<typeof renameInputSchema>
export type DeleteInput = z.infer<typeof deleteInputSchema>
export type ReadBinaryFileInput = z.infer<typeof readBinaryFileInputSchema>
export type WorkspaceBinaryDocument = z.infer<typeof workspaceBinaryDocumentSchema>
export type CodexPlan = z.infer<typeof codexPlanSchema>
export type CodexCliStatus = z.infer<typeof codexCliStatusSchema>
export type CodexAccount = z.infer<typeof codexAccountSchema>
export type CodexStatus = z.infer<typeof codexStatusSchema>
export type CodexLoginInput = z.infer<typeof codexLoginInputSchema>
export type CodexCancelLoginInput = z.infer<typeof codexCancelLoginInputSchema>
export type CodexRunInput = z.infer<typeof codexRunInputSchema>
export type CodexCancelRunInput = z.infer<typeof codexCancelRunInputSchema>
export type CodexRunEvent = z.infer<typeof codexRunEventSchema>
export type CodexAuthEvent = z.infer<typeof codexAuthEventSchema>

export type PlatformRuntime = 'electron' | 'web-termux' | 'web-local'

export interface PlatformCapabilities {
  terminal: boolean
  agent: boolean
  secureCredentials: boolean
  liveServer: boolean
  nativeDialogs: boolean
}

export interface PlatformBridge {
  runtime: PlatformRuntime
  capabilities: PlatformCapabilities
  app: { getInfo: () => Promise<Result<AppInfo>> }
  workspace: {
    getCurrent: () => Promise<Result<Workspace | null>>
    choose: () => Promise<Result<Workspace | null>>
    listDirectory: (input: ListDirectoryInput) => Promise<Result<WorkspaceEntry[]>>
    readFile: (input: ReadWorkspaceFileInput) => Promise<Result<WorkspaceDocument>>
    readBinaryFile: (input: ReadBinaryFileInput) => Promise<Result<WorkspaceBinaryDocument>>
    createFile: (input: CreateFileInput) => Promise<Result<WorkspaceEntry>>
    createFolder: (input: CreateFolderInput) => Promise<Result<WorkspaceEntry>>
    saveFile: (input: SaveFileInput) => Promise<Result<null>>
    rename: (input: RenameInput) => Promise<Result<WorkspaceEntry>>
    delete: (input: DeleteInput) => Promise<Result<null>>
  }
  terminal: {
    create: (input: TerminalCreateInput) => Promise<Result<TerminalInfo>>
    write: (input: TerminalWriteInput) => Promise<Result<null>>
    resize: (input: TerminalResizeInput) => Promise<Result<null>>
    close: (input: TerminalCloseInput) => Promise<Result<null>>
    onData: (listener: (event: TerminalDataEvent) => void) => () => void
    onExit: (listener: (event: TerminalExitEvent) => void) => () => void
  }
  aiProviders: {
    getConfiguration: () => Promise<Result<AiProviderConfiguration>>
    saveApiKey: (input: SaveApiKeyInput) => Promise<Result<AiProviderConfiguration>>
    removeApiKey: (input: RemoveApiKeyInput) => Promise<Result<AiProviderConfiguration>>
    setOllamaEndpoint: (input: SetOllamaEndpointInput) => Promise<Result<AiProviderConfiguration>>
    openCredentialPage: (input: OpenCredentialPageInput) => Promise<Result<null>>
    openChatGPT: () => Promise<Result<null>>
  }
  codex: {
    getStatus: () => Promise<Result<CodexStatus>>
    loginChatGPT: (input: CodexLoginInput) => Promise<Result<null>>
    cancelLogin: (input: CodexCancelLoginInput) => Promise<Result<null>>
    logout: () => Promise<Result<null>>
    run: (input: CodexRunInput) => Promise<Result<null>>
    cancelRun: (input: CodexCancelRunInput) => Promise<Result<null>>
    onAuthEvent: (listener: (event: CodexAuthEvent) => void) => () => void
    onRunEvent: (listener: (event: CodexRunEvent) => void) => () => void
  }
  liveServer: {
    start: (input: { filePath: string }) => Promise<Result<null>>
    stop: () => Promise<Result<null>>
    getStatus: () => Promise<Result<{ running: boolean; url: string | null; filePath: string | null }>>
  }
}

export type KadrisDesktopApi = PlatformBridge
