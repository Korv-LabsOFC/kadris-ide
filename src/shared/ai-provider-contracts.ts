import { z } from 'zod'

export const AI_PROVIDER_CHANNELS = {
  getConfiguration: 'ai-provider:get-configuration:v1',
  saveApiKey: 'ai-provider:save-api-key:v1',
  removeApiKey: 'ai-provider:remove-api-key:v1',
  setOllamaEndpoint: 'ai-provider:set-ollama-endpoint:v1',
  openCredentialPage: 'ai-provider:open-credential-page:v1',
  openChatGPT: 'ai-provider:open-chatgpt:v1'
} as const

export const API_KEY_PROVIDER_IDS = ['openai', 'anthropic', 'google', 'mistral', 'openrouter'] as const
export const apiKeyProviderIdSchema = z.enum(API_KEY_PROVIDER_IDS)

export const apiKeySchema = z.string().min(1).max(8192)
  .refine((value) => value.trim() === value, 'API key must not start or end with whitespace')
  .refine((value) => !/[\0\r\n]/u.test(value), 'API key contains an invalid control character')
  .refine((value) => new TextEncoder().encode(value).byteLength <= 8192, 'API key exceeds 8 KiB')

export const saveApiKeyInputSchema = z.object({
  providerId: apiKeyProviderIdSchema,
  apiKey: apiKeySchema
}).strict()

export const removeApiKeyInputSchema = z.object({ providerId: apiKeyProviderIdSchema }).strict()
export const openCredentialPageInputSchema = removeApiKeyInputSchema

function normalizeOllamaEndpoint(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Ollama endpoint must use HTTP or HTTPS')
  if (url.username || url.password || url.search || url.hash) throw new Error('Ollama endpoint must not contain credentials, a query, or a fragment')
  if (url.pathname !== '/' && url.pathname !== '') throw new Error('Ollama endpoint must not contain a path')
  const hostname = url.hostname.toLocaleLowerCase()
  if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) throw new Error('Ollama endpoint must use a loopback address')
  const normalizedHost = hostname === 'localhost' ? '127.0.0.1' : hostname
  return `${url.protocol}//${normalizedHost}${url.port ? `:${url.port}` : ''}`
}

export const ollamaEndpointSchema = z.string().min(1).max(200).transform((value, context) => {
    try {
      return normalizeOllamaEndpoint(value)
    } catch (error) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : 'Invalid Ollama endpoint' })
      return z.NEVER
    }
  })

export const setOllamaEndpointInputSchema = z.object({ endpoint: ollamaEndpointSchema }).strict()

export const apiKeyProviderStatusSchema = z.object({
  id: apiKeyProviderIdSchema,
  kind: z.literal('api-key'),
  hasCredential: z.boolean()
}).strict()

export const ollamaProviderStatusSchema = z.object({
  id: z.literal('ollama'),
  kind: z.literal('local'),
  endpoint: ollamaEndpointSchema
}).strict()

export const aiProviderConfigurationSchema = z.object({
  secureStorageAvailable: z.boolean(),
  providers: z.array(z.discriminatedUnion('kind', [apiKeyProviderStatusSchema, ollamaProviderStatusSchema])).max(10)
}).strict()

export type ApiKeyProviderId = z.infer<typeof apiKeyProviderIdSchema>
export type SaveApiKeyInput = z.infer<typeof saveApiKeyInputSchema>
export type RemoveApiKeyInput = z.infer<typeof removeApiKeyInputSchema>
export type SetOllamaEndpointInput = z.infer<typeof setOllamaEndpointInputSchema>
export type OpenCredentialPageInput = z.infer<typeof openCredentialPageInputSchema>
export type AiProviderConfiguration = z.infer<typeof aiProviderConfigurationSchema>
