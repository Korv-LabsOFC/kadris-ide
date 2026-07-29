import type { Result } from '../../../shared/contracts'

const REQUEST_TIMEOUT_MS = 15_000

export class WebApiClient {
  readonly token: string

  constructor() {
    const url = new URL(window.location.href)
    const queryToken = url.searchParams.get('token')
    if (queryToken) {
      sessionStorage.setItem('kadris.sessionToken', queryToken)
      url.searchParams.delete('token')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    }
    const token = queryToken ?? sessionStorage.getItem('kadris.sessionToken')
    if (!token) throw new Error('Kadris local session token is missing')
    this.token = token
  }

  async get<T>(path: string): Promise<Result<T>> {
    return this.request<T>(path, { method: 'GET' })
  }

  async post<T>(path: string, body: unknown = {}): Promise<Result<T>> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) })
  }

  createWebSocket(): WebSocket {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return new WebSocket(`${protocol}//${window.location.host}/ws/platform?token=${encodeURIComponent(this.token)}`)
  }

  private async request<T>(path: string, init: RequestInit): Promise<Result<T>> {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(path, {
        ...init,
        signal: controller.signal,
        credentials: 'same-origin',
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {})
        }
      })
      const payload = await response.json() as Result<T>
      if (!response.ok && payload.ok) {
        return { ok: false, error: { code: 'IO_ERROR', message: `Local API returned HTTP ${response.status}` } }
      }
      return payload
    } catch (error) {
      return {
        ok: false,
        error: {
          code: error instanceof DOMException && error.name === 'AbortError' ? 'TIMEOUT' : 'IO_ERROR',
          message: error instanceof Error ? error.message.slice(0, 500) : 'Local API request failed'
        }
      }
    } finally {
      window.clearTimeout(timeout)
    }
  }
}
