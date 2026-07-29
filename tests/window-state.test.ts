import { describe, expect, it } from 'vitest'
import { windowStateSchema } from '../src/shared/window-state'

describe('window state', () => {
  it('accepts a bounded desktop window', () => {
    expect(windowStateSchema.parse({ width: 1280, height: 800, x: 10, y: 20, maximized: false })).toEqual({ width: 1280, height: 800, x: 10, y: 20, maximized: false })
  })

  it('rejects unusable dimensions and extra data', () => {
    expect(() => windowStateSchema.parse({ width: 100, height: 100, maximized: false, token: 'secret' })).toThrow()
  })
})
