import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { extname, relative, resolve, sep } from 'node:path'
import { shell } from 'electron'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

export class LiveServerService {
  #server: Server | null = null
  #port: number = 0
  #filePath: string | null = null

  getStatus(): { running: boolean; url: string | null; filePath: string | null } {
    return {
      running: this.#server !== null,
      url: this.#server ? `http://127.0.0.1:${this.#port}` : null,
      filePath: this.#filePath
    }
  }

  async start(filePath: string, directory: string): Promise<void> {
    this.stop()
    const canonicalDirectory = await realpath(directory)
    const canonicalFile = await realpath(resolve(canonicalDirectory, filePath))
    const initialRelation = relative(canonicalDirectory, canonicalFile)
    if (initialRelation === '..' || initialRelation.startsWith(`..${sep}`)) throw new Error('Path escapes workspace')
    if (!(await lstat(canonicalFile)).isFile()) throw new Error('The selected path is not a regular file')
    this.#filePath = relative(canonicalDirectory, canonicalFile)

    return new Promise((resolvePromise, reject) => {
      const handleRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        let url: string
        try {
          url = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname)
        } catch {
          res.writeHead(400)
          res.end('Bad request')
          return
        }
        let servePath: string
        if (url === '/') {
          servePath = canonicalFile
        } else {
          servePath = resolve(canonicalDirectory, '.' + url)
        }

        const pathRelation = relative(canonicalDirectory, servePath)
        if (pathRelation === '..' || pathRelation.startsWith(`..${sep}`)) {
          res.writeHead(403)
          res.end('Forbidden')
          return
        }

        try {
          servePath = await realpath(servePath)
        } catch {
          res.writeHead(404)
          res.end('Not found')
          return
        }
        const canonicalRelation = relative(canonicalDirectory, servePath)
        if (canonicalRelation === '..' || canonicalRelation.startsWith(`..${sep}`)) {
          res.writeHead(403)
          res.end('Forbidden')
          return
        }

        try {
          const data = await readFile(servePath)
          const ext = extname(servePath).toLowerCase()
          const mime = MIME_TYPES[ext] ?? 'application/octet-stream'
          res.writeHead(200, { 'Content-Type': mime })
          res.end(data)
        } catch {
          res.writeHead(404)
          res.end('Not found')
        }
      }
      const server = createServer((req, res) => {
        void handleRequest(req, res)
      })

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        if (typeof addr === 'object' && addr) {
          this.#port = addr.port
          this.#server = server
          resolvePromise()
        } else {
          reject(new Error('Failed to start server'))
        }
      })

      server.on('error', reject)
    })
  }

  async openInBrowser(): Promise<void> {
    if (!this.#server) throw new Error('Server is not running')
    await shell.openExternal(`http://127.0.0.1:${this.#port}`)
  }

  stop(): void {
    if (this.#server) {
      this.#server.close()
      this.#server = null
      this.#port = 0
      this.#filePath = null
    }
  }

  destroy(): void {
    this.stop()
  }
}
