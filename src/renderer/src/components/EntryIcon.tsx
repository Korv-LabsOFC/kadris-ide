import {
  Archive,
  Database,
  File,
  FileCode2,
  FileCog,
  FileImage,
  FileJson2,
  FileTerminal,
  FileText,
  Folder,
  FolderCode,
  FolderCog,
  FolderGit2,
  Globe,
  Link,
  Lock,
  Music,
  Palette,
  Video
} from 'lucide-react'
import type { WorkspaceEntry } from '../../../shared/contracts'

export type EntryIconKind =
  | 'folder'
  | 'folder-code'
  | 'folder-test'
  | 'folder-git'
  | 'folder-dependency'
  | 'code-ts'
  | 'code-js'
  | 'code-py'
  | 'code-rs'
  | 'code-go'
  | 'code-java'
  | 'code-c'
  | 'code-html'
  | 'code-css'
  | 'json'
  | 'text'
  | 'image'
  | 'config'
  | 'terminal'
  | 'link'
  | 'file'
  | 'archive'
  | 'audio'
  | 'video'
  | 'database'
  | 'lock'
  | 'web'

export function getEntryIconKind(entry: Pick<WorkspaceEntry, 'kind' | 'name'>): EntryIconKind {
  const name = entry.name.toLocaleLowerCase()
  if (entry.kind === 'symbolic-link') return 'link'
  if (entry.kind === 'directory') {
    if (name === '.git') return 'folder-git'
    if (name === 'node_modules' || name === 'vendor' || name === '.venv') return 'folder-dependency'
    if (['test', 'tests', '__tests__', 'spec', 'specs'].includes(name)) return 'folder-test'
    if (['src', 'app', 'lib', 'packages', 'components'].includes(name)) return 'folder-code'
    if (['.github', '.vscode', '.idea', 'config'].includes(name)) return 'folder-dependency'
    return 'folder'
  }

  if (/\.(lockb|lock)$/.test(name) || name === 'package-lock.json' || name === 'yarn.lock' || name === 'pnpm-lock.yaml') return 'lock'
  if (/\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)$/.test(name)) return 'image'
  if (/\.(mp3|wav|ogg|flac|aac)$/.test(name)) return 'audio'
  if (/\.(mp4|webm|avi|mov|mkv)$/.test(name)) return 'video'
  if (/\.(sql|sqlite|db)$/.test(name)) return 'database'
  if (/\.(zip|tar|gz|bz2|xz|7z|rar)$/.test(name)) return 'archive'
  if (/\.(ts|tsx)$/.test(name)) return 'code-ts'
  if (/\.(js|jsx|mjs|cjs)$/.test(name)) return 'code-js'
  if (/\.py$/.test(name)) return 'code-py'
  if (/\.rs$/.test(name)) return 'code-rs'
  if (/\.go$/.test(name)) return 'code-go'
  if (/\.(java|kt)$/.test(name)) return 'code-java'
  if (/\.(c|cc|cpp|h|hpp|cs)$/.test(name)) return 'code-c'
  if (/\.(html|htm|vue|svelte)$/.test(name)) return 'code-html'
  if (/\.(css|scss|sass|less|styl)$/.test(name)) return 'code-css'
  if (/\.(json|jsonc|jsonl)$/.test(name)) return 'json'
  if (/\.(md|mdx|txt|rst|adoc)$/.test(name)) return 'text'
  if (/\.(ya?ml|toml|ini|env|properties)$/.test(name)) return 'config'
  if (name === 'dockerfile' || name === 'makefile' || /\.(sh|ps1|bat)$/.test(name)) return 'terminal'
  if (name.startsWith('.')) return 'config'

  return 'file'
}

const icons = {
  folder: Folder,
  'folder-code': FolderCode,
  'folder-test': FolderCog,
  'folder-git': FolderGit2,
  'folder-dependency': FolderCog,
  'code-ts': FileCode2,
  'code-js': FileCode2,
  'code-py': FileCode2,
  'code-rs': FileCode2,
  'code-go': FileCode2,
  'code-java': FileCode2,
  'code-c': FileCode2,
  'code-html': FileCode2,
  'code-css': Palette,
  json: FileJson2,
  text: FileText,
  image: FileImage,
  config: FileCog,
  terminal: FileTerminal,
  link: Link,
  file: File,
  archive: Archive,
  audio: Music,
  video: Video,
  database: Database,
  lock: Lock,
  web: Globe
} as const

const iconColors: Record<EntryIconKind, string> = {
  folder: '#d0a85b',
  'folder-code': '#d0a85b',
  'folder-test': '#8ab78a',
  'folder-git': '#d8784e',
  'folder-dependency': '#8b91a0',
  'code-ts': '#5294e2',
  'code-js': '#e8d44d',
  'code-py': '#4caf50',
  'code-rs': '#e8723a',
  'code-go': '#00add8',
  'code-java': '#f89820',
  'code-c': '#6b8cff',
  'code-html': '#e44d26',
  'code-css': '#a855f7',
  json: '#d2ba66',
  text: '#aeb5c2',
  image: '#b58bd1',
  config: '#8fa6b8',
  terminal: '#80b58d',
  link: '#6fabc0',
  file: '#858d9b',
  archive: '#8b91a0',
  audio: '#e88a5e',
  video: '#e85e5e',
  database: '#5e8ce8',
  lock: '#b08050',
  web: '#5ec4e8'
}

export function EntryIcon({ entry }: { entry: Pick<WorkspaceEntry, 'kind' | 'name'> }) {
  const kind = getEntryIconKind(entry)
  const Icon = icons[kind]
  const color = iconColors[kind]
  return <Icon size={15} aria-hidden="true" style={{ color, flexShrink: 0 }} />
}
