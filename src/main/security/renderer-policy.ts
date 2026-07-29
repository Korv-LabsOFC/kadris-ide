import { pathToFileURL } from 'node:url'

export interface RendererTarget {
  url: string
  development: boolean
  csp: string
}

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

export function createRendererTarget(isPackaged: boolean, developmentUrl: string | undefined, rendererPath: string): RendererTarget {
  if (!isPackaged && developmentUrl) {
    const parsed = new URL(developmentUrl)
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !loopbackHosts.has(parsed.hostname) || parsed.username || parsed.password) {
      throw new Error('Development renderer URL must use a loopback HTTP origin')
    }
    const websocketProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
    return {
      url: parsed.href,
      development: true,
      csp: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ${websocketProtocol}//${parsed.host}; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`
    }
  }

  return {
    url: pathToFileURL(rendererPath).href,
    development: false,
    csp: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"
  }
}

export function isAllowedRendererUrl(candidate: string, target: RendererTarget): boolean {
  try {
    const actual = new URL(candidate)
    const expected = new URL(target.url)
    if (actual.username || actual.password) return false
    if (!target.development) {
      if (actual.protocol !== expected.protocol || actual.pathname !== expected.pathname || actual.hash) return false
      return [...actual.searchParams.keys()].every((key) => key === 'autoOpen')
    }
    return actual.origin === expected.origin && actual.pathname === expected.pathname
  } catch {
    return false
  }
}
