import { describe, expect, it } from 'vitest'
import { terminalCreateInputSchema, terminalWriteInputSchema } from '../src/shared/terminal-contracts'
import { splitTerminalInput } from '../src/renderer/src/components/TerminalPanel'

describe('terminal contracts', () => {
  it('rejects malformed dimensions and unknown fields', () => {
    expect(() => terminalCreateInputSchema.parse({ terminalId: crypto.randomUUID(), cols: 1, rows: 24 })).toThrow()
    expect(() => terminalCreateInputSchema.parse({ terminalId: crypto.randomUUID(), cols: 80, rows: 24, shell: '/bin/sh' })).toThrow()
  })

  it('enforces terminal input by UTF-8 byte size', () => {
    expect(() => terminalWriteInputSchema.parse({ terminalId: crypto.randomUUID(), data: 'a'.repeat(8192) })).not.toThrow()
    expect(() => terminalWriteInputSchema.parse({ terminalId: crypto.randomUUID(), data: 'á'.repeat(5000) })).toThrow()
  })

  it('splits large Unicode input without breaking characters', () => {
    const chunks = splitTerminalInput('á'.repeat(9000))
    expect(chunks.join('')).toBe('á'.repeat(9000))
    expect(chunks.every((chunk) => new TextEncoder().encode(chunk).byteLength <= 8192)).toBe(true)
  })
})
