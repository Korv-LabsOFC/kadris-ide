import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  TERMINAL_CHANNELS,
  terminalCloseInputSchema,
  terminalCreateInputSchema,
  terminalInfoSchema,
  terminalResizeInputSchema,
  terminalWriteInputSchema
} from '../../shared/terminal-contracts'
import type { TerminalService } from '../services/terminal-service'
import { safeHandler } from './register-ipc'

export function registerTerminalIpc(terminalService: TerminalService, isTrustedSender: (event: IpcMainInvokeEvent) => boolean): () => void {
  ipcMain.handle(TERMINAL_CHANNELS.create, safeHandler(async (_event, input) => {
    const parsed = terminalCreateInputSchema.parse(input)
    return terminalInfoSchema.parse(await terminalService.create(parsed))
  }, isTrustedSender))

  ipcMain.handle(TERMINAL_CHANNELS.write, safeHandler((_event, input) => {
    const parsed = terminalWriteInputSchema.parse(input)
    terminalService.write(parsed.terminalId, parsed.data)
    return null
  }, isTrustedSender))

  ipcMain.handle(TERMINAL_CHANNELS.resize, safeHandler((_event, input) => {
    const parsed = terminalResizeInputSchema.parse(input)
    terminalService.resize(parsed.terminalId, parsed.cols, parsed.rows)
    return null
  }, isTrustedSender))

  ipcMain.handle(TERMINAL_CHANNELS.close, safeHandler((_event, input) => {
    const parsed = terminalCloseInputSchema.parse(input)
    terminalService.close(parsed.terminalId)
    return null
  }, isTrustedSender))

  return () => {
    for (const channel of [TERMINAL_CHANNELS.create, TERMINAL_CHANNELS.write, TERMINAL_CHANNELS.resize, TERMINAL_CHANNELS.close]) ipcMain.removeHandler(channel)
  }
}
