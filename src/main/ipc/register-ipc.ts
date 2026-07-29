import { basename } from 'node:path'
import { app, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import {
  IPC_CHANNELS,
  appInfoSchema,
  createFileInputSchema,
  createFolderInputSchema,
  deleteInputSchema,
  listDirectoryInputSchema,
  readWorkspaceFileInputSchema,
  readBinaryFileInputSchema,
  renameInputSchema,
  saveFileInputSchema,
  workspaceEntriesSchema,
  workspaceEntrySchema,
  workspaceDocumentSchema,
  workspaceBinaryDocumentSchema,
  workspaceSchema,
  type Result
} from '../../shared/contracts'
import type { WorkspaceService } from '../services/workspace-service'

const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024 + 16 * 1024

function validatePayloadSize(value: unknown): void {
  if (Buffer.byteLength(JSON.stringify(value ?? null), 'utf8') > MAX_PAYLOAD_BYTES) {
    throw new Error('IPC payload limit exceeded')
  }
}

export function safeHandler<T>(handler: (event: IpcMainInvokeEvent, input: unknown) => Promise<T> | T, isTrustedSender: (event: IpcMainInvokeEvent) => boolean) {
  return async (event: IpcMainInvokeEvent, input?: unknown): Promise<Result<T>> => {
    try {
      if (!isTrustedSender(event)) {
        return { ok: false, error: { code: 'NOT_AUTHORIZED', message: 'Untrusted IPC sender' } }
      }
      validatePayloadSize(input)
      return { ok: true, value: await handler(event, input) }
    } catch (error) {
      const nodeCode = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
      const policyFailure = error instanceof Error && /absolute paths|escapes workspace|payload limit|entry limit|result size limit|file size limit|not a directory|not a regular file|binary files|UTF-8 text/i.test(error.message)
      const code = error instanceof z.ZodError || policyFailure
        ? 'INVALID_INPUT'
        : nodeCode === 'ENOENT'
          ? 'NOT_FOUND'
          : nodeCode === 'EACCES' || nodeCode === 'EPERM'
            ? 'NOT_AUTHORIZED'
            : 'IO_ERROR'
      return {
        ok: false,
        error: {
          code,
          message: error instanceof Error ? error.message.slice(0, 500) : 'Unknown operation failure'
        }
      }
    }
  }
}

export function registerIpc(workspaceService: WorkspaceService, isTrustedSender: (event: IpcMainInvokeEvent) => boolean): () => void {
  ipcMain.handle(IPC_CHANNELS.appGetInfo, safeHandler(
    () => appInfoSchema.parse({ name: app.getName(), version: app.getVersion(), platform: process.platform }),
    isTrustedSender
  ))

  ipcMain.handle(IPC_CHANNELS.workspaceChoose, safeHandler(async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Open workspace' })
    if (result.canceled || !result.filePaths[0]) return null
    return workspaceSchema.parse(await workspaceService.setRoot(result.filePaths[0]))
  }, isTrustedSender))

  ipcMain.handle(IPC_CHANNELS.workspaceGetCurrent, safeHandler(() => {
    const root = workspaceService.getRoot()
    return root ? workspaceSchema.parse({ name: basename(root) || root, path: root }) : null
  }, isTrustedSender))

  ipcMain.handle(IPC_CHANNELS.workspaceList, safeHandler(async (_event, input) => {
    const parsed = listDirectoryInputSchema.parse(input)
    return workspaceEntriesSchema.parse(await workspaceService.listDirectory(parsed.relativePath))
  }, isTrustedSender))

  ipcMain.handle(IPC_CHANNELS.workspaceReadFile, safeHandler(async (_event, input) => {
    const parsed = readWorkspaceFileInputSchema.parse(input)
    return workspaceDocumentSchema.parse(await workspaceService.readFile(parsed.relativePath))
  }, isTrustedSender))

  ipcMain.handle(IPC_CHANNELS.workspaceReadBinaryFile, safeHandler(async (_event, input) => {
    const parsed = readBinaryFileInputSchema.parse(input)
    return workspaceBinaryDocumentSchema.parse(await workspaceService.readBinaryFile(parsed.relativePath))
  }, isTrustedSender))

  ipcMain.handle(IPC_CHANNELS.workspaceCreateFile, safeHandler(async (_event, input) => {
    const parsed = createFileInputSchema.parse(input)
    return workspaceEntrySchema.parse(await workspaceService.createFile(parsed.relativePath, parsed.content))
  }, isTrustedSender))

  ipcMain.handle(IPC_CHANNELS.workspaceCreateFolder, safeHandler(async (_event, input) => {
    const parsed = createFolderInputSchema.parse(input)
    return workspaceEntrySchema.parse(await workspaceService.createFolder(parsed.relativePath))
  }, isTrustedSender))

  ipcMain.handle(IPC_CHANNELS.workspaceSaveFile, safeHandler(async (_event, input) => {
    const parsed = saveFileInputSchema.parse(input)
    await workspaceService.saveFile(parsed.relativePath, parsed.content)
    return null
  }, isTrustedSender))

  ipcMain.handle(IPC_CHANNELS.workspaceRename, safeHandler(async (_event, input) => {
    const parsed = renameInputSchema.parse(input)
    return workspaceEntrySchema.parse(await workspaceService.renameEntry(parsed.oldPath, parsed.newPath))
  }, isTrustedSender))

  ipcMain.handle(IPC_CHANNELS.workspaceDelete, safeHandler(async (_event, input) => {
    const parsed = deleteInputSchema.parse(input)
    await workspaceService.deleteEntry(parsed.relativePath)
    return null
  }, isTrustedSender))

  return () => {
    for (const channel of Object.values(IPC_CHANNELS)) ipcMain.removeHandler(channel)
  }
}
