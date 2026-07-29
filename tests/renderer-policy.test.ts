import { describe, expect, it } from 'vitest'
import { createRendererTarget, isAllowedRendererUrl } from '../src/main/security/renderer-policy'

describe('renderer URL policy', () => {
  it('accepts the exact development origin on a non-default port', () => {
    const target = createRendererTarget(false, 'http://localhost:6123/', '/tmp/index.html')
    expect(isAllowedRendererUrl('http://localhost:6123/', target)).toBe(true)
    expect(target.csp).toContain('ws://localhost:6123')
  })

  it('rejects user-info URL spoofing and unrelated local files', () => {
    const development = createRendererTarget(false, 'http://localhost:5173/', '/tmp/index.html')
    const production = createRendererTarget(true, 'http://localhost:5173/', '/opt/kadris/index.html')
    expect(isAllowedRendererUrl('http://localhost:5173@attacker.example/', development)).toBe(false)
    expect(isAllowedRendererUrl('file:///tmp/untrusted.html', production)).toBe(false)
    expect(production.csp).not.toContain('ws://')
    expect(isAllowedRendererUrl('file:///opt/kadris/index.html?autoOpen=%7B%7D', production)).toBe(true)
    expect(isAllowedRendererUrl('file:///opt/kadris/index.html?unsafe=true', production)).toBe(false)
  })

  it('rejects a non-loopback development renderer', () => {
    expect(() => createRendererTarget(false, 'https://attacker.example/', '/tmp/index.html')).toThrow()
  })
})
