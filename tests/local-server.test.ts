import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { startLocalServer, type LocalServerHandle } from '../src/local-server/index'
import type { EnvironmentReport } from '../src/environment/types'

const temporaryPaths: string[] = []
const servers: LocalServerHandle[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => server.stop()))
  await Promise.all(temporaryPaths.splice(0).map(async (path) => rm(path, { recursive: true, force: true })))
})

function report(): EnvironmentReport {
  return {
    platform: 'linux', runtime: 'headless', architecture: 'x64', hasGraphicalSession: false,
    isAndroidKernel: false, isTermux: false, isProot: false, isContainer: false, isWsl: false,
    isSsh: false, confidence: 'high', evidence: [], recommendedRuntime: 'web'
  }
}

function termuxReport(): EnvironmentReport {
  return {
    ...report(),
    platform: 'android', runtime: 'native-termux', architecture: 'arm64',
    isAndroidKernel: true, isTermux: true, recommendedRuntime: 'web'
  }
}

async function fixture(): Promise<{ root: string; web: string; workspace: string }> {
  const root = await mkdtemp(join(tmpdir(), 'kadris-local-server-'))
  temporaryPaths.push(root)
  const web = join(root, 'web')
  const workspace = join(root, 'workspace')
  await mkdir(web)
  await mkdir(workspace)
  await writeFile(join(web, 'index.html'), '<main>Kadris Web</main>')
  await writeFile(join(workspace, 'index.ts'), 'export const value = 1\n')
  return { root, web, workspace }
}

let nextPort = 43173

async function start(): Promise<LocalServerHandle> {
  const { web, workspace } = await fixture()
  const server = await startLocalServer({ webRoot: web, workspacePath: workspace, report: report(), port: nextPort++ })
  servers.push(server)
  return server
}

function rawRequest(server: LocalServerHandle, headers: Record<string, string>): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const req = request({ hostname: server.host, port: server.port, path: '/api/app', headers }, (response) => {
      response.resume()
      response.on('end', () => resolvePromise(response.statusCode ?? 0))
    })
    req.on('error', reject)
    req.end()
  })
}

describe('secure local server', () => {
  it('serves the web build only with its session token and emits security headers', async () => {
    const server = await start()
    const denied = await fetch(`http://${server.host}:${server.port}/`)
    expect(denied.status).toBe(401)

    const response = await fetch(server.url)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Kadris Web')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'")
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
  })

  it('rejects invalid tokens, foreign origins, and DNS rebinding hosts', async () => {
    const server = await start()
    const origin = `http://${server.host}:${server.port}`
    expect((await fetch(`${origin}/api/app`, { headers: { Authorization: 'Bearer invalid' } })).status).toBe(401)
    expect((await fetch(`${origin}/api/app`, { headers: { Authorization: `Bearer ${server.token}`, Origin: 'https://example.com' } })).status).toBe(403)
    expect(await rawRequest(server, { Host: 'attacker.example', Authorization: `Bearer ${server.token}` })).toBe(421)
  })

  it('provides bounded domain APIs and rejects unknown endpoints', async () => {
    const server = await start()
    const origin = `http://${server.host}:${server.port}`
    const headers = { Authorization: `Bearer ${server.token}`, 'Content-Type': 'application/json' }
    const read = await fetch(`${origin}/api/files/read`, { method: 'POST', headers, body: JSON.stringify({ relativePath: 'index.ts' }) })
    expect((await read.json() as { value: { content: string } }).value.content).toContain('export const')
    expect((await fetch(`${origin}/api/execute`, { headers })).status).toBe(404)

    const oversized = await fetch(`${origin}/api/files/save`, {
      method: 'POST', headers, body: JSON.stringify({ relativePath: 'index.ts', content: 'x'.repeat(2 * 1024 * 1024 + 20_000) })
    })
    expect(oversized.status).toBe(413)
  })

  it('initializes Git for a workspace that is not yet a repository', async () => {
    const server = await start()
    const origin = `http://${server.host}:${server.port}`
    const headers = { Authorization: `Bearer ${server.token}`, 'Content-Type': 'application/json' }
    const before = await fetch(`${origin}/api/git/is-repo`, { headers })
    expect(await before.json()).toMatchObject({ ok: true, value: false })
    const initialized = await fetch(`${origin}/api/git/init`, { method: 'POST', headers, body: '{}' })
    expect(initialized.status).toBe(200)
    const after = await fetch(`${origin}/api/git/is-repo`, { headers })
    expect(await after.json()).toMatchObject({ ok: true, value: true })
  })

  it('allows the configured native Termux home and returns a structured denial for its prefix', async () => {
    const { root, web, workspace } = await fixture()
    const prefix = join(root, 'prefix')
    const controlledTemp = join(root, 'kadris-temp')
    await mkdir(prefix)
    const server = await startLocalServer({
      webRoot: web,
      workspacePath: workspace,
      report: termuxReport(),
      port: nextPort++,
      pathPolicyOverrides: { home: workspace, prefix, tempRoot: controlledTemp }
    })
    servers.push(server)
    const response = await fetch(`http://${server.host}:${server.port}/api/workspace/open`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${server.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: prefix })
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'NOT_AUTHORIZED', pathCode: 'TERMUX_PREFIX_NOT_AUTHORIZED' }
    })
  })

  it('keeps workspace reads confined when a symlink points outside', async () => {
    const { root, web, workspace } = await fixture()
    const outside = join(root, 'secret.txt')
    await writeFile(outside, 'private')
    await symlink(outside, join(workspace, 'outside.txt'))
    const server = await startLocalServer({ webRoot: web, workspacePath: workspace, report: report(), port: nextPort++ })
    servers.push(server)
    const response = await fetch(`http://${server.host}:${server.port}/api/files/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${server.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ relativePath: 'outside.txt' })
    })
    expect(response.status).toBe(400)
    expect(await response.text()).toContain('escapes workspace')
  })

  it('selects another port without killing an existing instance', async () => {
    const first = await start()
    const { web, workspace } = await fixture()
    const second = await startLocalServer({ webRoot: web, workspacePath: workspace, report: report(), port: first.port })
    servers.push(second)
    expect(second.port).toBe(first.port + 1)
    expect((await fetch(`http://${first.host}:${first.port}/api/health`)).status).toBe(200)
  })

  it('rejects an unauthenticated terminal WebSocket', async () => {
    const server = await start()
    const status = await new Promise<number>((resolvePromise) => {
      const socket = new WebSocket(`ws://${server.host}:${server.port}/ws/platform`)
      socket.on('unexpected-response', (_request, response) => resolvePromise(response.statusCode ?? 0))
      socket.on('error', () => resolvePromise(0))
    })
    expect(status).toBe(401)
  })
})
