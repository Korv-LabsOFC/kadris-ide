import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Braces, Command as CommandIcon, FileText, ShieldCheck, X, Save, ExternalLink, Image as ImageIcon } from 'lucide-react'
import type { AppInfo, Workspace, WorkspaceDocument, WorkspaceEntry } from '../../shared/contracts'
import { ActivityBar } from './components/ActivityBar'
import { logoUrl } from './brand'
import { CommandPalette } from './components/CommandPalette'
import { Explorer } from './components/Explorer'
import { TerminalPanel } from './components/TerminalPanel'
import { AiProviderSettings } from './components/AiProviderSettings'
import { AgentPanel } from './components/AgentPanel'
import { GitPanel } from './components/GitPanel'
import { SearchPanel } from './components/SearchPanel'
import { PermissionModal } from './components/PermissionModal'
import ImageViewer from './components/ImageViewer'
import type { Command, ViewId } from './commands'
import { usePlatformBridge } from './platform/PlatformBridgeContext'

const MonacoEditor = lazy(async () => import('./components/MonacoEditor'))

function getViewerMode(fileName: string): 'code' | 'image' | 'html' | 'text' {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif'].includes(ext)) return 'image'
  if (['html', 'htm'].includes(ext)) return 'html'
  if (['md', 'mdx', 'txt', 'rst', 'adoc'].includes(ext)) return 'text'
  return 'code'
}

export function App() {
  const bridge = usePlatformBridge()
  const [activeView, setActiveView] = useState<ViewId>('explorer')
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [entries, setEntries] = useState<WorkspaceEntry[]>([])
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [appInfoFailed, setAppInfoFailed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [treeVersion, setTreeVersion] = useState(0)
  const [document, setDocument] = useState<WorkspaceDocument | null>(null)
  const [documentLoading, setDocumentLoading] = useState(false)
  const [documentError, setDocumentError] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [viewerMode, setViewerMode] = useState<'code' | 'image' | 'html' | 'text' | null>(null)
  const [binaryData, setBinaryData] = useState<{ dataUrl: string } | null>(null)
  const operationId = useRef(0)
  const documentOperationId = useRef(0)
  const openingWorkspace = useRef(false)

  useEffect(() => {
    void bridge.app.getInfo()
      .then((result) => { if (result.ok) setAppInfo(result.value); else setAppInfoFailed(true) })
      .catch(() => setAppInfoFailed(true))

    const autoOpenParam = new URLSearchParams(window.location.search).get('autoOpen')
    if (autoOpenParam) {
      try {
        const autoOpen = JSON.parse(autoOpenParam) as { workspace: Workspace; entries: WorkspaceEntry[]; openFile?: string }
        setWorkspace(autoOpen.workspace)
        setEntries(autoOpen.entries)
        setTreeVersion((v) => v + 1)
        if (autoOpen.openFile) {
          const fileToOpen = autoOpen.openFile
          setTimeout(() => { handleFileOpen(fileToOpen) }, 1000)
        }
      } catch { /* ignore */ }
      window.history.replaceState({}, '', window.location.pathname)
    } else {
      const timeout = window.setTimeout(() => { void (async () => {
        const current = await bridge.workspace.getCurrent()
        if (!current.ok || !current.value) return
        const listed = await bridge.workspace.listDirectory({ relativePath: '' })
        setWorkspace(current.value)
        if (listed.ok) {
          setEntries(listed.value)
          setTreeVersion((version) => version + 1)
        } else setError(listed.error.message)
        const session = await bridge.session.load()
        if (session.ok && session.value) {
          const tab = session.value.activeTab
          if (tab && listed.ok) {
            const match = listed.value.find((e) => e.relativePath === tab)
            if (match) setTimeout(() => { void openDocument(match) }, 500)
          }
        }
      })() }, bridge.runtime === 'electron' ? 100 : 0)
      return () => window.clearTimeout(timeout)
    }
  }, [bridge])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.repeat) return
      const commandModifier = event.ctrlKey !== event.metaKey && (event.ctrlKey || event.metaKey)
      if (commandModifier && event.shiftKey && !event.altKey && event.key.toLocaleLowerCase() === 'p') {
        event.preventDefault()
        setPaletteOpen(true)
      } else if (commandModifier && !event.shiftKey && !event.altKey && event.key.toLocaleLowerCase() === 'o' && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault()
        void openWorkspace()
      } else if (commandModifier && !event.shiftKey && !event.altKey && event.key.toLocaleLowerCase() === 's') {
        event.preventDefault()
        if (isDirty && editingContent !== null && document) {
          void handleSave()
        }
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [bridge, isDirty, editingContent, document])

  async function refreshWorkspace(): Promise<void> {
    if (!workspace || openingWorkspace.current) return
    const currentOperation = ++operationId.current
    setLoading(true)
    setError(null)
    try {
      const result = await bridge.workspace.listDirectory({ relativePath: '' })
      if (currentOperation !== operationId.current) return
      if (result.ok) { setEntries(result.value); setTreeVersion((version) => version + 1) }
      else setError(result.error.message)
    } catch {
      if (currentOperation === operationId.current) setError('The workspace could not be refreshed.')
    } finally {
      if (currentOperation === operationId.current) setLoading(false)
    }
  }

  async function saveSession(): Promise<void> {
    const ws = workspace
    if (!ws) return
    const tabs: { relativePath: string; scrollPosition: number; cursorLine: number; cursorColumn: number }[] = []
    if (document) tabs.push({ relativePath: document.relativePath, scrollPosition: 0, cursorLine: 0, cursorColumn: 0 })
    await bridge.session.save({ version: 1, workspace: ws.path, openTabs: tabs, activeTab: document?.relativePath ?? null, sidebarWidth: 280, fontFamily: '', fontSize: 14 })
  }

  async function openWorkspace(): Promise<void> {
    if (openingWorkspace.current) return
    openingWorkspace.current = true
    const currentOperation = ++operationId.current
    setLoading(true)
    setError(null)
    try {
      await saveSession()
      const result = await bridge.workspace.choose()
      if (currentOperation !== operationId.current) return
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      if (result.value) {
        const listed = await bridge.workspace.listDirectory({ relativePath: '' })
        if (currentOperation !== operationId.current) return
        setWorkspace(result.value)
        documentOperationId.current += 1
        setDocument(null)
        setDocumentError(null)
        setDocumentLoading(false)
        setEditingContent(null)
        setIsDirty(false)
        setViewerMode(null)
        setBinaryData(null)
        if (listed.ok) { setEntries(listed.value); setTreeVersion((version) => version + 1) }
        else { setEntries([]); setError(listed.error.message) }
      }
    } catch {
      if (currentOperation === operationId.current) setError('The workspace could not be opened.')
    } finally {
      openingWorkspace.current = false
      if (currentOperation === operationId.current) setLoading(false)
    }
  }

  async function openDocument(entry: WorkspaceEntry): Promise<void> {
    if (entry.kind !== 'file') return
    const currentOperation = ++documentOperationId.current
    setDocumentLoading(true)
    setDocument(null)
    setDocumentError(null)
    setEditingContent(null)
    setIsDirty(false)
    setBinaryData(null)

    const mode = getViewerMode(entry.name)
    setViewerMode(mode)

    try {
      if (mode === 'image') {
        const result = await bridge.workspace.readBinaryFile({ relativePath: entry.relativePath })
        if (currentOperation !== documentOperationId.current) return
        if (result.ok) {
          setDocument({ name: result.value.name, relativePath: result.value.relativePath, content: '' })
          setBinaryData({ dataUrl: result.value.dataUrl })
        } else {
          setDocumentError(result.error.message)
        }
      } else {
        const result = await bridge.workspace.readFile({ relativePath: entry.relativePath })
        if (currentOperation !== documentOperationId.current) return
        if (result.ok) {
          setDocument(result.value)
          if (mode === 'code') {
            setEditingContent(result.value.content)
          }
        } else {
          setDocumentError(result.error.message)
        }
      }
    } catch {
      if (currentOperation === documentOperationId.current) setDocumentError('The file could not be opened.')
    } finally {
      if (currentOperation === documentOperationId.current) setDocumentLoading(false)
    }
  }

  function closeDocument(): void {
    documentOperationId.current += 1
    void saveSession()
    setDocument(null)
    setDocumentError(null)
    setDocumentLoading(false)
    setEditingContent(null)
    setIsDirty(false)
    setViewerMode(null)
    setBinaryData(null)
  }

  function handleFileOpen(relativePath: string): void {
    const entry = entries.find((e) => e.relativePath === relativePath)
    if (entry) {
      void openDocument(entry)
    } else {
      const name = relativePath.split('/').pop() ?? relativePath
      const fakeEntry: WorkspaceEntry = { name, relativePath, kind: 'file' }
      void openDocument(fakeEntry)
    }
  }

  async function handleSave(): Promise<void> {
    if (!document || editingContent === null) return
    const result = await bridge.workspace.saveFile({ relativePath: document.relativePath, content: editingContent })
    if (result.ok) {
      setIsDirty(false)
    } else {
      setError(result.error.message)
    }
  }

  async function handleCreateFile(relativePath: string): Promise<void> {
    const result = await bridge.workspace.createFile({ relativePath, content: '' })
    if (result.ok) {
      void refreshWorkspace()
    } else {
      setError(result.error.message)
    }
  }

  async function handleCreateFolder(relativePath: string): Promise<void> {
    const result = await bridge.workspace.createFolder({ relativePath })
    if (result.ok) {
      void refreshWorkspace()
    } else {
      setError(result.error.message)
    }
  }

  async function handleRename(oldPath: string, newPath: string): Promise<void> {
    const result = await bridge.workspace.rename({ oldPath, newPath })
    if (result.ok) {
      if (document?.relativePath === oldPath) {
        closeDocument()
      }
      void refreshWorkspace()
    } else {
      setError(result.error.message)
    }
  }

  async function handleDelete(relativePath: string): Promise<void> {
    const result = await bridge.workspace.delete({ relativePath })
    if (result.ok) {
      if (document?.relativePath === relativePath) {
        closeDocument()
      }
      void refreshWorkspace()
    } else {
      setError(result.error.message)
    }
  }

  async function handleOpenInBrowser(): Promise<void> {
    if (!document) return
    const result = await bridge.liveServer.start({ filePath: document.relativePath })
    if (!result.ok) {
      setError(result.error.message)
    }
  }

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setEditingContent(value)
      setIsDirty(true)
    }
  }, [])

  const commands: Command[] = [
    { id: 'workspace.open', title: 'Open Folder', category: 'Workspace', shortcut: 'Ctrl+O', run: openWorkspace },
    { id: 'workspace.refresh', title: 'Refresh Explorer', category: 'Workspace', run: refreshWorkspace },
    { id: 'workspace.save', title: 'Save File', category: 'Workspace', shortcut: 'Ctrl+S', run: handleSave },
    { id: 'view.explorer', title: 'Show Explorer', category: 'View', run: () => setActiveView('explorer') },
    { id: 'view.search', title: 'Show Search', category: 'View', run: () => setActiveView('search') },
    { id: 'view.source-control', title: 'Show Source Control', category: 'View', shortcut: 'Ctrl+Shift+G', run: () => setActiveView('source-control') },
    { id: 'view.agent', title: 'Show Agent', category: 'View', run: () => setActiveView('agent') },
    { id: 'view.settings', title: 'Show Settings', category: 'View', run: () => setActiveView('settings') },
    { id: 'git.init', title: 'Init Repository', category: 'Git', run: () => { void bridge.git.init().then(() => setActiveView('source-control')) } },
    { id: 'git.refresh', title: 'Refresh Git Status', category: 'Git', run: () => setActiveView('source-control') }
  ]

  return <div className="app-shell">
    <div className="top-command"><button type="button" onClick={() => setPaletteOpen(true)} title="Open Command Palette (Ctrl+Shift+P)"><CommandIcon size={14} aria-hidden="true" /><span>{workspace?.name ?? 'Kadris'}</span></button></div>
    <ActivityBar active={activeView} onSelect={setActiveView} />
    {activeView === 'explorer'
      ? <Explorer
          workspace={workspace}
          entries={entries}
          loading={loading}
          error={error}
          treeVersion={treeVersion}
          activeFile={document?.relativePath ?? null}
          onOpen={() => { void openWorkspace() }}
          onRefresh={() => { void refreshWorkspace() }}
          onOpenFile={(entry) => { void openDocument(entry) }}
          onCreateFile={(path) => { void handleCreateFile(path) }}
          onCreateFolder={(path) => { void handleCreateFolder(path) }}
          onRename={(oldPath, newPath) => { void handleRename(oldPath, newPath) }}
          onDelete={(path) => { void handleDelete(path) }}
        />
      : activeView === 'search'
        ? <SearchPanel onOpenFile={(path) => handleFileOpen(path)} />
        : activeView === 'source-control'
          ? <GitPanel />
          : activeView === 'agent'
            ? <AgentPanel />
            : <AiProviderSettings />
    }
    <main className="editor-area">
      <div className={`editor-tab${document ? ' document-tab' : ''}`}>
        {document
          ? <>
              {viewerMode === 'image' ? <ImageIcon size={14} aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}
              <span title={document.relativePath}>{document.name}</span>
              {isDirty && <span className="modified-badge">MODIFIED</span>}
              <button type="button" onClick={closeDocument} title="Close file" aria-label="Close file"><X size={13} /></button>
            </>
          : <>
              <Braces size={14} aria-hidden="true" />
              <span>Welcome</span>
            </>
        }
      </div>
      {documentLoading
        ? <section className="document-state" role="status">Opening file...</section>
        : documentError
          ? <section className="document-state error" role="alert"><strong>Unable to open file</strong><span>{documentError}</span></section>
          : document
            ? <>
                {viewerMode === 'code' && (
                  <section className="document-view" aria-label={`${document.name}, code editor`}>
                    <div className="document-toolbar">
                      <span>{document.relativePath}</span>
                      {isDirty && <span className="modified-badge">MODIFIED</span>}
                      <button type="button" className="save-button" onClick={() => { void handleSave() }} title="Save (Ctrl+S)" disabled={!isDirty}>
                        <Save size={13} /> Save
                      </button>
                      {editingContent === null && <i>READ ONLY</i>}
                    </div>
                    <Suspense fallback={<div className="document-state">Loading editor...</div>}>
                      <MonacoEditor
                        value={editingContent ?? document.content}
                        fileName={document.relativePath}
                        onChange={handleEditorChange}
                        readOnly={editingContent === null}
                      />
                    </Suspense>
                  </section>
                )}
                {viewerMode === 'image' && (
                  <section className="document-view" aria-label={`${document.name}, image viewer`}>
                    <div className="document-toolbar">
                      <span>{document.relativePath}</span>
                      <i>IMAGE</i>
                    </div>
                    <ImageViewer dataUrl={binaryData?.dataUrl ?? ''} fileName={document.name} />
                  </section>
                )}
                {viewerMode === 'html' && (
                  <section className="document-view" aria-label={`${document.name}, HTML viewer`}>
                    <div className="document-toolbar">
                      <span>{document.relativePath}</span>
                      <button type="button" className="primary-button" onClick={() => { void handleOpenInBrowser() }} title="Open in Live Server">
                        <ExternalLink size={13} /> Open in Browser
                      </button>
                    </div>
                    <iframe
                      srcDoc={document.content}
                      title={document.name}
                      style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
                      sandbox="allow-scripts"
                    />
                  </section>
                )}
                {viewerMode === 'text' && (
                  <section className="document-view" aria-label={`${document.name}, text viewer`}>
                    <div className="document-toolbar">
                      <span>{document.relativePath}</span>
                      <i>READ ONLY</i>
                    </div>
                    <pre><code>{document.content}</code></pre>
                  </section>
                )}
              </>
            : <section className="welcome" aria-labelledby="welcome-title">
                <img className="kadris-logo" src={logoUrl} alt="" />
                 <p className="eyebrow">{bridge.runtime === 'electron' ? 'DESKTOP DEVELOPMENT ENVIRONMENT' : 'LOCAL WEB DEVELOPMENT ENVIRONMENT'}</p>
                <h1 id="welcome-title">Kadris</h1>
                <p className="welcome-copy">A secure, offline-first foundation for focused software development.</p>
                <div className="welcome-actions">
                  <button type="button" className="primary-button" disabled={loading} onClick={() => { void openWorkspace() }}>Open Folder</button>
                  <button type="button" className="secondary-button" onClick={() => setPaletteOpen(true)}>Command Palette</button>
                </div>
                <div className="security-note">
                  <ShieldCheck size={16} aria-hidden="true" />
                  <span>Renderer sandbox active. Provider settings store credentials but do not yet send AI requests.</span>
                </div>
              </section>
      }
    </main>
    <TerminalPanel />
    <footer className="status-bar">
      <span><ShieldCheck size={13} aria-hidden="true" />{bridge.runtime === 'electron' ? 'Sandboxed renderer' : 'Protected local session'}</span>
      <span>{document?.relativePath ?? (workspace ? workspace.path : 'No workspace')}</span>
      <span>{appInfo ? `v${appInfo.version}` : appInfoFailed ? 'Version unavailable' : 'Starting...'}</span>
    </footer>
    {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} onError={(message) => setError(message)} />}
    <PermissionModal />
  </div>
}
