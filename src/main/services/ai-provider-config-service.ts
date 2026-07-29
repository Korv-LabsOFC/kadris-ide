import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import {
  API_KEY_PROVIDER_IDS,
  aiProviderConfigurationSchema,
  ollamaEndpointSchema,
  type AiProviderConfiguration,
  type ApiKeyProviderId
} from '../../shared/ai-provider-contracts'

const DEFAULT_OLLAMA_ENDPOINT = 'http://127.0.0.1:11434'
const MAX_SETTINGS_BYTES = 128 * 1024

const encryptedKeysSchema = z.object({
  openai: z.string().max(32768).optional(),
  anthropic: z.string().max(32768).optional(),
  google: z.string().max(32768).optional(),
  mistral: z.string().max(32768).optional(),
  openrouter: z.string().max(32768).optional()
}).strict()

const storedSettingsSchema = z.object({
  version: z.literal(1),
  ollamaEndpoint: ollamaEndpointSchema,
  encryptedApiKeys: encryptedKeysSchema
}).strict()

type StoredSettings = z.infer<typeof storedSettingsSchema>

export interface SecureStorageAdapter {
  isEncryptionAvailable: () => boolean
  encryptString: (plainText: string) => Buffer
  getSelectedStorageBackend: () => string
}

function emptySettings(): StoredSettings {
  return { version: 1, ollamaEndpoint: DEFAULT_OLLAMA_ENDPOINT, encryptedApiKeys: {} }
}

export class AiProviderConfigService {
  readonly #settingsPath: string
  #pending: Promise<void> = Promise.resolve()

  constructor(
    userDataPath: string,
    private readonly secureStorage: SecureStorageAdapter,
    private readonly platform = process.platform
  ) {
    this.#settingsPath = join(userDataPath, 'ai-provider-settings.v1.json')
  }

  getConfiguration(): Promise<AiProviderConfiguration> {
    return this.#serialize(async () => this.#snapshot(await this.#read()))
  }

  saveApiKey(providerId: ApiKeyProviderId, apiKey: string): Promise<AiProviderConfiguration> {
    return this.#serialize(async () => {
      if (!this.#secureStorageAvailable()) throw new Error('Secure credential storage is unavailable')
      const encrypted = this.secureStorage.encryptString(apiKey).toString('base64')
      const settings = await this.#read()
      settings.encryptedApiKeys[providerId] = encrypted
      await this.#write(settings)
      return this.#snapshot(settings)
    })
  }

  removeApiKey(providerId: ApiKeyProviderId): Promise<AiProviderConfiguration> {
    return this.#serialize(async () => {
      const settings = await this.#read()
      delete settings.encryptedApiKeys[providerId]
      await this.#write(settings)
      return this.#snapshot(settings)
    })
  }

  setOllamaEndpoint(endpoint: string): Promise<AiProviderConfiguration> {
    return this.#serialize(async () => {
      const settings = await this.#read()
      settings.ollamaEndpoint = endpoint
      await this.#write(settings)
      return this.#snapshot(settings)
    })
  }

  #secureStorageAvailable(): boolean {
    try {
      if (!this.secureStorage.isEncryptionAvailable()) return false
      if (this.platform !== 'linux') return true
      return !['basic_text', 'unknown'].includes(this.secureStorage.getSelectedStorageBackend())
    } catch {
      return false
    }
  }

  #snapshot(settings: StoredSettings): AiProviderConfiguration {
    return aiProviderConfigurationSchema.parse({
      secureStorageAvailable: this.#secureStorageAvailable(),
      providers: [
        ...API_KEY_PROVIDER_IDS.map((id) => ({ id, kind: 'api-key' as const, hasCredential: Boolean(settings.encryptedApiKeys[id]) })),
        { id: 'ollama' as const, kind: 'local' as const, endpoint: settings.ollamaEndpoint }
      ]
    })
  }

  async #read(): Promise<StoredSettings> {
    try {
      const metadata = await stat(this.#settingsPath)
      if (metadata.size > MAX_SETTINGS_BYTES) throw new Error('Provider settings exceed the size limit')
      return storedSettingsSchema.parse(JSON.parse(await readFile(this.#settingsPath, 'utf8')))
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return emptySettings()
      throw error
    }
  }

  async #write(settings: StoredSettings): Promise<void> {
    const serialized = JSON.stringify(storedSettingsSchema.parse(settings))
    if (Buffer.byteLength(serialized, 'utf8') > MAX_SETTINGS_BYTES) throw new Error('Provider settings exceed the size limit')
    const temporaryPath = `${this.#settingsPath}.${process.pid}.${Date.now()}.tmp`
    await mkdir(join(this.#settingsPath, '..'), { recursive: true, mode: 0o700 })
    try {
      await writeFile(temporaryPath, serialized, { encoding: 'utf8', mode: 0o600 })
      await rename(temporaryPath, this.#settingsPath)
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  }

  #serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#pending.then(operation, operation)
    this.#pending = result.then(() => undefined, () => undefined)
    return result
  }
}
