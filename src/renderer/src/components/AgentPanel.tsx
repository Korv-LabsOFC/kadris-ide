import { useCallback, useEffect, useRef, useState } from 'react'
import { Send, Square, Loader2, AlertCircle, LogOut, LogIn } from 'lucide-react'
import { logoUrl } from '../brand'
import { usePlatformBridge } from '../platform/PlatformBridgeContext'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export function AgentPanel() {
  const bridge = usePlatformBridge()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<'loading' | 'ready' | 'no-cli' | 'error'>('loading')
  const [accountInfo, setAccountInfo] = useState<{ email: string; planType: string } | null>(null)
  const [loginBusy, setLoginBusy] = useState(false)
  const currentRunIdRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    bridge.codex.getStatus().then((result) => {
      if (!active) return
      if (!result.ok) {
        setStatus('error')
        return
      }
      const { cli, account } = result.value
      if (cli.state !== 'ready') {
        setStatus('no-cli')
      } else {
        setStatus('ready')
        if (account?.type === 'chatgpt') setAccountInfo({ email: account.email ?? 'unknown', planType: account.planType })
      }
    }).catch(() => {
      if (active) setStatus('error')
    })

    const removeAuth = bridge.codex.onAuthEvent((event) => {
      if (event.type === 'statusChanged' && event.status.account?.type === 'chatgpt') {
        setAccountInfo({ email: event.status.account.email ?? 'unknown', planType: event.status.account.planType })
      } else if (event.type === 'loginFinished') {
        setLoginBusy(false)
        if (event.outcome === 'succeeded') {
          setStatus('ready')
        }
      }
    })

    const removeRun = bridge.codex.onRunEvent((event) => {
      if (event.type === 'started') {
        setBusy(true)
      } else if (event.type === 'completed') {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: event.text, timestamp: Date.now() }])
        setBusy(false)
        currentRunIdRef.current = null
      } else if (event.type === 'failed') {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'system', content: event.message, timestamp: Date.now() }])
        setBusy(false)
        currentRunIdRef.current = null
      } else if (event.type === 'cancelled') {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'system', content: 'Cancelled', timestamp: Date.now() }])
        setBusy(false)
        currentRunIdRef.current = null
      }
    })

    return () => {
      active = false
      removeAuth()
      removeRun()
    }
  }, [bridge])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleLogin = useCallback(() => {
    setLoginBusy(true)
    void bridge.codex.loginChatGPT({})
  }, [])

  const handleLogout = useCallback(() => {
    void bridge.codex.logout()
    setAccountInfo(null)
  }, [])

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || busy) return
    const runId = crypto.randomUUID()
    currentRunIdRef.current = runId
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', content: trimmed, timestamp: Date.now() }])
    setInput('')
    setBusy(true)
    void bridge.codex.run({ runId, prompt: trimmed })
  }, [input, busy])

  const handleCancel = useCallback(() => {
    const runId = currentRunIdRef.current
    if (runId) void bridge.codex.cancelRun({ runId })
  }, [])

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const styles = {
    panel: { display: 'flex', flexDirection: 'column' as const, height: '100%', background: '#15171c', color: '#d8dbe2', fontFamily: 'inherit' },
    header: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid #292c33', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em' as const, color: '#8b8fa3' },
    statusDot: (color: string) => ({ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }),
    loginSection: { display: 'flex', flexDirection: 'column' as const, gap: 8, padding: 12, borderBottom: '1px solid #292c33' },
    accountInfo: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    accountEmail: { fontSize: 12, color: '#d8dbe2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
    planBadge: { fontSize: 10, color: '#8b8fa3', background: '#1e2028', padding: '2px 6px', borderRadius: 3, flexShrink: 0 },
    loginButton: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: 'none', borderRadius: 4, background: '#d77737', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer' },
    logoutButton: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', border: '1px solid #292c33', borderRadius: 4, background: 'transparent', color: '#8b8fa3', fontSize: 11, cursor: 'pointer' },
    noCli: { padding: 16, textAlign: 'center' as const, color: '#8b8fa3', fontSize: 13, lineHeight: 1.6 },
    noCliCode: { display: 'block', marginTop: 8, padding: '6px 10px', background: '#111318', borderRadius: 4, fontSize: 12, color: '#d77737', fontFamily: 'monospace' },
    errorBox: { display: 'flex', alignItems: 'center', gap: 8, padding: 12, margin: 12, borderRadius: 4, background: '#2d1a1a', border: '1px solid #5c2b2b', color: '#e88', fontSize: 12 },
    messages: { flex: 1, overflowY: 'auto' as const, padding: '8px 0' },
    messageRow: (justify: string) => ({ display: 'flex', justifyContent: justify, padding: '4px 12', marginBottom: 4 }),
    userBubble: { maxWidth: '80%', padding: '8px 12px', borderRadius: '8px 8px 2px 8px', background: '#2d435a', color: '#d8dbe2', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const },
    assistantRow: { display: 'flex', justifyContent: 'flex-end', padding: '4px 12', marginBottom: 4 },
    assistantBubble: { maxWidth: '80%', padding: '8px 12px', borderRadius: '8px 8px 8px 2px', background: '#1e2028', color: '#d8dbe2', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const },
    assistantLogo: { width: 18, height: 18, borderRadius: '50%', flexShrink: 0, alignSelf: 'flex-end', marginLeft: 6 },
    systemBubble: { maxWidth: '90%', padding: '4px 10px', textAlign: 'center' as const, color: '#6b7080', fontSize: 11, fontStyle: 'italic' as const },
    inputArea: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderTop: '1px solid #292c33' },
    textInput: { flex: 1, padding: '7px 10px', border: '1px solid #292c33', borderRadius: 4, background: '#111318', color: '#d8dbe2', fontSize: 13, outline: 'none', fontFamily: 'inherit' },
    sendButton: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, border: 'none', borderRadius: 4, background: '#d77737', color: '#fff', cursor: 'pointer', flexShrink: 0 },
    disabledSend: { background: '#3a3028', cursor: 'not-allowed' },
  }

  const statusColor = status === 'ready' ? '#4caf50' : status === 'loading' ? '#f0ad4e' : '#e55'

  return (
    <aside className="side-panel" style={styles.panel} aria-label="AI agent">
      <header style={styles.header}>
        <span>AGENT</span>
        <span style={styles.statusDot(statusColor)} />
      </header>

      {status === 'loading' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, color: '#8b8fa3', fontSize: 12 }}>
          <Loader2 size={14} style={{ marginRight: 6, animation: 'spin 1s linear infinite' }} /> Loading...
        </div>
      )}

      {status === 'no-cli' && (
        <div style={styles.noCli}>
          <AlertCircle size={32} style={{ marginBottom: 8, color: '#d77737' }} />
          <div>Codex CLI not found.</div>
          <code style={styles.noCliCode}>npm install -g @openai/codex</code>
        </div>
      )}

      {status === 'error' && (
        <div style={styles.errorBox}>
          <AlertCircle size={14} /> Agent unavailable
        </div>
      )}

      {status === 'ready' && (
        <div style={styles.loginSection}>
          {accountInfo ? (
            <div style={styles.accountInfo}>
              <span style={styles.accountEmail}>{accountInfo.email}</span>
              <span style={styles.planBadge}>{accountInfo.planType}</span>
              <button type="button" style={styles.logoutButton} onClick={handleLogout} title="Sign out"><LogOut size={12} /></button>
            </div>
          ) : (
            <button type="button" style={styles.loginButton} onClick={handleLogin} disabled={loginBusy}>
              {loginBusy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <LogIn size={14} />}
              {loginBusy ? 'Signing in...' : 'Sign in with ChatGPT'}
            </button>
          )}
        </div>
      )}

      <div style={styles.messages}>
        {messages.map((msg) => {
          if (msg.role === 'user') {
            return (
              <div key={msg.id} style={styles.messageRow('flex-end')}>
                <div style={styles.userBubble}>{msg.content}</div>
              </div>
            )
          }
          if (msg.role === 'assistant') {
            return (
              <div key={msg.id} style={styles.assistantRow}>
                <div style={styles.assistantBubble}>{msg.content}</div>
                <img src={logoUrl} alt="" style={styles.assistantLogo} draggable={false} />
              </div>
            )
          }
          return (
            <div key={msg.id} style={styles.messageRow('center')}>
              <div style={styles.systemBubble}>{msg.content}</div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {status === 'ready' && (
        <div style={styles.inputArea}>
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the agent..."
            disabled={busy}
            style={styles.textInput}
          />
          {busy ? (
            <button type="button" style={styles.sendButton} onClick={handleCancel} title="Cancel">
              <Square size={14} />
            </button>
          ) : (
            <button type="button" style={{ ...styles.sendButton, ...(!input.trim() ? styles.disabledSend : undefined) }} onClick={handleSend} disabled={!input.trim()} title="Send">
              <Send size={14} />
            </button>
          )}
        </div>
      )}
    </aside>
  )
}
