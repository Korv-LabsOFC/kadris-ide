import { useState } from 'react'
import { Search } from 'lucide-react'
import type { SearchResult } from '../../../shared/search-contracts'
import { usePlatformBridge } from '../platform/PlatformBridgeContext'

export function SearchPanel({ onOpenFile }: { onOpenFile: (path: string) => void }) {
  const bridge = usePlatformBridge()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [useRegex, setUseRegex] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)

  async function handleSearch(): Promise<void> {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    try {
      const result = await bridge.search.query({
        query: query.trim(),
        path: '',
        maxResults: 200,
        caseSensitive,
        wholeWord: false,
        useRegex,
        includePattern: '',
        excludePattern: ''
      })
      if (result.ok) setResults(result.value)
      else setError(result.error.message)
    } catch { setError('Search failed') }
    setLoading(false)
  }

  return <aside className="side-panel" aria-label="Search">
    <header className="panel-header"><span>SEARCH</span></header>
    <div style={{ padding: '8px', borderBottom: '1px solid #252830' }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search files..."
          style={{ flex: 1, height: 26, background: '#1e2028', color: '#c8cad0', border: '1px solid #373b45', borderRadius: 2, padding: '0 6px', fontSize: 12 }}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch() }}
          autoFocus
        />
        <button type="button" className="primary-button" style={{ height: 26, minWidth: 50 }} onClick={() => { void handleSearch() }} disabled={loading || !query.trim()}><Search size={13} /></button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#8c929e', fontSize: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} style={{ accentColor: '#5294e2' }} /> Case
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#8c929e', fontSize: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={useRegex} onChange={(e) => setUseRegex(e.target.checked)} style={{ accentColor: '#5294e2' }} /> Regex
        </label>
      </div>
    </div>
    {error && <div className="state-message error" role="alert">{error}</div>}
    {loading && <div className="state-message" role="status">Searching...</div>}
    {results && <div className="file-list">
      <div style={{ padding: '4px 8px', color: '#8c929e', fontSize: 10, borderBottom: '1px solid #252830' }}>
        {results.totalMatches} matches in {results.results.length} files{results.truncated ? ' (truncated)' : ''}
      </div>
      {results.results.map((r, i) => <button
        key={`${r.path}:${r.line}:${i}`}
        type="button"
        className="tree-row"
        style={{ height: 'auto', minHeight: 20, padding: '2px 8px', display: 'block', textAlign: 'left', cursor: 'pointer' }}
        onClick={() => onOpenFile(r.path)}
      >
        <div style={{ color: '#b9bec8', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.path}:{r.line}:{r.column}
        </div>
        <div style={{ color: '#8c929e', fontSize: 10, fontFamily: 'monospace', whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {r.lineContent.slice(0, 200)}
        </div>
      </button>)}
    </div>}
    {results && results.results.length === 0 && <div className="empty-panel"><Search size={28} /><p>No results found.</p></div>}
  </aside>
}
