import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }))

import { LiveServerService } from '../src/main/services/live-server-service'

const temporaryPaths: string[] = []

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map(async (path) => rm(path, { recursive: true, force: true })))
})

describe('LiveServerService', () => {
  it('serves the selected HTML file at its root URL', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kadris-live-server-'))
    temporaryPaths.push(directory)
    const filePath = join(directory, 'index.html')
    await writeFile(filePath, '<h1>Kadris</h1>')
    const service = new LiveServerService()
    await service.start(filePath, directory)

    const status = service.getStatus()
    const response = await fetch(status.url!)

    expect(await response.text()).toBe('<h1>Kadris</h1>')
    expect(response.headers.get('content-type')).toBe('text/html')
    service.destroy()
  })

  it('rejects paths outside the served directory', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'kadris-live-server-'))
    temporaryPaths.push(parent)
    const directory = join(parent, 'site')
    const filePath = join(directory, 'index.html')
    await mkdir(directory)
    await writeFile(filePath, '<h1>Kadris</h1>')
    await writeFile(join(parent, 'secret.txt'), 'private')
    const service = new LiveServerService()
    await service.start(filePath, directory)

    const response = await fetch(`${service.getStatus().url}/..%2fsecret.txt`)

    expect(response.status).toBe(403)
    service.destroy()
  })
})
