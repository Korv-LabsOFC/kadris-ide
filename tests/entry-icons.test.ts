import { describe, expect, it } from 'vitest'
import { getEntryIconKind } from '../src/renderer/src/components/EntryIcon'

describe('entry icons', () => {
  it('maps specialized folders', () => {
    expect(getEntryIconKind({ kind: 'directory', name: 'src' })).toBe('folder-code')
    expect(getEntryIconKind({ kind: 'directory', name: '__tests__' })).toBe('folder-test')
    expect(getEntryIconKind({ kind: 'directory', name: '.git' })).toBe('folder-git')
    expect(getEntryIconKind({ kind: 'directory', name: 'node_modules' })).toBe('folder-dependency')
  })

  it('maps common file types without case sensitivity', () => {
    expect(getEntryIconKind({ kind: 'file', name: 'Component.TSX' })).toBe('code-ts')
    expect(getEntryIconKind({ kind: 'file', name: 'package.json' })).toBe('json')
    expect(getEntryIconKind({ kind: 'file', name: 'README.md' })).toBe('text')
    expect(getEntryIconKind({ kind: 'file', name: 'logo.png' })).toBe('image')
  })

  it('gives symbolic links precedence over extension', () => {
    expect(getEntryIconKind({ kind: 'symbolic-link', name: 'linked.ts' })).toBe('link')
  })
})
