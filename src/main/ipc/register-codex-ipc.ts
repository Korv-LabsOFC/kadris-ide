import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  IPC_CHANNELS,
  codexCancelLoginInputSchema,
  codexCancelRunInputSchema,
  codexRunInputSchema,
  codexStatusSchema
} from '../../shared/contracts'
import type { CodexService } from '../services/codex-service'
import { safeHandler } from './register-ipc'

const AUTH_EVENT_CHANNEL = 'codex:auth-event:v1'
const RUN_EVENT_CHANNEL = 'codex:run-event:v1'

export function registerCodexIpc(
  codexService: CodexService,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean,
  webContents: () => Electron.WebContents | null,
  getWorkspaceRoot: () => string | null
): () => void {
  ipcMain.handle(IPC_CHANNELS.codexGetStatus, safeHandler(async () => {
    const result = await codexService.fetchStatus()
    return codexStatusSchema.parse(result)
  }, isTrustedSender))

  ipcMain.handle(IPC_CHANNELS.codexLoginChatGPT, safeHandler(async () => {
    await codexService.loginChatGPT()
    return null
  }, isTrustedSender))

  ipcMain.handle(IPC_CHANNELS.codexCancelLogin, safeHandler(async (_event, input) => {
    const parsed = codexCancelLoginInputSchema.parse(input)
    await codexService.cancelLogin(parsed.loginId)
    return null
  }, isTrustedSender))

  ipcMain.handle(IPC_CHANNELS.codexLogout, safeHandler(async () => {
    await codexService.logout()
    return null
  }, isTrustedSender))

  ipcMain.handle(IPC_CHANNELS.codexRun, safeHandler((_event, input) => {
    const parsed = codexRunInputSchema.parse(input)
    const workspaceRoot = getWorkspaceRoot()
    if (!workspaceRoot) throw new Error('No workspace open')
    codexService.run(parsed.runId, parsed.prompt, workspaceRoot)
    return null
  }, isTrustedSender))

  ipcMain.handle(IPC_CHANNELS.codexCancelRun, safeHandler((_event, input) => {
    const parsed = codexCancelRunInputSchema.parse(input)
    codexService.cancelRun(parsed.runId)
    return null
  }, isTrustedSender))

  const removeAuthListener = codexService.addAuthListener((event) => {
    webContents()?.send(AUTH_EVENT_CHANNEL, event)
  })
  const removeRunListener = codexService.addRunListener((event) => {
    webContents()?.send(RUN_EVENT_CHANNEL, event)
  })

  return () => {
    removeAuthListener()
    removeRunListener()
    for (const channel of Object.values(IPC_CHANNELS)) ipcMain.removeHandler(channel)
  }
}
