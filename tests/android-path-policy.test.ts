import { describe, expect, it } from 'vitest'
import { createAndroidPathPolicy } from '../src/local-server/android-path-policy'
import type { EnvironmentReport } from '../src/environment/types'

const TERMUX_HOME = '/data/data/com.termux/files/home'
const TERMUX_PREFIX = '/data/data/com.termux/files/usr'
const TERMUX_TEMP = '/data/data/com.termux/files/usr/tmp/kadris'

function report(runtime: EnvironmentReport['runtime'] = 'native-termux'): EnvironmentReport {
  return {
    platform: 'android', runtime, architecture: 'aarch64', hasGraphicalSession: false,
    isAndroidKernel: true, isTermux: runtime === 'native-termux', isProot: runtime === 'android-proot',
    isContainer: false, isWsl: false, isSsh: false, confidence: 'high', evidence: [],
    recommendedRuntime: runtime === 'android-proot' ? 'blocked' : 'web'
  }
}

async function policy(options: { shared?: string[]; runtime?: EnvironmentReport['runtime']; links?: Record<string, string> } = {}) {
  const links = options.links ?? {}
  return createAndroidPathPolicy({
    report: report(options.runtime),
    home: TERMUX_HOME,
    prefix: TERMUX_PREFIX,
    tempRoot: TERMUX_TEMP,
    authorizedSharedStorageRoots: options.shared ?? [],
    createDirectory: () => Promise.resolve(),
    resolveCanonical: (path) => Promise.resolve(links[path] ?? path)
  })
}

describe('Android Termux path policy', () => {
  it('allows the native Termux HOME', async () => {
    const decision = await (await policy()).authorize(TERMUX_HOME)
    expect(decision).toMatchObject({ allowed: true, authorizedRoot: TERMUX_HOME })
  })

  it('allows a subdirectory of the native Termux HOME', async () => {
    const decision = await (await policy()).authorize(`${TERMUX_HOME}/projeto/src`)
    expect(decision.allowed).toBe(true)
  })

  it('allows a project with spaces in the Termux HOME', async () => {
    const decision = await (await policy()).authorize(`${TERMUX_HOME}/meu projeto com espacos`)
    expect(decision.allowed).toBe(true)
  })

  it('allows the Kadris-controlled temporary root', async () => {
    const decision = await (await policy()).authorize(`${TERMUX_TEMP}/workspace`)
    expect(decision).toMatchObject({ allowed: true, authorizedRoot: TERMUX_TEMP })
  })

  it('treats the Termux PREFIX as explicitly unauthorized', async () => {
    const decision = await (await policy()).authorize(`${TERMUX_PREFIX}/bin`)
    expect(decision).toMatchObject({ allowed: false, code: 'TERMUX_PREFIX_NOT_AUTHORIZED' })
  })

  it('denies a path that escapes HOME through dot-dot segments', async () => {
    const decision = await (await policy()).authorize(`${TERMUX_HOME}/project/../../../com.outro.app`)
    expect(decision).toMatchObject({ allowed: false, code: 'ANDROID_PATH_NOT_AUTHORIZED' })
  })

  it('denies an external symlink target', async () => {
    const link = `${TERMUX_HOME}/outside-link`
    const decision = await (await policy({ links: { [link]: '/data/data/com.outro.app/files' } })).authorize(link)
    expect(decision).toMatchObject({ allowed: false, code: 'ANDROID_PATH_NOT_AUTHORIZED' })
  })

  it('allows explicitly authorized shared storage', async () => {
    const shared = '/storage/emulated/0/KadrisProjects'
    const decision = await (await policy({ shared: [shared] })).authorize(`${shared}/demo`)
    expect(decision).toMatchObject({ allowed: true, authorizedRoot: shared })
  })

  it('allows the Termux storage symlink only when its target is explicitly authorized', async () => {
    const link = `${TERMUX_HOME}/storage/shared`
    const shared = '/storage/emulated/0'
    const links = { [link]: shared, [shared]: shared }
    const denied = await (await policy({ links })).authorize(link)
    expect(denied).toMatchObject({ allowed: false, code: 'ANDROID_PATH_NOT_AUTHORIZED' })
    const allowed = await (await policy({ shared: [shared], links })).authorize(link)
    expect(allowed).toMatchObject({ allowed: true, authorizedRoot: shared })
  })

  it('blocks Android/data even when shared storage is authorized', async () => {
    const shared = '/storage/emulated/0'
    const decision = await (await policy({ shared: [shared] })).authorize(`${shared}/Android/data/com.outro.app`)
    expect(decision).toMatchObject({ allowed: false, code: 'ANDROID_SHARED_PRIVATE_DATA_BLOCKED' })
  })

  it('blocks Android/obb even when shared storage is authorized', async () => {
    const shared = '/storage/emulated/0'
    const decision = await (await policy({ shared: [shared] })).authorize(`${shared}/Android/obb/com.outro.app`)
    expect(decision).toMatchObject({ allowed: false, code: 'ANDROID_SHARED_PRIVATE_DATA_BLOCKED' })
  })

  it('blocks private data belonging to another application', async () => {
    const decision = await (await policy()).authorize('/data/user/0/com.outro.app/files')
    expect(decision).toMatchObject({ allowed: false, code: 'ANDROID_PATH_NOT_AUTHORIZED' })
  })

  it('does not classify PRoot as native Termux', async () => {
    const decision = await (await policy({ runtime: 'android-proot' })).authorize(TERMUX_HOME)
    expect(decision).toMatchObject({ allowed: false, code: 'ANDROID_RUNTIME_BLOCKED' })
  })

  it('does not change Linux desktop path authorization', async () => {
    const desktopReport: EnvironmentReport = {
      ...report('native-desktop'), platform: 'linux', isAndroidKernel: false, isTermux: false,
      isProot: false, recommendedRuntime: 'electron'
    }
    const desktopPolicy = await createAndroidPathPolicy({
      report: desktopReport,
      resolveCanonical: (path) => Promise.resolve(path)
    })
    const decision = await desktopPolicy.authorize('/home/developer/project')
    expect(decision.allowed).toBe(true)
  })
})
