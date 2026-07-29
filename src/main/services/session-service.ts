import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { sessionStateSchema, type SessionState } from '../../shared/session-contracts'

const SESSION_FILE = '.kadris/session.json'

export class SessionService {
  #workspaceRoot: string
  #sessionPath: string

  constructor(workspaceRoot: string) {
    this.#workspaceRoot = workspaceRoot
    this.#sessionPath = resolve(workspaceRoot, SESSION_FILE)
  }

  setRoot(newRoot: string): void {
    this.#workspaceRoot = newRoot
    this.#sessionPath = resolve(newRoot, SESSION_FILE)
  }

  async save(state: SessionState): Promise<void> {
    const validated = sessionStateSchema.parse({
      ...state,
      version: 1 as const,
      workspace: this.#workspaceRoot
    })
    await mkdir(dirname(this.#sessionPath), { recursive: true })
    await writeFile(this.#sessionPath, JSON.stringify(validated, null, 2), 'utf-8')
  }

  async load(): Promise<SessionState | null> {
    try {
      const raw = await readFile(this.#sessionPath, 'utf-8')
      const parsed = JSON.parse(raw) as unknown
      return sessionStateSchema.parse(parsed)
    } catch {
      return null
    }
  }

  async clear(): Promise<void> {
    try {
      await writeFile(this.#sessionPath, JSON.stringify({
        version: 1,
        workspace: this.#workspaceRoot,
        openTabs: [],
        activeTab: null,
        sidebarWidth: 280,
        fontFamily: '',
        fontSize: 14
      }), 'utf-8')
    } catch { /* no session file */ }
  }

  get defaultState(): SessionState {
    return {
      version: 1,
      workspace: this.#workspaceRoot,
      openTabs: [],
      activeTab: null,
      sidebarWidth: 280,
      fontFamily: '',
      fontSize: 14
    }
  }
}
