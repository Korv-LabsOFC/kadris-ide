import type { ApiKeyProviderId } from '../../shared/ai-provider-contracts'

const credentialPages: Record<ApiKeyProviderId, string> = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  google: 'https://aistudio.google.com/app/apikey',
  mistral: 'https://console.mistral.ai/api-keys/',
  openrouter: 'https://openrouter.ai/settings/keys'
}

export function getOfficialCredentialPage(providerId: ApiKeyProviderId): string {
  const page = credentialPages[providerId]
  if (!page) throw new Error('Unknown credential provider')
  return page
}

export function getOfficialChatGPTPage(): string {
  return 'https://chatgpt.com/'
}
