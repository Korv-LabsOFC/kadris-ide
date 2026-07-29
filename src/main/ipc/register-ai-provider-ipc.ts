import { ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import {
  AI_PROVIDER_CHANNELS,
  aiProviderConfigurationSchema,
  openCredentialPageInputSchema,
  removeApiKeyInputSchema,
  saveApiKeyInputSchema,
  setOllamaEndpointInputSchema
} from '../../shared/ai-provider-contracts'
import { getOfficialChatGPTPage, getOfficialCredentialPage } from '../security/official-provider-links'
import type { AiProviderConfigService } from '../services/ai-provider-config-service'
import { safeHandler } from './register-ipc'

async function protectStorageDetails<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch {
    throw new Error('Provider settings operation failed')
  }
}

export function registerAiProviderIpc(
  service: AiProviderConfigService,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean,
  openExternal: (url: string) => Promise<void> = (url) => shell.openExternal(url)
): () => void {
  ipcMain.handle(AI_PROVIDER_CHANNELS.getConfiguration, safeHandler(async () => (
    aiProviderConfigurationSchema.parse(await protectStorageDetails(() => service.getConfiguration()))
  ), isTrustedSender))

  ipcMain.handle(AI_PROVIDER_CHANNELS.saveApiKey, safeHandler(async (_event, input) => {
    const parsed = saveApiKeyInputSchema.parse(input)
    return aiProviderConfigurationSchema.parse(await protectStorageDetails(() => service.saveApiKey(parsed.providerId, parsed.apiKey)))
  }, isTrustedSender))

  ipcMain.handle(AI_PROVIDER_CHANNELS.removeApiKey, safeHandler(async (_event, input) => {
    const parsed = removeApiKeyInputSchema.parse(input)
    return aiProviderConfigurationSchema.parse(await protectStorageDetails(() => service.removeApiKey(parsed.providerId)))
  }, isTrustedSender))

  ipcMain.handle(AI_PROVIDER_CHANNELS.setOllamaEndpoint, safeHandler(async (_event, input) => {
    const parsed = setOllamaEndpointInputSchema.parse(input)
    return aiProviderConfigurationSchema.parse(await protectStorageDetails(() => service.setOllamaEndpoint(parsed.endpoint)))
  }, isTrustedSender))

  ipcMain.handle(AI_PROVIDER_CHANNELS.openCredentialPage, safeHandler(async (_event, input) => {
    const parsed = openCredentialPageInputSchema.parse(input)
    await protectStorageDetails(() => openExternal(getOfficialCredentialPage(parsed.providerId)))
    return null
  }, isTrustedSender))

  ipcMain.handle(AI_PROVIDER_CHANNELS.openChatGPT, safeHandler(async () => {
    await protectStorageDetails(() => openExternal(getOfficialChatGPTPage()))
    return null
  }, isTrustedSender))

  return () => {
    for (const channel of Object.values(AI_PROVIDER_CHANNELS)) ipcMain.removeHandler(channel)
  }
}
