import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { safeHandler } from './register-ipc'
import { IPC_CHANNELS } from '../../shared/contracts'
import { sessionStateSchema } from '../../shared/session-contracts'
import type { SessionService } from '../services/session-service'

export function registerSessionIpc(getSessionService: () => SessionService | null, isTrustedSender: (event: IpcMainInvokeEvent) => boolean): () => void {
  const channels = [IPC_CHANNELS.sessionSave, IPC_CHANNELS.sessionLoad, IPC_CHANNELS.sessionClear]

  ipcMain.handle(IPC_CHANNELS.sessionSave, safeHandler(async (_event, input) => {
    const parsed = sessionStateSchema.parse(input)
    const session = getSessionService()
    if (!session) throw new Error('No workspace is open')
    await session.save(parsed)
    return null
  }, isTrustedSender))

  ipcMain.handle(IPC_CHANNELS.sessionLoad, safeHandler(async () => {
    const session = getSessionService()
    if (!session) return null
    return session.load()
  }, isTrustedSender))

  ipcMain.handle(IPC_CHANNELS.sessionClear, safeHandler(async () => {
    const session = getSessionService()
    if (!session) throw new Error('No workspace is open')
    await session.clear()
    return null
  }, isTrustedSender))

  return () => { for (const channel of channels) ipcMain.removeHandler(channel) }
}
