import { ipcMain } from 'electron'
import {
  LIVE_SERVER_CHANNELS,
  liveServerStartInputSchema,
  liveServerStatusSchema
} from '../../shared/live-server-contracts'
import type { LiveServerService } from '../services/live-server-service'
import { safeHandler } from './register-ipc'
import type { WorkspaceService } from '../services/workspace-service'

export function registerLiveServerIpc(
  liveServerService: LiveServerService,
  workspaceService: WorkspaceService,
  isTrustedSender: (event: Electron.IpcMainInvokeEvent) => boolean
): () => void {
  ipcMain.handle(LIVE_SERVER_CHANNELS.start, safeHandler(async (_event, input) => {
    const parsed = liveServerStartInputSchema.parse(input)
    const root = workspaceService.getRoot()
    if (!root) throw new Error('No workspace is open')
    await liveServerService.start(parsed.filePath, root)
    await liveServerService.openInBrowser()
    return null
  }, isTrustedSender))

  ipcMain.handle(LIVE_SERVER_CHANNELS.stop, safeHandler(() => {
    liveServerService.stop()
    return null
  }, isTrustedSender))

  ipcMain.handle(LIVE_SERVER_CHANNELS.getStatus, safeHandler(() => {
    return liveServerStatusSchema.parse(liveServerService.getStatus())
  }, isTrustedSender))

  return () => {
    for (const channel of Object.values(LIVE_SERVER_CHANNELS)) ipcMain.removeHandler(channel)
  }
}
