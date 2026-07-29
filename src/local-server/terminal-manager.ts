import { homedir } from 'node:os'
import type { IDisposable, IPty } from 'node-pty'
import type { TerminalCreateInput, TerminalDataEvent, TerminalExitEvent, TerminalInfo } from '../shared/terminal-contracts'
import { detectShell } from '../main/services/shell-detection'
import type { WorkspaceService } from '../main/services/workspace-service'

interface TerminalSession {
  id: string
  process: IPty
  subscriptions: IDisposable[]
}

export class LocalTerminalManager {
  #session: TerminalSession | null = null

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly emitData: (event: TerminalDataEvent) => void,
    private readonly emitExit: (event: TerminalExitEvent) => void
  ) {}

  async create(input: TerminalCreateInput): Promise<TerminalInfo> {
    this.closeAll()
    const [{ spawn }, shell] = await Promise.all([import('node-pty'), detectShell()])
    const environment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    environment.TERM = 'xterm-256color'
    environment.COLORTERM = 'truecolor'
    environment.TERM_PROGRAM = 'Kadris'
    const child = spawn(shell.executable, shell.args, {
      name: 'xterm-256color',
      cols: input.cols,
      rows: input.rows,
      cwd: this.workspaceService.getRoot() ?? homedir(),
      env: environment
    })
    const session: TerminalSession = { id: input.terminalId, process: child, subscriptions: [] }
    session.subscriptions.push(child.onData((data) => {
      for (let offset = 0; offset < data.length; offset += 16384) {
        this.emitData({ terminalId: session.id, data: data.slice(offset, offset + 16384) })
      }
    }))
    session.subscriptions.push(child.onExit(({ exitCode, signal }) => {
      if (this.#session === session) this.#session = null
      for (const subscription of session.subscriptions) subscription.dispose()
      this.emitExit({ terminalId: session.id, exitCode, signal: signal ?? null })
    }))
    this.#session = session
    return { terminalId: input.terminalId, shellName: shell.name }
  }

  write(terminalId: string, data: string): void {
    this.#require(terminalId).process.write(data)
  }

  resize(terminalId: string, cols: number, rows: number): void {
    this.#require(terminalId).process.resize(cols, rows)
  }

  close(terminalId: string): void {
    this.#closeSession(this.#require(terminalId))
  }

  closeAll(): void {
    if (this.#session) this.#closeSession(this.#session)
  }

  #require(terminalId: string): TerminalSession {
    if (!this.#session || this.#session.id !== terminalId) throw new Error('Terminal session is not active')
    return this.#session
  }

  #closeSession(session: TerminalSession): void {
    if (this.#session === session) this.#session = null
    for (const subscription of session.subscriptions) subscription.dispose()
    try { session.process.kill() } catch { /* Process may already have exited. */ }
  }
}
