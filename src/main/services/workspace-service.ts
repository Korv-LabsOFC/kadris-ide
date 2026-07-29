import { lstat, mkdir, opendir, readFile, realpath, rename, rmdir, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { workspaceDocumentSchema, workspaceSchema, type Workspace, type WorkspaceDocument, type WorkspaceEntry } from '../../shared/contracts'

const MAX_DIRECTORY_ENTRIES = 5000
const MAX_DIRECTORY_RESULT_BYTES = 1024 * 1024
const MAX_FILE_BYTES = 2 * 1024 * 1024

export class WorkspaceService {
  #root: string | null = null

  clearRoot(): void {
    this.#root = null
  }

  getRoot(): string | null {
    return this.#root
  }

  async setRoot(selectedPath: string): Promise<Workspace> {
    const root = await realpath(selectedPath)
    const metadata = await lstat(root)
    if (!metadata.isDirectory()) throw new Error('The selected path is not a directory')
    const workspace = workspaceSchema.parse({ name: basename(root) || root, path: root })
    this.#root = root
    return workspace
  }

  async listDirectory(relativePath: string): Promise<WorkspaceEntry[]> {
    const root = this.#requireRoot()
    const canonical = await this.#resolveWithinRoot(relativePath)

    const directory = await opendir(canonical)
    const entries: WorkspaceEntry[] = []
    let resultBytes = 0
    for await (const entry of directory) {
      if (entries.length === MAX_DIRECTORY_ENTRIES) throw new Error('Directory entry limit exceeded')
      const item: WorkspaceEntry = {
        name: entry.name,
        relativePath: relative(root, resolve(canonical, entry.name)),
        kind: entry.isSymbolicLink() ? 'symbolic-link' : entry.isDirectory() ? 'directory' : 'file'
      }
      resultBytes += Buffer.byteLength(item.name) + Buffer.byteLength(item.relativePath) + 32
      if (resultBytes > MAX_DIRECTORY_RESULT_BYTES) throw new Error('Directory result size limit exceeded')
      entries.push(item)
    }

    return entries.sort((left, right) => {
      const leftDirectory = left.kind === 'directory'
      const rightDirectory = right.kind === 'directory'
      if (leftDirectory !== rightDirectory) return leftDirectory ? -1 : 1
      return left.name.localeCompare(right.name)
    })
  }

  async readFile(relativePath: string): Promise<WorkspaceDocument> {
    const root = this.#requireRoot()
    const canonical = await this.#resolveWithinRoot(relativePath)
    const metadata = await lstat(canonical)
    if (!metadata.isFile()) throw new Error('The selected path is not a regular file')
    if (metadata.size > MAX_FILE_BYTES) throw new Error('File size limit exceeded')
    const data = await readFile(canonical)
    if (data.byteLength > MAX_FILE_BYTES) throw new Error('File size limit exceeded')
    if (data.includes(0)) throw new Error('Binary files cannot be opened as text')
    let content: string
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(data)
    } catch {
      throw new Error('The file is not valid UTF-8 text')
    }
    return workspaceDocumentSchema.parse({ name: basename(canonical), relativePath: relative(root, canonical), content })
  }

  async createFile(relativePath: string, content: string): Promise<WorkspaceEntry> {
    const root = this.#requireRoot()
    const { parentCanonical, childName } = await this.#resolveParentDirectory(relativePath)
    await mkdir(parentCanonical, { recursive: true })
    const targetPath = resolve(parentCanonical, childName)
    await writeFile(targetPath, content, 'utf-8')
    return { name: childName, relativePath: relative(root, targetPath), kind: 'file' }
  }

  async createFolder(relativePath: string): Promise<WorkspaceEntry> {
    const root = this.#requireRoot()
    const { parentCanonical, childName } = await this.#resolveParentDirectory(relativePath)
    await mkdir(parentCanonical, { recursive: true })
    const targetPath = resolve(parentCanonical, childName)
    await mkdir(targetPath, { recursive: true })
    return { name: childName, relativePath: relative(root, targetPath), kind: 'directory' }
  }

  async saveFile(relativePath: string, content: string): Promise<void> {
    const canonical = await this.#resolveWithinRoot(relativePath)
    const metadata = await lstat(canonical)
    if (!metadata.isFile()) throw new Error('The selected path is not a regular file')
    await writeFile(canonical, content, 'utf-8')
  }

  async renameEntry(oldPath: string, newPath: string): Promise<WorkspaceEntry> {
    const root = this.#requireRoot()
    const oldCanonical = await this.#resolveWithinRoot(oldPath)
    const { parentCanonical, childName } = await this.#resolveParentDirectory(newPath)
    const newCanonical = resolve(parentCanonical, childName)
    await rename(oldCanonical, newCanonical)
    const metadata = await lstat(newCanonical)
    return {
      name: basename(newCanonical),
      relativePath: relative(root, newCanonical),
      kind: metadata.isDirectory() ? 'directory' : 'file'
    }
  }

  async deleteEntry(relativePath: string): Promise<void> {
    const canonical = await this.#resolveWithinRoot(relativePath)
    const metadata = await lstat(canonical)
    if (metadata.isDirectory()) {
      await rmdir(canonical)
    } else {
      await unlink(canonical)
    }
  }

  async readBinaryFile(relativePath: string): Promise<{ name: string; relativePath: string; dataUrl: string }> {
    const root = this.#requireRoot()
    const canonical = await this.#resolveWithinRoot(relativePath)
    const metadata = await lstat(canonical)
    if (!metadata.isFile()) throw new Error('The selected path is not a regular file')
    if (metadata.size > MAX_FILE_BYTES) throw new Error('File size limit exceeded')
    const data = await readFile(canonical)
    const base64 = data.toString('base64')
    const ext = extname(canonical).toLowerCase()
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.ico': 'image/x-icon',
      '.bmp': 'image/bmp',
      '.avif': 'image/avif',
      '.pdf': 'application/pdf',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.otf': 'font/otf'
    }
    const mime = mimeMap[ext] ?? 'application/octet-stream'
    return {
      name: basename(canonical),
      relativePath: relative(root, canonical),
      dataUrl: `data:${mime};base64,${base64}`
    }
  }

  #requireRoot(): string {
    if (!this.#root) throw new Error('No workspace is open')
    return this.#root
  }

  async #resolveWithinRoot(relativePath: string): Promise<string> {
    const root = this.#requireRoot()
    if (isAbsolute(relativePath)) throw new Error('Absolute paths are not accepted')
    const candidate = resolve(root, relativePath)
    const relation = relative(root, candidate)
    if (relation.startsWith(`..${sep}`) || relation === '..') throw new Error('Path escapes workspace')
    const canonical = await realpath(candidate)
    const canonicalRelation = relative(root, canonical)
    if (canonicalRelation.startsWith(`..${sep}`) || canonicalRelation === '..') throw new Error('Symbolic link escapes workspace')
    return canonical
  }

  async #resolveParentDirectory(relativePath: string): Promise<{ parentCanonical: string; childName: string }> {
    const root = this.#requireRoot()
    if (isAbsolute(relativePath)) throw new Error('Absolute paths are not accepted')
    const candidate = resolve(root, relativePath)
    const parentCandidate = dirname(candidate)
    const childName = basename(candidate)
    const parentRelation = relative(root, parentCandidate)
    if (parentRelation.startsWith(`..${sep}`) || parentRelation === '..') throw new Error('Path escapes workspace')
    const parentCanonical = await realpath(parentCandidate)
    const canonicalRelation = relative(root, parentCanonical)
    if (canonicalRelation.startsWith(`..${sep}`) || canonicalRelation === '..') throw new Error('Symbolic link escapes workspace')
    return { parentCanonical, childName }
  }
}
