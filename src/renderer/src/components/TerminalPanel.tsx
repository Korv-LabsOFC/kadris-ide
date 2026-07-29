import { useEffect, useRef, useState } from 'react'
import { PanelBottom, Play, RotateCcw, Square } from 'lucide-react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { usePlatformBridge } from '../platform/PlatformBridgeContext'

export function splitTerminalInput(value: string, maxBytes = 8192): string[] {
  const chunks: string[] = []
  let current = ''
  let bytes = 0
  for (const character of value) {
    const characterBytes = new TextEncoder().encode(character).byteLength
    if (bytes + characterBytes > maxBytes && current) {
      chunks.push(current)
      current = ''
      bytes = 0
    }
    current += character
    bytes += characterBytes
  }
  if (current) chunks.push(current)
  return chunks
}

export function TerminalPanel() {
  const bridge = usePlatformBridge()
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const terminalIdRef = useRef<string | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const writeQueue = useRef(Promise.resolve())
  const [state, setState] = useState<'idle' | 'starting' | 'running' | 'exited' | 'error'>('idle')
  const [label, setLabel] = useState('Local terminal is stopped.')

  useEffect(() => {
    const removeData = bridge.terminal.onData((event) => {
      if (event.terminalId === terminalIdRef.current) terminalRef.current?.write(event.data)
    })
    const removeExit = bridge.terminal.onExit((event) => {
      if (event.terminalId !== terminalIdRef.current) return
      terminalIdRef.current = null
      setState('exited')
      setLabel(`Process exited with code ${event.exitCode ?? 'unknown'}.`)
    })
    return () => {
      removeData()
      removeExit()
      resizeObserverRef.current?.disconnect()
      const terminalId = terminalIdRef.current
      terminalIdRef.current = null
      if (terminalId) void bridge.terminal.close({ terminalId }).catch(() => undefined)
      terminalRef.current?.dispose()
    }
  }, [bridge])

  async function start(): Promise<void> {
    if (!containerRef.current || state === 'starting' || state === 'running') return
    setState('starting')
    setLabel('Starting shell...')
    terminalRef.current?.dispose()
    resizeObserverRef.current?.disconnect()

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
      fontSize: 12,
      scrollback: 5000,
      theme: { background: '#111318', foreground: '#d8dbe2', cursor: '#e17b3d', selectionBackground: '#3a465c' }
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(containerRef.current)
    fit.fit()
    terminalRef.current = terminal
    fitRef.current = fit
    const terminalId = crypto.randomUUID()
    terminalIdRef.current = terminalId

    terminal.onData((data) => {
      for (const chunk of splitTerminalInput(data)) {
        writeQueue.current = writeQueue.current.then(async () => {
          const result = await bridge.terminal.write({ terminalId, data: chunk })
          if (!result.ok) throw new Error(result.error.message)
        }).catch(() => { setState('error'); setLabel('Terminal input failed.') })
      }
    })

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (terminalIdRef.current !== terminalId) return
        fit.fit()
        void bridge.terminal.resize({ terminalId, cols: terminal.cols, rows: terminal.rows })
      })
    })
    observer.observe(containerRef.current)
    resizeObserverRef.current = observer

    try {
      const result = await bridge.terminal.create({ terminalId, cols: terminal.cols, rows: terminal.rows })
      if (!result.ok) throw new Error(result.error.message)
      setState('running')
      setLabel(result.value.shellName)
      terminal.focus()
    } catch {
      terminalIdRef.current = null
      observer.disconnect()
      setState('error')
      setLabel('The local shell could not be started.')
    }
  }

  async function stop(): Promise<void> {
    const terminalId = terminalIdRef.current
    if (!terminalId) return
    terminalIdRef.current = null
    await bridge.terminal.close({ terminalId }).catch(() => undefined)
    setState('exited')
    setLabel('Terminal stopped.')
  }

  return <section className="bottom-panel terminal-panel" aria-label="Terminal">
    <header><PanelBottom size={14} aria-hidden="true" /><span>TERMINAL</span><span className="terminal-label">{label}</span><span className="terminal-actions">{state === 'running' ? <button type="button" onClick={() => { void stop() }} title="Stop terminal"><Square size={13} /></button> : <button type="button" onClick={() => { void start() }} title={state === 'exited' || state === 'error' ? 'Restart terminal' : 'Start terminal'}>{state === 'exited' || state === 'error' ? <RotateCcw size={13} /> : <Play size={13} />}</button>}</span></header>
    <div ref={containerRef} className="terminal-container" />
  </section>
}
