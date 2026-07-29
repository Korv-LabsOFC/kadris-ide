import { describe, expect, it } from 'vitest'
import {
  aiProviderConfigurationSchema,
  saveApiKeyInputSchema,
  setOllamaEndpointInputSchema
} from '../src/shared/ai-provider-contracts'

describe('AI provider contracts', () => {
  it('validates API keys without accepting control characters or unknown fields', () => {
    expect(saveApiKeyInputSchema.parse({ providerId: 'openai', apiKey: 'sk-example' })).toEqual({ providerId: 'openai', apiKey: 'sk-example' })
    expect(() => saveApiKeyInputSchema.parse({ providerId: 'openai', apiKey: ' key ' })).toThrow()
    expect(() => saveApiKeyInputSchema.parse({ providerId: 'openai', apiKey: 'key\nvalue' })).toThrow()
    expect(() => saveApiKeyInputSchema.parse({ providerId: 'unknown', apiKey: 'key' })).toThrow()
    expect(() => saveApiKeyInputSchema.parse({ providerId: 'openai', apiKey: 'key', endpoint: 'https://evil.example' })).toThrow()
  })

  it('allows only normalized loopback Ollama endpoints', () => {
    expect(setOllamaEndpointInputSchema.parse({ endpoint: 'http://localhost:11434/' })).toEqual({ endpoint: 'http://127.0.0.1:11434' })
    expect(setOllamaEndpointInputSchema.parse({ endpoint: 'https://[::1]:11434' })).toEqual({ endpoint: 'https://[::1]:11434' })
    for (const endpoint of ['http://example.com', 'http://127.0.0.1/admin', 'http://user@127.0.0.1', 'file:///tmp/socket']) {
      expect(() => setOllamaEndpointInputSchema.parse({ endpoint })).toThrow()
    }
  })

  it('rejects secret-bearing configuration responses', () => {
    expect(() => aiProviderConfigurationSchema.parse({
      secureStorageAvailable: true,
      providers: [{ id: 'openai', kind: 'api-key', hasCredential: true, apiKey: 'secret' }]
    })).toThrow()
  })
})
