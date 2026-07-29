import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkspaceService } from '../src/main/services/workspace-service'

const temporaryPaths: string[] = []

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map(async (path) => rm(path, { recursive: true, force: true })))
})

async function temporaryDirectory(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix))
  temporaryPaths.push(path)
  return path
}

describe('WorkspaceService', () => {
  it('uses a nonempty display name for a filesystem root', async () => {
    const workspace = await new WorkspaceService().setRoot('/')
    expect(workspace.name).toBe('/')
  })

  it('sorts directories first and files with symlinks by name', async () => {
    const root = await temporaryDirectory('kadris-workspace-')
    await mkdir(join(root, 'folder'))
    await writeFile(join(root, 'alpha.txt'), 'alpha')
    await symlink(join(root, 'alpha.txt'), join(root, 'zeta-link'))
    const service = new WorkspaceService()
    await service.setRoot(root)

    const entries = await service.listDirectory('')
    expect(entries.map((entry) => entry.name)).toEqual(['folder', 'alpha.txt', 'zeta-link'])
  })

  it('rejects a symbolic link that resolves outside the workspace', async () => {
    const root = await temporaryDirectory('kadris-workspace-')
    const outside = await temporaryDirectory('kadris-outside-')
    await symlink(outside, join(root, 'outside'))
    const service = new WorkspaceService()
    await service.setRoot(root)

    await expect(service.listDirectory('outside')).rejects.toThrow('escapes workspace')
  })

  it('revokes workspace access when its owner reloads or closes', async () => {
    const root = await temporaryDirectory('kadris-workspace-')
    const service = new WorkspaceService()
    await service.setRoot(root)
    service.clearRoot()

    await expect(service.listDirectory('')).rejects.toThrow('No workspace is open')
  })

  it('reads a bounded UTF-8 text file inside the workspace', async () => {
    const root = await temporaryDirectory('kadris-workspace-')
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'src', 'index.ts'), 'export const name = "Kadris"\n')
    const service = new WorkspaceService()
    await service.setRoot(root)

    await expect(service.readFile('src/index.ts')).resolves.toEqual({
      name: 'index.ts',
      relativePath: join('src', 'index.ts'),
      content: 'export const name = "Kadris"\n'
    })
  })

  it('rejects binary, oversized, and escaping files', async () => {
    const root = await temporaryDirectory('kadris-workspace-')
    const outside = await temporaryDirectory('kadris-outside-')
    await writeFile(join(root, 'binary.bin'), Buffer.from([1, 0, 2]))
    await writeFile(join(root, 'large.txt'), Buffer.alloc(2 * 1024 * 1024 + 1, 97))
    await writeFile(join(outside, 'secret.txt'), 'secret')
    await symlink(join(outside, 'secret.txt'), join(root, 'outside.txt'))
    const service = new WorkspaceService()
    await service.setRoot(root)

    await expect(service.readFile('binary.bin')).rejects.toThrow('Binary files')
    await expect(service.readFile('large.txt')).rejects.toThrow('size limit')
    await expect(service.readFile('outside.txt')).rejects.toThrow('escapes workspace')
  })
})
