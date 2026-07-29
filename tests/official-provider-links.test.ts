import { describe, expect, it } from 'vitest'
import type { ApiKeyProviderId } from '../src/shared/ai-provider-contracts'
import { getOfficialChatGPTPage, getOfficialCredentialPage } from '../src/main/security/official-provider-links'

describe('official provider links', () => {
  it('maps providers to fixed HTTPS credential pages', () => {
    expect(getOfficialCredentialPage('openai')).toBe('https://platform.openai.com/api-keys')
    expect(getOfficialCredentialPage('anthropic')).toBe('https://console.anthropic.com/settings/keys')
    expect(getOfficialCredentialPage('google')).toBe('https://aistudio.google.com/app/apikey')
  })

  it('rejects unknown providers at runtime', () => {
    expect(() => getOfficialCredentialPage('https://evil.example' as ApiKeyProviderId)).toThrow('Unknown credential provider')
  })

  it('opens ChatGPT only at its fixed official origin', () => {
    expect(getOfficialChatGPTPage()).toBe('https://chatgpt.com/')
  })
})
