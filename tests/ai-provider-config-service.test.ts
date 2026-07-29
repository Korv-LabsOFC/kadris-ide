import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AiProviderConfigService, type SecureStorageAdapter } from '../src/main/services/ai-provider-config-service'

const temporaryDirectories: string[] = []

async function createDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'kadris-provider-test-'))
  temporaryDirectories.push(directory)
  return directory
}

function storage(backend = 'gnome_libsecret'): SecureStorageAdapter {
  return {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => backend,
    encryptString: (plainText) => Buffer.from(`cipher:${Buffer.from(plainText).toString('hex')}`)
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('AI provider configuration storage', () => {
  it('stores only ciphertext and returns credential presence', async () => {
    const directory = await createDirectory()
    const service = new AiProviderConfigService(directory, storage(), 'linux')
    const configuration = await service.saveApiKey('openai', 'plain-secret-value')
    const persisted = await readFile(join(directory, 'ai-provider-settings.v1.json'), 'utf8')

    expect(persisted).not.toContain('plain-secret-value')
    expect(configuration.providers.find((provider) => provider.id === 'openai')).toEqual({ id: 'openai', kind: 'api-key', hasCredential: true })
    expect(JSON.stringify(configuration)).not.toContain('plain-secret-value')
  })

  it('serializes concurrent provider updates without losing credentials', async () => {
    const directory = await createDirectory()
    const service = new AiProviderConfigService(directory, storage(), 'linux')
    await Promise.all([service.saveApiKey('openai', 'first'), service.saveApiKey('anthropic', 'second')])
    const configuration = await service.getConfiguration()

    expect(configuration.providers.find((provider) => provider.id === 'openai')).toMatchObject({ hasCredential: true })
    expect(configuration.providers.find((provider) => provider.id === 'anthropic')).toMatchObject({ hasCredential: true })
  })

  it('rejects plaintext Linux storage without modifying disk', async () => {
    const directory = await createDirectory()
    const service = new AiProviderConfigService(directory, storage('basic_text'), 'linux')

    await expect(service.saveApiKey('openai', 'secret')).rejects.toThrow('unavailable')
    await expect(readFile(join(directory, 'ai-provider-settings.v1.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(service.getConfiguration()).resolves.toMatchObject({ secureStorageAvailable: false })
  })

  it('fails closed when persisted settings are corrupt', async () => {
    const directory = await createDirectory()
    await writeFile(join(directory, 'ai-provider-settings.v1.json'), '{"version":2,"encryptedApiKeys":{}}', 'utf8')
    const service = new AiProviderConfigService(directory, storage(), 'linux')
    await expect(service.getConfiguration()).rejects.toThrow()
  })
})
