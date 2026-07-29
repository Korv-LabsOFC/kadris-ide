import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { safeHandler } from './register-ipc'
import { IPC_CHANNELS } from '../../shared/contracts'
import type { SearchService } from '../services/search-service'
import { searchInputSchema, searchResultSchema } from '../../shared/search-contracts'

export function registerSearchIpc(getSearchService: () => SearchService | null, isTrustedSender: (event: IpcMainInvokeEvent) => boolean): () => void {
  ipcMain.handle(IPC_CHANNELS.searchQuery, safeHandler(async (_event, input) => {
    const parsed = searchInputSchema.parse(input)
    const searchService = getSearchService()
    if (!searchService) throw new Error('No workspace is open')
    return searchResultSchema.parse(await searchService.search(parsed))
  }, isTrustedSender))

  return () => { ipcMain.removeHandler(IPC_CHANNELS.searchQuery) }
}
