import { describe, expect, it } from 'vitest'
import { listDirectoryInputSchema, readWorkspaceFileInputSchema, workspaceDocumentSchema, workspaceEntriesSchema } from '../src/shared/contracts'

describe('IPC contracts', () => {
  it('rejects unknown list-directory properties', () => {
    expect(() => listDirectoryInputSchema.parse({ relativePath: '', command: 'rm -rf' })).toThrow()
  })

  it('enforces the directory result limit', () => {
    const entries = Array.from({ length: 5001 }, (_, index) => ({ name: `${index}`, relativePath: `${index}`, kind: 'file' }))
    expect(() => workspaceEntriesSchema.parse(entries)).toThrow()
  })

  it('requires a relative file path and bounds document content', () => {
    expect(readWorkspaceFileInputSchema.parse({ relativePath: 'src/main.ts' })).toEqual({ relativePath: 'src/main.ts' })
    expect(() => readWorkspaceFileInputSchema.parse({ relativePath: '', command: 'open' })).toThrow()
    expect(() => workspaceDocumentSchema.parse({ name: 'large.txt', relativePath: 'large.txt', content: 'a'.repeat(2 * 1024 * 1024 + 1) })).toThrow()
  })
})
