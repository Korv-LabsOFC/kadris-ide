import { useCallback, useEffect, useState } from 'react'
import { GitBranch, Plus, RotateCcw, SquareArrowUp } from 'lucide-react'
import type { GitStatus, GitCommitLog, GitBranchInfo } from '../../../shared/git-contracts'
import { usePlatformBridge } from '../platform/PlatformBridgeContext'

export function GitPanel() {
  const bridge = usePlatformBridge()
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [commits, setCommits] = useState<GitCommitLog | null>(null)
  const [, setBranches] = useState<GitBranchInfo | null>(null)
  const [commitMessage, setCommitMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const isRepo = await bridge.git.isRepo()
      if (!isRepo.ok) { setError(isRepo.error.message); return }
      if (!isRepo.value) { setStatus(null); setCommits(null); setBranches(null); return }
      const [s, c, b] = await Promise.all([
        bridge.git.status(),
        bridge.git.log(),
        bridge.git.branch()
      ])
      if (s.ok) setStatus(s.value)
      if (c.ok) setCommits(c.value)
      if (b.ok) setBranches(b.value)
    } catch { setError('Failed to load git status') }
    setLoading(false)
  }, [bridge])

  useEffect(() => { void refresh() }, [refresh])

  async function handleStage(file: string): Promise<void> {
    const result = await bridge.git.add({ files: [file] })
    if (!result.ok) setError(result.error.message)
    else void refresh()
  }

  async function handleStageAll(): Promise<void> {
    if (!status) return
    const files = status.files.filter((f) => !f.staged).map((f) => f.path)
    if (files.length === 0) return
    const result = await bridge.git.add({ files })
    if (!result.ok) setError(result.error.message)
    else void refresh()
  }

  async function handleCommit(): Promise<void> {
    if (!commitMessage.trim()) return
    const result = await bridge.git.commit({ message: commitMessage.trim(), all: false })
    if (!result.ok) setError(result.error.message)
    else { setCommitMessage(''); void refresh() }
  }

  async function handlePush(): Promise<void> {
    const result = await bridge.git.push()
    if (!result.ok) setError(result.error.message)
    else void refresh()
  }

  async function handlePull(): Promise<void> {
    const result = await bridge.git.pull()
    if (!result.ok) setError(result.error.message)
    else void refresh()
  }

  if (status === null && !loading && !error) {
    return <aside className="side-panel" aria-label="Source Control">
      <header className="panel-header"><span>SOURCE CONTROL</span></header>
      <div className="empty-panel"><GitBranch size={28} aria-hidden="true" /><p>Not a git repository.</p><button type="button" className="primary-button" onClick={() => { void bridge.git.init().then(() => refresh()) }}>Initialize Repository</button></div>
    </aside>
  }

  return <aside className="side-panel" aria-label="Source Control">
    <header className="panel-header">
      <span>SOURCE CONTROL</span>
      <button type="button" title="Refresh" onClick={() => { void refresh() }} disabled={loading}><RotateCcw size={13} /></button>
    </header>
    {error && <div className="state-message error" role="alert">{error}</div>}
    {status && <div style={{ padding: '4px 8px', borderBottom: '1px solid #252830' }}>
      <strong style={{ fontSize: 12, color: '#d7dae0' }}>{status.currentBranch}</strong>
      {status.behind > 0 && <span style={{ marginLeft: 8, color: '#df9595', fontSize: 11 }}>↓{status.behind}</span>}
      {status.ahead > 0 && <span style={{ marginLeft: 8, color: '#94c5aa', fontSize: 11 }}>↑{status.ahead}</span>}
    </div>}
    <div style={{ display: 'flex', gap: 4, padding: '4px 8px', borderBottom: '1px solid #252830' }}>
      <button type="button" className="primary-button" style={{ flex: 1, fontSize: 10, height: 22 }} onClick={() => { void handlePull() }} disabled={loading}>Pull</button>
      <button type="button" className="primary-button" style={{ flex: 1, fontSize: 10, height: 22 }} onClick={() => { void handlePush() }} disabled={loading}><SquareArrowUp size={11} /> Push</button>
    </div>
    <div className="file-list" style={{ maxHeight: 200 }}>
      {status?.files.map((file) => <label key={file.path} className="tree-row" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', height: 22 }}>
        <input type="checkbox" checked={selectedFiles.has(file.path)} onChange={() => setSelectedFiles((prev) => { const next = new Set(prev); if (next.has(file.path)) next.delete(file.path); else next.add(file.path); return next })} style={{ accentColor: '#5294e2' }} />
        <span style={{ color: file.staged ? '#94c5aa' : '#df9595', fontSize: 10, width: 60 }}>{file.kind}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontSize: 11 }}>{file.path}</span>
        {!file.staged && <button type="button" style={{ border: 'none', background: 'transparent', color: '#8c929e', cursor: 'pointer', padding: 0 }} title="Stage" onClick={() => { void handleStage(file.path) }}><Plus size={12} /></button>}
      </label>)}
    </div>
    <div style={{ padding: '4px 8px', borderTop: '1px solid #252830' }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <input type="text" value={commitMessage} onChange={(e) => setCommitMessage(e.target.value)} placeholder="Commit message" style={{ flex: 1, height: 24, background: '#1e2028', color: '#c8cad0', border: '1px solid #373b45', borderRadius: 2, padding: '0 6px', fontSize: 11 }} onKeyDown={(e) => { if (e.key === 'Enter') void handleCommit() }} />
        <button type="button" className="primary-button" style={{ height: 24, fontSize: 10 }} onClick={() => { void handleCommit() }} disabled={!commitMessage.trim() || loading}>Commit</button>
      </div>
      {status && status.files.some((f) => !f.staged) && <button type="button" style={{ marginTop: 4, border: 'none', background: 'transparent', color: '#8c929e', cursor: 'pointer', fontSize: 10 }} onClick={() => { void handleStageAll() }}>Stage All Changes</button>}
    </div>
    {commits && <div style={{ borderTop: '1px solid #252830' }}>
      <div className="panel-header"><span>COMMITS</span></div>
      <div style={{ maxHeight: 150, overflow: 'auto' }}>
        {commits.commits.slice(0, 10).map((c) => <div key={c.hash} style={{ padding: '3px 8px', borderBottom: '1px solid #1e2028', fontSize: 10 }}>
          <div style={{ color: '#8c929e' }}>{c.abbreviatedHash} {c.author}</div>
          <div style={{ color: '#b9bec8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.message}</div>
        </div>)}
      </div>
    </div>}
  </aside>
}
