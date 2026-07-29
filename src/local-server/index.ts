import { randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, realpath } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname, relative, resolve, sep } from 'node:path'
import { z } from 'zod'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import { WorkspaceService } from '../main/services/workspace-service'
import { CodexService } from '../main/services/codex-service'
import {
  createFileInputSchema,
  createFolderInputSchema,
  deleteInputSchema,
  listDirectoryInputSchema,
  readBinaryFileInputSchema,
  readWorkspaceFileInputSchema,
  renameInputSchema,
  saveFileInputSchema,
  codexCancelLoginInputSchema,
  codexCancelRunInputSchema,
  codexRunInputSchema,
  type AppError
} from '../shared/contracts'
import {
  terminalCloseInputSchema,
  terminalCreateInputSchema,
  terminalResizeInputSchema,
  terminalWriteInputSchema
} from '../shared/terminal-contracts'
import type { EnvironmentReport } from '../environment/types'
import { LocalTerminalManager } from './terminal-manager'

const MAX_BODY_BYTES = 2 * 1024 * 1024 + 16 * 1024
const RATE_LIMIT = 240
const RATE_WINDOW_MS = 60_000
const SESSION_COOKIE = 'kadris_session'
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.ttf': 'font/ttf',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json; charset=utf-8'
}

const wsRequestSchema = z.discriminatedUnion('action', [
  z.object({ id: z.string().uuid(), action: z.literal('terminal.create'), input: terminalCreateInputSchema }).strict(),
  z.object({ id: z.string().uuid(), action: z.literal('terminal.write'), input: terminalWriteInputSchema }).strict(),
  z.object({ id: z.string().uuid(), action: z.literal('terminal.resize'), input: terminalResizeInputSchema }).strict(),
  z.object({ id: z.string().uuid(), action: z.literal('terminal.close'), input: terminalCloseInputSchema }).strict()
])

export interface LocalServerOptions {
  webRoot: string
  report: EnvironmentReport
  workspacePath?: string
  host?: string
  port?: number
  safeMode?: boolean
  version?: string
}

export interface LocalServerHandle {
  url: string
  host: string
  port: number
  token: string
  workspace: WorkspaceService
  report: EnvironmentReport
  stop: () => Promise<void>
}

function errorResult(error: unknown): { ok: false; error: AppError } {
  const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown operation failure'
  const code: AppError['code'] = /not found|ENOENT/i.test(message)
    ? 'NOT_FOUND'
    : /unsupported|safe mode/i.test(message)
      ? 'UNSUPPORTED'
      : /absolute paths|escapes workspace|not a directory|not a regular file|Android blocked|invalid/i.test(message)
        ? 'INVALID_INPUT'
        : 'IO_ERROR'
  return { ok: false, error: { code, message } }
}

function writeSecurityHeaders(response: ServerResponse): void {
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; worker-src 'self' blob:; object-src 'none'; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  response.setHeader('Cache-Control', 'no-store')
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  writeSecurityHeaders(response)
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

function cookieToken(request: IncomingMessage): string | null {
  const cookie = request.headers.cookie ?? ''
  for (const part of cookie.split(';')) {
    const [name, value] = part.trim().split('=', 2)
    if (name === SESSION_COOKIE && value) return value
  }
  return null
}

function bearerToken(request: IncomingMessage): string | null {
  const authorization = request.headers.authorization
  return authorization?.startsWith('Bearer ') ? authorization.slice(7) : null
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const declared = Number(request.headers['content-length'] ?? 0)
  if (declared > MAX_BODY_BYTES) throw new Error('Payload limit exceeded')
  const chunks: Uint8Array[] = []
  let total = 0
  for await (const chunk of request as AsyncIterable<Uint8Array>) {
    const buffer = Buffer.from(chunk)
    total += buffer.byteLength
    if (total > MAX_BODY_BYTES) throw new Error('Payload limit exceeded')
    chunks.push(buffer)
  }
  if (total === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function websocketText(raw: RawData): string {
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8')
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8')
  return raw.toString('utf8')
}

function isWithin(root: string, candidate: string): boolean {
  const relation = relative(root, candidate)
  return relation === '' || (relation !== '..' && !relation.startsWith(`..${sep}`))
}

function isAndroidRestricted(report: EnvironmentReport, path: string): boolean {
  if (report.platform !== 'android') return false
  const normalized = resolve(path)
  const exactRestricted = ['/data', '/data/data', '/data/user', '/data/user/0']
  if (exactRestricted.some((entry) => normalized === entry || normalized.startsWith(`${entry}${sep}`))) return true
  return /(?:^|[/\\])Android[/\\](?:data|obb)(?:[/\\]|$)/i.test(normalized)
}

async function listen(server: Server, host: string, requestedPort: number): Promise<number> {
  for (let port = requestedPort; port <= requestedPort + 20; port += 1) {
    try {
      await new Promise<void>((resolvePromise, reject) => {
        const onError = (error: NodeJS.ErrnoException): void => {
          server.removeListener('listening', onListening)
          reject(error)
        }
        const onListening = (): void => {
          server.removeListener('error', onError)
          resolvePromise()
        }
        server.once('error', onError)
        server.once('listening', onListening)
        server.listen(port, host)
      })
      return port
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
    }
  }
  throw new Error('No available local port was found')
}

export async function startLocalServer(options: LocalServerOptions): Promise<LocalServerHandle> {
  const host = options.host ?? '127.0.0.1'
  if (host !== '127.0.0.1' && host !== 'localhost') throw new Error('Network exposure is not supported; use 127.0.0.1')
  const token = randomBytes(32).toString('base64url')
  const webRoot = await realpath(options.webRoot)
  const workspace = new WorkspaceService()
  if (options.workspacePath) {
    if (isAndroidRestricted(options.report, options.workspacePath)) throw new Error('Android blocked this restricted directory')
    await workspace.setRoot(options.workspacePath)
  }
  let expectedHost = ''
  let expectedOrigin = ''
  let previewFile: string | null = null
  let previewDirectory: string | null = null
  const rate = new Map<string, { count: number; startedAt: number }>()
  const sockets = new Set<WebSocket>()

  const emitSocketEvent = (event: string, payload: unknown): void => {
    const data = JSON.stringify({ event, payload })
    for (const socket of sockets) if (socket.readyState === WebSocket.OPEN) socket.send(data)
  }
  const terminal = new LocalTerminalManager(
    workspace,
    (payload) => emitSocketEvent('terminal.data', payload),
    (payload) => emitSocketEvent('terminal.exit', payload)
  )
  const codex = new CodexService()
  const removeCodexAuthListener = codex.addAuthListener((payload) => emitSocketEvent('codex.auth', payload))
  const removeCodexRunListener = codex.addRunListener((payload) => emitSocketEvent('codex.run', payload))

  const validateRequest = (request: IncomingMessage, requireAuth = true): { ok: true; url: URL } | { ok: false; status: number; message: string } => {
    if (request.headers.host !== expectedHost) return { ok: false, status: 421, message: 'Invalid Host header' }
    const origin = request.headers.origin
    if (origin && origin !== expectedOrigin) return { ok: false, status: 403, message: 'Invalid Origin header' }
    const parsed = new URL(request.url ?? '/', expectedOrigin)
    const provided = bearerToken(request) ?? cookieToken(request) ?? parsed.searchParams.get('token')
    if (requireAuth && provided !== token) return { ok: false, status: 401, message: 'Invalid session token' }
    return { ok: true, url: parsed }
  }

  const handleApi = async (request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> => {
    const key = request.socket.remoteAddress ?? 'local'
    const now = Date.now()
    const current = rate.get(key)
    const bucket = !current || now - current.startedAt >= RATE_WINDOW_MS ? { count: 0, startedAt: now } : current
    bucket.count += 1
    rate.set(key, bucket)
    if (bucket.count > RATE_LIMIT) {
      writeJson(response, 429, { ok: false, error: { code: 'RATE_LIMITED', message: 'Request rate limit exceeded' } })
      return
    }

    try {
      if (request.method === 'GET' && url.pathname === '/api/app') {
        writeJson(response, 200, { ok: true, value: { name: 'Kadris', version: options.version ?? '0.1.0', platform: options.report.platform === 'unknown' ? 'web' : options.report.platform === 'windows' ? 'win32' : options.report.platform === 'macos' ? 'darwin' : options.report.platform } })
        return
      }
      if (request.method === 'GET' && url.pathname === '/api/environment') { writeJson(response, 200, { ok: true, value: options.report }); return }
      if (request.method === 'GET' && url.pathname === '/api/workspace') {
        const root = workspace.getRoot()
        writeJson(response, 200, { ok: true, value: root ? { name: root.split(/[\\/]/).pop() || root, path: root } : null })
        return
      }
      if (request.method === 'POST' && url.pathname === '/api/workspace/open') {
        const input = z.object({ path: z.string().min(1).max(4096) }).strict().parse(await readJson(request))
        if (isAndroidRestricted(options.report, input.path)) throw new Error('Android blocked this restricted directory')
        writeJson(response, 200, { ok: true, value: await workspace.setRoot(input.path) })
        return
      }
      if (request.method === 'GET' && url.pathname === '/api/workspace/list') {
        const input = listDirectoryInputSchema.parse({ relativePath: url.searchParams.get('path') ?? '' })
        writeJson(response, 200, { ok: true, value: await workspace.listDirectory(input.relativePath) })
        return
      }
      const body = request.method === 'POST' ? await readJson(request) : null
      if (request.method === 'POST' && url.pathname === '/api/files/read') { const input = readWorkspaceFileInputSchema.parse(body); writeJson(response, 200, { ok: true, value: await workspace.readFile(input.relativePath) }); return }
      if (request.method === 'POST' && url.pathname === '/api/files/read-binary') { const input = readBinaryFileInputSchema.parse(body); writeJson(response, 200, { ok: true, value: await workspace.readBinaryFile(input.relativePath) }); return }
      if (request.method === 'POST' && url.pathname === '/api/files/create') { const input = createFileInputSchema.parse(body); writeJson(response, 200, { ok: true, value: await workspace.createFile(input.relativePath, input.content) }); return }
      if (request.method === 'POST' && url.pathname === '/api/files/create-folder') { const input = createFolderInputSchema.parse(body); writeJson(response, 200, { ok: true, value: await workspace.createFolder(input.relativePath) }); return }
      if (request.method === 'POST' && url.pathname === '/api/files/save') { const input = saveFileInputSchema.parse(body); await workspace.saveFile(input.relativePath, input.content); writeJson(response, 200, { ok: true, value: null }); return }
      if (request.method === 'POST' && url.pathname === '/api/files/rename') { const input = renameInputSchema.parse(body); writeJson(response, 200, { ok: true, value: await workspace.renameEntry(input.oldPath, input.newPath) }); return }
      if (request.method === 'POST' && url.pathname === '/api/files/delete') { const input = deleteInputSchema.parse(body); await workspace.deleteEntry(input.relativePath); writeJson(response, 200, { ok: true, value: null }); return }
      if (request.method === 'POST' && url.pathname === '/api/live-server/start') {
        const input = z.object({ filePath: z.string().min(1).max(4096) }).strict().parse(body)
        const root = workspace.getRoot()
        if (!root) throw new Error('No workspace is open')
        const canonicalFile = await realpath(resolve(root, input.filePath))
        if (!isWithin(root, canonicalFile) || !(await lstat(canonicalFile)).isFile()) throw new Error('Path escapes workspace')
        previewFile = canonicalFile
        previewDirectory = resolve(canonicalFile, '..')
        writeJson(response, 200, { ok: true, value: { url: `${expectedOrigin}/preview/` } })
        return
      }
      if (request.method === 'POST' && url.pathname === '/api/live-server/stop') { previewFile = null; previewDirectory = null; writeJson(response, 200, { ok: true, value: null }); return }
      if (request.method === 'GET' && url.pathname === '/api/live-server/status') { writeJson(response, 200, { ok: true, value: { running: previewFile !== null, url: previewFile ? `${expectedOrigin}/preview/` : null, filePath: previewFile && workspace.getRoot() ? relative(workspace.getRoot()!, previewFile) : null } }); return }
      if (request.method === 'GET' && url.pathname === '/api/agent/status') {
        if (options.safeMode) throw new Error('Agent is disabled in safe mode')
        writeJson(response, 200, { ok: true, value: await codex.fetchStatus() })
        return
      }
      if (request.method === 'POST' && url.pathname === '/api/agent/login') {
        if (options.safeMode) throw new Error('Agent is disabled in safe mode')
        writeJson(response, 200, { ok: true, value: await codex.loginChatGPT() })
        return
      }
      if (request.method === 'POST' && url.pathname === '/api/agent/cancel-login') {
        if (options.safeMode) throw new Error('Agent is disabled in safe mode')
        const input = codexCancelLoginInputSchema.parse(body)
        await codex.cancelLogin(input.loginId)
        writeJson(response, 200, { ok: true, value: null })
        return
      }
      if (request.method === 'POST' && url.pathname === '/api/agent/logout') {
        if (options.safeMode) throw new Error('Agent is disabled in safe mode')
        await codex.logout()
        writeJson(response, 200, { ok: true, value: null })
        return
      }
      if (request.method === 'POST' && url.pathname === '/api/agent/run') {
        if (options.safeMode) throw new Error('Agent is disabled in safe mode')
        const input = codexRunInputSchema.parse(body)
        const root = workspace.getRoot()
        if (!root) throw new Error('No workspace is open')
        codex.run(input.runId, input.prompt, root)
        writeJson(response, 200, { ok: true, value: null })
        return
      }
      if (request.method === 'POST' && url.pathname === '/api/agent/cancel-run') {
        if (options.safeMode) throw new Error('Agent is disabled in safe mode')
        const input = codexCancelRunInputSchema.parse(body)
        codex.cancelRun(input.runId)
        writeJson(response, 200, { ok: true, value: null })
        return
      }
      writeJson(response, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Unknown API endpoint' } })
    } catch (error) {
      const payload = errorResult(error)
      const status = /Payload limit/i.test(payload.error.message) ? 413 : payload.error.code === 'NOT_FOUND' ? 404 : 400
      writeJson(response, status, payload)
    }
  }

  const serveFile = (response: ServerResponse, path: string): Promise<void> => {
    writeSecurityHeaders(response)
    response.writeHead(200, { 'Content-Type': MIME_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream' })
    return new Promise((resolvePromise, reject) => {
      createReadStream(path)
        .on('error', reject)
        .on('end', resolvePromise)
        .pipe(response)
    })
  }

  const handleRequest = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const healthValidation = validateRequest(request, false)
    if (!healthValidation.ok) { writeJson(response, healthValidation.status, { ok: false, error: { code: 'NOT_AUTHORIZED', message: healthValidation.message } }); return }
    if (request.method === 'GET' && healthValidation.url.pathname === '/api/health') { writeJson(response, 200, { name: 'Kadris', status: 'ok', version: options.version ?? '0.1.0' }); return }
    const validation = validateRequest(request)
    if (!validation.ok) { writeJson(response, validation.status, { ok: false, error: { code: 'NOT_AUTHORIZED', message: validation.message } }); return }
    if (validation.url.searchParams.get('token') === token) {
      response.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`)
    }
    if (validation.url.pathname.startsWith('/api/')) { await handleApi(request, response, validation.url); return }
    if (validation.url.pathname.startsWith('/preview/')) {
      if (!previewFile || !previewDirectory) { writeJson(response, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Preview is not running' } }); return }
      const suffix = decodeURIComponent(validation.url.pathname.slice('/preview/'.length))
      const requested = suffix ? resolve(previewDirectory, suffix) : previewFile
      try {
        const canonical = await realpath(requested)
        if (!isWithin(previewDirectory, canonical)) throw new Error('Path escapes preview')
        await serveFile(response, canonical)
      } catch { writeJson(response, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Preview file not found' } }) }
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') { writeJson(response, 405, { ok: false, error: { code: 'INVALID_INPUT', message: 'Method not allowed' } }); return }
    const relativeRequest = decodeURIComponent(validation.url.pathname).replace(/^\/+/, '')
    const requested = resolve(webRoot, relativeRequest || 'index.html')
    try {
      const canonical = await realpath(requested)
      if (!isWithin(webRoot, canonical)) throw new Error('Path escapes web root')
      if (!(await lstat(canonical)).isFile()) throw new Error('Not a file')
      await serveFile(response, canonical)
    } catch {
      const indexPath = await realpath(resolve(webRoot, 'index.html'))
      if (!isWithin(webRoot, indexPath)) { writeJson(response, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'File not found' } }); return }
      await serveFile(response, indexPath)
    }
  }

  const server = createServer((request, response) => { void handleRequest(request, response) })
  const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 })
  server.on('upgrade', (request, socket, head) => {
    const validation = validateRequest(request)
    if (!validation.ok || validation.url.pathname !== '/ws/platform') { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return }
    websocketServer.handleUpgrade(request, socket, head, (client) => websocketServer.emit('connection', client, request))
  })
  websocketServer.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('message', (raw) => {
      void (async () => {
        let id = 'unknown'
        try {
          const request = wsRequestSchema.parse(JSON.parse(websocketText(raw)) as unknown)
          id = request.id
          if (options.safeMode) throw new Error('Terminal is disabled in safe mode')
          if (request.action === 'terminal.create') socket.send(JSON.stringify({ id, result: { ok: true, value: await terminal.create(request.input) } }))
          else if (request.action === 'terminal.write') { terminal.write(request.input.terminalId, request.input.data); socket.send(JSON.stringify({ id, result: { ok: true, value: null } })) }
          else if (request.action === 'terminal.resize') { terminal.resize(request.input.terminalId, request.input.cols, request.input.rows); socket.send(JSON.stringify({ id, result: { ok: true, value: null } })) }
          else { terminal.close(request.input.terminalId); socket.send(JSON.stringify({ id, result: { ok: true, value: null } })) }
        } catch (error) {
          socket.send(JSON.stringify({ id, result: errorResult(error) }))
        }
      })()
    })
  })

  const port = await listen(server, host, options.port ?? 4173)
  expectedHost = `${host}:${port}`
  expectedOrigin = `http://${expectedHost}`

  return {
    url: `${expectedOrigin}/?token=${encodeURIComponent(token)}`,
    host,
    port,
    token,
    workspace,
    report: options.report,
    stop: async () => {
      terminal.closeAll()
      removeCodexAuthListener()
      removeCodexRunListener()
      codex.destroy()
      for (const socket of sockets) socket.close(1001, 'Server stopping')
      await new Promise<void>((resolvePromise) => websocketServer.close(() => resolvePromise()))
      await new Promise<void>((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()))
    }
  }
}
