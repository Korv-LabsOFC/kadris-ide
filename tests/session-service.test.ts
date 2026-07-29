import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SessionService } from '../src/main/services/session-service'
import type { SessionState } from '../src/shared/session-contracts'

const temporaryPaths: string[] = []

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(temporaryPaths.splice(0).map(async (p) => rm(p, { recursive: true, force: true })))
})

async function createService(): Promise<{ dir: string; svc: SessionService }> {
  const dir = await mkdtemp(join(tmpdir(), 'kadris-session-test-'))
  temporaryPaths.push(dir)
  const svc = new SessionService(dir)
  return { dir, svc }
}

describe('SessionService', () => {
  it('returns null when no session file exists', async () => {
    const { svc } = await createService()
    const result = await svc.load()
    expect(result).toBeNull()
  })

  it('saves and loads a session', async () => {
    const { dir, svc } = await createService()
    const state: SessionState = {
      version: 1,
      workspace: dir,
      openTabs: [{ relativePath: 'src/main.ts', scrollPosition: 0, cursorLine: 10, cursorColumn: 5 }],
      activeTab: 'src/main.ts',
      sidebarWidth: 280,
      fontFamily: '',
      fontSize: 14
    }
    await svc.save(state)
    const loaded = await svc.load()
    expect(loaded).not.toBeNull()
    expect(loaded!.version).toBe(1)
    expect(loaded!.workspace).toBe(dir)
    expect(loaded!.openTabs).toHaveLength(1)
    expect(loaded!.openTabs[0]!.relativePath).toBe('src/main.ts')
    expect(loaded!.activeTab).toBe('src/main.ts')
  })

  it('saves and loads minimal session', async () => {
    const { dir, svc } = await createService()
    const state: SessionState = {
      version: 1,
      workspace: dir,
      openTabs: [],
      activeTab: null,
      sidebarWidth: 300,
      fontFamily: 'monospace',
      fontSize: 12
    }
    await svc.save(state)
    const loaded = await svc.load()
    expect(loaded).not.toBeNull()
    expect(loaded!.openTabs).toHaveLength(0)
    expect(loaded!.activeTab).toBeNull()
  })

  it('clears the session', async () => {
    const { dir, svc } = await createService()
    const state: SessionState = {
      version: 1,
      workspace: dir,
      openTabs: [],
      activeTab: null,
      sidebarWidth: 280,
      fontFamily: '',
      fontSize: 14
    }
    await svc.save(state)
    await svc.clear()
    const loaded = await svc.load()
    expect(loaded).not.toBeNull()
    expect(loaded!.openTabs).toHaveLength(0)
  })

  it('provides a default state', async () => {
    const { dir, svc } = await createService()
    const state = svc.defaultState
    expect(state.version).toBe(1)
    expect(state.workspace).toBe(dir)
    expect(state.openTabs).toEqual([])
    expect(state.activeTab).toBeNull()
  })

  it('handles root path update', async () => {
    const { svc } = await createService()
    const newDir = await mkdtemp(join(tmpdir(), 'kadris-session-test-'))
    temporaryPaths.push(newDir)
    svc.setRoot(newDir)
    const state = svc.defaultState
    expect(state.workspace).toBe(newDir)
  })
})
