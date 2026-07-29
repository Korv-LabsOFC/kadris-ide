import { useEffect, useState, type FormEvent } from 'react'
import { Bot, ExternalLink, KeyRound, Server, ShieldAlert, Trash2 } from 'lucide-react'
import type { AiProviderConfiguration, ApiKeyProviderId } from '../../../shared/ai-provider-contracts'
import { usePlatformBridge } from '../platform/PlatformBridgeContext'

const providerCatalog: ReadonlyArray<{ id: ApiKeyProviderId; name: string; description: string }> = [
  { id: 'openai', name: 'OpenAI', description: 'OpenAI platform API key' },
  { id: 'anthropic', name: 'Anthropic', description: 'Claude API key' },
  { id: 'google', name: 'Google AI', description: 'Gemini API key' },
  { id: 'mistral', name: 'Mistral', description: 'Mistral platform API key' },
  { id: 'openrouter', name: 'OpenRouter', description: 'OpenRouter API key' }
]

interface Notice {
  kind: 'success' | 'error'
  text: string
}

export function AiProviderSettings() {
  const bridge = usePlatformBridge()
  const [configuration, setConfiguration] = useState<AiProviderConfiguration | null>(null)
  const [busy, setBusy] = useState<string | null>('load')
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    let active = true
    void bridge.aiProviders.getConfiguration()
      .then((result) => {
        if (!active) return
        if (result.ok) setConfiguration(result.value)
        else setNotice({ kind: 'error', text: result.error.message })
      })
      .catch(() => { if (active) setNotice({ kind: 'error', text: 'Provider settings could not be loaded.' }) })
      .finally(() => { if (active) setBusy(null) })
    return () => { active = false }
  }, [bridge])

  async function saveApiKey(event: FormEvent<HTMLFormElement>, providerId: ApiKeyProviderId): Promise<void> {
    event.preventDefault()
    const form = event.currentTarget
    const value = new FormData(form).get('apiKey')
    if (typeof value !== 'string' || !value) return
    setBusy(providerId)
    setNotice(null)
    const request = bridge.aiProviders.saveApiKey({ providerId, apiKey: value })
    form.reset()
    try {
      const result = await request
      if (result.ok) {
        setConfiguration(result.value)
        setNotice({ kind: 'success', text: `${providerCatalog.find(({ id }) => id === providerId)?.name ?? 'Provider'} key saved.` })
      } else setNotice({ kind: 'error', text: result.error.message })
    } catch {
      setNotice({ kind: 'error', text: 'The API key could not be saved.' })
    } finally {
      setBusy(null)
    }
  }

  async function removeApiKey(providerId: ApiKeyProviderId): Promise<void> {
    setBusy(providerId)
    setNotice(null)
    try {
      const result = await bridge.aiProviders.removeApiKey({ providerId })
      if (result.ok) {
        setConfiguration(result.value)
        setNotice({ kind: 'success', text: 'Saved key removed.' })
      } else setNotice({ kind: 'error', text: result.error.message })
    } catch {
      setNotice({ kind: 'error', text: 'The saved key could not be removed.' })
    } finally {
      setBusy(null)
    }
  }

  async function openCredentialPage(providerId: ApiKeyProviderId): Promise<void> {
    setBusy(`page:${providerId}`)
    setNotice(null)
    try {
      const result = await bridge.aiProviders.openCredentialPage({ providerId })
      if (!result.ok) setNotice({ kind: 'error', text: result.error.message })
    } catch {
      setNotice({ kind: 'error', text: 'The official credential page could not be opened.' })
    } finally {
      setBusy(null)
    }
  }

  async function openChatGPT(): Promise<void> {
    setBusy('chatgpt')
    setNotice(null)
    try {
      const result = await bridge.aiProviders.openChatGPT()
      if (!result.ok) setNotice({ kind: 'error', text: result.error.message })
    } catch {
      setNotice({ kind: 'error', text: 'ChatGPT could not be opened in the browser.' })
    } finally {
      setBusy(null)
    }
  }

  async function saveOllamaEndpoint(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const value = new FormData(event.currentTarget).get('endpoint')
    if (typeof value !== 'string' || !value) return
    setBusy('ollama')
    setNotice(null)
    try {
      const result = await bridge.aiProviders.setOllamaEndpoint({ endpoint: value })
      if (result.ok) {
        setConfiguration(result.value)
        setNotice({ kind: 'success', text: 'Local endpoint saved.' })
      } else setNotice({ kind: 'error', text: result.error.message })
    } catch {
      setNotice({ kind: 'error', text: 'The local endpoint could not be saved.' })
    } finally {
      setBusy(null)
    }
  }

  const ollama = configuration?.providers.find((provider) => provider.kind === 'local')
  return <aside className="side-panel provider-settings" aria-label="AI provider settings">
    <header className="panel-header"><span>AI PROVIDERS</span></header>
    <div className="provider-settings-body">
      <p className="provider-intro">Configure API access. Keys are encrypted by the operating system and are never returned to this window.</p>
      <section className="chatgpt-browser"><div><Bot size={16} aria-hidden="true" /><span><strong>ChatGPT Plus</strong><small>Use your Plus account on the official website. Browser login does not connect the account to Kadris.</small></span></div><button type="button" onClick={() => { void openChatGPT() }} disabled={busy !== null}>{busy === 'chatgpt' ? 'Opening...' : 'Open ChatGPT'}<ExternalLink size={12} aria-hidden="true" /></button></section>
      {configuration && !configuration.secureStorageAvailable && <div className="provider-warning"><ShieldAlert size={15} aria-hidden="true" /><span>Secure OS storage is unavailable. API keys cannot be saved.</span></div>}
      {notice && <p className={`provider-notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</p>}
      {busy === 'load' && <p className="provider-loading" role="status">Loading providers...</p>}
      {configuration && providerCatalog.map((provider) => {
        const status = configuration.providers.find((candidate) => candidate.kind === 'api-key' && candidate.id === provider.id)
        const hasCredential = status?.kind === 'api-key' && status.hasCredential
        const disabled = busy !== null || !configuration.secureStorageAvailable
        return <section className="provider-card" key={provider.id}>
          <div className="provider-card-heading"><KeyRound size={15} aria-hidden="true" /><span><strong>{provider.name}</strong><small>{provider.description}</small></span><i className={hasCredential ? 'saved' : ''}>{hasCredential ? 'Saved' : 'Not saved'}</i></div>
          <form onSubmit={(event) => { void saveApiKey(event, provider.id) }}>
            <label className="sr-only" htmlFor={`key-${provider.id}`}>{provider.name} API key</label>
            <input id={`key-${provider.id}`} name="apiKey" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder={hasCredential ? 'Replace saved key' : 'Paste API key'} disabled={disabled} required />
            <button className="provider-save" type="submit" disabled={disabled}>{busy === provider.id ? 'Saving...' : hasCredential ? 'Replace' : 'Save'}</button>
          </form>
          <div className="provider-card-actions"><button type="button" onClick={() => { void openCredentialPage(provider.id) }} disabled={busy !== null}><ExternalLink size={12} aria-hidden="true" />Official key page</button>{hasCredential && <button type="button" className="danger" onClick={() => { void removeApiKey(provider.id) }} disabled={busy !== null}><Trash2 size={12} aria-hidden="true" />Remove</button>}</div>
        </section>
      })}
      {configuration && ollama?.kind === 'local' && <section className="provider-card local-provider">
        <div className="provider-card-heading"><Server size={15} aria-hidden="true" /><span><strong>Ollama</strong><small>Local model server</small></span><i className="local">Local</i></div>
        <form key={ollama.endpoint} onSubmit={(event) => { void saveOllamaEndpoint(event) }}>
          <label htmlFor="ollama-endpoint">Loopback endpoint</label>
          <input id="ollama-endpoint" name="endpoint" type="url" defaultValue={ollama.endpoint} autoCapitalize="none" spellCheck={false} disabled={busy !== null} required />
          <button className="provider-save" type="submit" disabled={busy !== null}>{busy === 'ollama' ? 'Saving...' : 'Save'}</button>
        </form>
      </section>}
      <p className="provider-footnote">Account subscriptions do not grant API access. Kadris does not embed provider login pages or claim that a saved key is valid.</p>
    </div>
  </aside>
}
