import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, FilePlus, FolderOpen, FolderPlus, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import type { Workspace, WorkspaceEntry } from '../../../shared/contracts'
import { EntryIcon } from './EntryIcon'
import { usePlatformBridge } from '../platform/PlatformBridgeContext'

interface DirectoryState {
  status: 'loading' | 'loaded' | 'error'
  entries: WorkspaceEntry[]
  error?: string
}

export function Explorer({ workspace, entries, loading, error, treeVersion, activeFile, onOpen, onRefresh, onOpenFile, onCreateFile, onCreateFolder, onRename, onDelete }: {
  workspace: Workspace | null
  entries: WorkspaceEntry[]
  loading: boolean
  error: string | null
  treeVersion: number
  activeFile: string | null
  onOpen: () => void
  onRefresh: () => void
  onOpenFile: (entry: WorkspaceEntry) => void
  onCreateFile?: (path: string) => void
  onCreateFolder?: (path: string) => void
  onRename?: (oldPath: string, newPath: string) => void
  onDelete?: (path: string) => void
}) {
  const bridge = usePlatformBridge()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [directories, setDirectories] = useState<Record<string, DirectoryState>>({})
  const generation = useRef(0)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: WorkspaceEntry | null } | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [creating, setCreating] = useState<{ kind: 'file' | 'folder'; parentPath: string } | null>(null)
  const [createValue, setCreateValue] = useState('')
  const contextMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    generation.current += 1
    setExpanded(new Set())
    setDirectories({})
    setContextMenu(null)
    setRenamingPath(null)
    setCreating(null)
  }, [workspace?.path, treeVersion])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  useEffect(() => {
    if (!contextMenu) return
    function handleClickOutside(event: MouseEvent): void {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        closeContextMenu()
      }
    }
    function handleEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') closeContextMenu()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [contextMenu, closeContextMenu])

  async function loadDirectory(entry: WorkspaceEntry): Promise<void> {
    const requestGeneration = generation.current
    setDirectories((current) => ({ ...current, [entry.relativePath]: { status: 'loading', entries: [] } }))
    try {
      const result = await bridge.workspace.listDirectory({ relativePath: entry.relativePath })
      if (requestGeneration !== generation.current) return
      setDirectories((current) => ({
        ...current,
        [entry.relativePath]: result.ok
          ? { status: 'loaded', entries: result.value }
          : { status: 'error', entries: [], error: result.error.message }
      }))
    } catch {
      if (requestGeneration === generation.current) {
        setDirectories((current) => ({ ...current, [entry.relativePath]: { status: 'error', entries: [], error: 'Directory could not be loaded.' } }))
      }
    }
  }

  function toggleDirectory(entry: WorkspaceEntry): void {
    const opening = !expanded.has(entry.relativePath)
    setExpanded((current) => {
      const next = new Set(current)
      if (opening) next.add(entry.relativePath)
      else next.delete(entry.relativePath)
      return next
    })
    if (opening && !directories[entry.relativePath]) void loadDirectory(entry)
  }

  function handleContextMenu(event: React.MouseEvent, entry: WorkspaceEntry | null): void {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ x: event.clientX, y: event.clientY, entry })
  }

  function handleCreate(): void {
    if (!creating || !createValue.trim()) return
    const sep = creating.parentPath ? '/' : ''
    const path = `${creating.parentPath}${sep}${createValue.trim()}`
    if (creating.kind === 'file') {
      onCreateFile?.(path)
    } else {
      onCreateFolder?.(path)
    }
    setCreating(null)
    setCreateValue('')
    closeContextMenu()
  }

  function startRename(entry: WorkspaceEntry): void {
    setRenamingPath(entry.relativePath)
    setRenameValue(entry.name)
    closeContextMenu()
  }

  function confirmRename(entry: WorkspaceEntry): void {
    if (!renameValue.trim() || renameValue.trim() === entry.name) {
      setRenamingPath(null)
      setRenameValue('')
      return
    }
    const dirPath = entry.relativePath.substring(0, entry.relativePath.lastIndexOf('/'))
    const sep = dirPath ? '/' : ''
    const newPath = `${dirPath}${sep}${renameValue.trim()}`
    onRename?.(entry.relativePath, newPath)
    setRenamingPath(null)
    setRenameValue('')
  }

  function cancelRename(): void {
    setRenamingPath(null)
    setRenameValue('')
  }

  function handleDelete(entry: WorkspaceEntry): void {
    if (!window.confirm(`Delete "${entry.name}"?`)) return
    onDelete?.(entry.relativePath)
    closeContextMenu()
  }

  function handleStartCreate(kind: 'file' | 'folder', parentEntry: WorkspaceEntry | null): void {
    const parentPath = parentEntry?.relativePath ?? ''
    setCreating({ kind, parentPath })
    setCreateValue('')
    closeContextMenu()
  }

  function renderEntries(items: WorkspaceEntry[], depth: number): React.ReactNode {
    return items.map((entry) => {
      const isDirectory = entry.kind === 'directory'
      const isFile = entry.kind === 'file'
      const isExpanded = expanded.has(entry.relativePath)
      const childState = directories[entry.relativePath]
      const isRenaming = renamingPath === entry.relativePath
      return <div key={entry.relativePath}>
        <button
          type="button"
          className={`tree-row${isDirectory || isFile ? ' openable' : ''}${activeFile === entry.relativePath ? ' selected' : ''}`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          aria-expanded={isDirectory ? isExpanded : undefined}
          aria-current={activeFile === entry.relativePath ? 'page' : undefined}
          onClick={isDirectory ? () => toggleDirectory(entry) : isFile ? () => onOpenFile(entry) : undefined}
          onContextMenu={(e) => (onCreateFile || onCreateFolder || onRename || onDelete) && handleContextMenu(e, entry)}
        >
          <span className="tree-chevron">{isDirectory ? isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}</span>
          <EntryIcon entry={entry} />
          {isRenaming ? <span className="inline-rename">
            <input
              type="text"
              value={renameValue}
              autoFocus
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmRename(entry)
                else if (e.key === 'Escape') cancelRename()
              }}
              onBlur={() => confirmRename(entry)}
              onClick={(e) => e.stopPropagation()}
              style={{ background: '#1e2028', color: '#c8cad0', border: '1px solid #5294e2', borderRadius: 2, padding: '1px 4px', fontSize: 'inherit', fontFamily: 'inherit', outline: 'none', width: `${Math.max(60, renameValue.length * 8)}px` }}
            />
          </span> : <span title={entry.name}>{entry.name}</span>}
        </button>
        {creating && creating.parentPath === entry.relativePath && <div style={{ paddingLeft: `${8 + (depth + 1) * 14}px`, display: 'flex', alignItems: 'center', gap: 4 }}>
          <EntryIcon entry={{ name: '', kind: creating.kind === 'folder' ? 'directory' : 'file' }} />
          <input
            type="text"
            value={createValue}
            autoFocus
            placeholder={creating.kind === 'folder' ? 'New folder' : 'New file'}
            onChange={(e) => setCreateValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              else if (e.key === 'Escape') { setCreating(null); setCreateValue('') }
            }}
            onBlur={() => { if (createValue.trim()) handleCreate(); else { setCreating(null); setCreateValue('') } }}
            style={{ background: '#1e2028', color: '#c8cad0', border: '1px solid #5294e2', borderRadius: 2, padding: '1px 4px', fontSize: 'inherit', fontFamily: 'inherit', outline: 'none', flex: 1 }}
          />
        </div>}
        {isDirectory && isExpanded && childState?.status === 'loading' && <div className="tree-state" style={{ paddingLeft: `${31 + depth * 14}px` }}>Loading...</div>}
        {isDirectory && isExpanded && childState?.status === 'error' && <button type="button" className="tree-state tree-error" style={{ paddingLeft: `${31 + depth * 14}px` }} onClick={() => { void loadDirectory(entry) }}>{childState.error} Retry</button>}
        {isDirectory && isExpanded && childState?.status === 'loaded' && (childState.entries.length === 0 ? <div className="tree-state" style={{ paddingLeft: `${31 + depth * 14}px` }}>Empty folder</div> : renderEntries(childState.entries, depth + 1))}
      </div>
    })
  }

  const canCreate = !!(onCreateFile || onCreateFolder)

  return <aside className="side-panel" aria-label="Explorer">
    <header className="panel-header"><span>EXPLORER</span>{workspace && <button type="button" title="Refresh workspace" aria-label="Refresh workspace" onClick={onRefresh} disabled={loading}><RefreshCw size={14} aria-hidden="true" /></button>}</header>
    {!workspace ? <div className="empty-panel"><FolderOpen size={28} aria-hidden="true" /><p>No workspace is open.</p><button type="button" className="primary-button" onClick={onOpen} disabled={loading}>Open Folder</button></div> : <>
      <div
        className="workspace-name"
        title={workspace.path}
        onContextMenu={(e) => canCreate && handleContextMenu(e, null)}
      ><ChevronRight size={14} aria-hidden="true" />{workspace.name}</div>
      {loading ? <p className="state-message" role="status">Loading workspace...</p> : error ? <p className="state-message error" role="alert">{error}</p> : <div className="file-list" role="tree">{renderEntries(entries, 0)}</div>}
    </>}
    {contextMenu && <div
      ref={contextMenuRef}
      style={{
        position: 'fixed',
        left: contextMenu.x,
        top: contextMenu.y,
        zIndex: 9999,
        background: '#1e2028',
        border: '1px solid #3b3f49',
        borderRadius: 4,
        padding: '4px 0',
        minWidth: 160,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        fontSize: 13,
      }}
    >
      {onCreateFile && <button type="button" style={menuItemStyle} onClick={() => handleStartCreate('file', contextMenu.entry)}>
        <FilePlus size={14} /> New File
      </button>}
      {onCreateFolder && <button type="button" style={menuItemStyle} onClick={() => handleStartCreate('folder', contextMenu.entry)}>
        <FolderPlus size={14} /> New Folder
      </button>}
      {onCreateFile && contextMenu.entry && <div style={menuDividerStyle} />}
      {onRename && contextMenu.entry && <button type="button" style={menuItemStyle} onClick={() => startRename(contextMenu.entry!)}>
        <Pencil size={14} /> Rename
      </button>}
      {onDelete && contextMenu.entry && <button type="button" style={{ ...menuItemStyle, color: '#f07178' }} onClick={() => handleDelete(contextMenu.entry!)}>
        <Trash2 size={14} /> Delete
      </button>}
    </div>}
  </aside>
}

const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '6px 12px',
  border: 'none',
  background: 'transparent',
  color: '#c8cad0',
  cursor: 'pointer',
  textAlign: 'left',
  fontSize: 13,
}

const menuDividerStyle: React.CSSProperties = {
  height: 1,
  background: '#3b3f49',
  margin: '4px 0',
}
