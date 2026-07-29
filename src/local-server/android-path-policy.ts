import { mkdir, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import type { EnvironmentReport } from '../environment/types'

export type AndroidPathDenialCode =
  | 'ANDROID_RUNTIME_BLOCKED'
  | 'ANDROID_PATH_NOT_AUTHORIZED'
  | 'TERMUX_PREFIX_NOT_AUTHORIZED'
  | 'ANDROID_SHARED_PRIVATE_DATA_BLOCKED'

export interface AndroidPathDecision {
  allowed: boolean
  code?: AndroidPathDenialCode
  requestedPath: string
  canonicalPath: string
  authorizedRoot?: string
  authorizedRoots: string[]
}

export class AndroidPathAuthorizationError extends Error {
  readonly decision: AndroidPathDecision

  constructor(decision: AndroidPathDecision) {
    const root = decision.authorizedRoot ?? (decision.authorizedRoots.join(', ') || '(none)')
    super(`${decision.code}: requested path ${decision.requestedPath}; resolved path ${decision.canonicalPath}; authorized root ${root}`)
    this.name = 'AndroidPathAuthorizationError'
    this.decision = decision
  }
}

interface PathRoot {
  path: string
  kind: 'home' | 'temp' | 'shared'
}

export interface AndroidPathPolicyOptions {
  report: EnvironmentReport
  home?: string
  prefix?: string
  tempRoot?: string
  authorizedSharedStorageRoots?: readonly string[]
  resolveCanonical?: (path: string) => Promise<string>
  createDirectory?: (path: string) => Promise<void>
}

function isWithin(root: string, candidate: string): boolean {
  const relation = relative(root, candidate)
  return relation === '' || (relation !== '..' && !relation.startsWith(`..${sep}`) && !relation.startsWith(`..${'/'.charAt(0)}`))
}

function isAndroidPrivateStorage(candidate: string): boolean {
  return /(?:^|[/\\])Android[/\\](?:data|obb)(?:[/\\]|$)/i.test(candidate)
}

export class AndroidPathPolicy {
  readonly #report: EnvironmentReport
  readonly #roots: PathRoot[]
  readonly #prefix: string | null
  readonly #resolveCanonical: (path: string) => Promise<string>

  constructor(report: EnvironmentReport, roots: PathRoot[], prefix: string | null, resolveCanonical: (path: string) => Promise<string>) {
    this.#report = report
    this.#roots = roots
    this.#prefix = prefix
    this.#resolveCanonical = resolveCanonical
  }

  async authorize(requestedPath: string): Promise<AndroidPathDecision> {
    const normalized = resolve(requestedPath)
    const canonicalPath = await this.#resolveCanonical(normalized)
    const authorizedRoots = this.#roots.map((root) => root.path)

    if (this.#report.runtime === 'android-proot') {
      return { allowed: false, code: 'ANDROID_RUNTIME_BLOCKED', requestedPath, canonicalPath, authorizedRoots }
    }
    if (this.#report.runtime !== 'native-termux') {
      return { allowed: true, requestedPath, canonicalPath, authorizedRoots }
    }

    const matchingRoot = this.#roots.find((root) => isWithin(root.path, canonicalPath))
    if (!matchingRoot) {
      const code = this.#prefix && isWithin(this.#prefix, canonicalPath)
        ? 'TERMUX_PREFIX_NOT_AUTHORIZED'
        : 'ANDROID_PATH_NOT_AUTHORIZED'
      return { allowed: false, code, requestedPath, canonicalPath, authorizedRoots }
    }
    if (isAndroidPrivateStorage(canonicalPath)) {
      return {
        allowed: false,
        code: 'ANDROID_SHARED_PRIVATE_DATA_BLOCKED',
        requestedPath,
        canonicalPath,
        authorizedRoot: matchingRoot.path,
        authorizedRoots
      }
    }
    return { allowed: true, requestedPath, canonicalPath, authorizedRoot: matchingRoot.path, authorizedRoots }
  }

  async assertAuthorized(requestedPath: string): Promise<string> {
    const decision = await this.authorize(requestedPath)
    if (!decision.allowed) throw new AndroidPathAuthorizationError(decision)
    return decision.canonicalPath
  }
}

export async function createAndroidPathPolicy(options: AndroidPathPolicyOptions): Promise<AndroidPathPolicy> {
  const resolveCanonical = options.resolveCanonical ?? realpath
  const createDirectory = options.createDirectory ?? (async (path: string) => { await mkdir(path, { recursive: true }) })
  const roots: PathRoot[] = []
  let prefix: string | null = null

  if (options.report.runtime === 'native-termux') {
    if (options.home) roots.push({ path: await resolveCanonical(options.home), kind: 'home' })
    const tempRoot = options.tempRoot ?? join(tmpdir(), 'kadris')
    await createDirectory(tempRoot)
    roots.push({ path: await resolveCanonical(tempRoot), kind: 'temp' })
    if (options.prefix) prefix = await resolveCanonical(options.prefix)
    for (const sharedRoot of options.authorizedSharedStorageRoots ?? []) {
      roots.push({ path: await resolveCanonical(sharedRoot), kind: 'shared' })
    }
  }

  return new AndroidPathPolicy(options.report, roots, prefix, resolveCanonical)
}
