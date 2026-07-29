#!/usr/bin/env node
import { createRequire } from 'node:module'
import { rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectEnvironmentReport } from '../environment/detector'
import { selectKadrisRuntime } from '../environment/runtime'
import { startLocalServer } from '../local-server/index'
import { CLI_HELP, parseCliArguments } from './arguments'
import { openBrowser } from './browser'
import { findDesktopLaunch, launchDesktop } from './desktop'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..', '..')
const require = createRequire(import.meta.url)
const { version: VERSION }: { version: string } = require(resolve(ROOT, 'package.json')) as { version: string }

function validateNodeVersion(): void {
  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number)
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('Kadris requires Node.js 22.12.0 or newer')
}

async function resolveWorkspace(path: string): Promise<string> {
  const absolute = resolve(path)
  if (!(await stat(absolute)).isDirectory()) throw new Error(`Workspace is not a directory: ${absolute}`)
  return absolute
}

function printProotGuidance(): void {
  console.error('Kadris detected a PRoot distribution over Android.')
  console.error('Kadris Desktop is not compatible with this environment.')
  console.error('Run the official runtime directly in native Termux:')
  console.error('exit')
  console.error('kadris')
}

export async function runCli(args = process.argv.slice(2)): Promise<number> {
  validateNodeVersion()
  const options = parseCliArguments(args)
  if (options.help) { console.log(CLI_HELP); return 0 }
  if (options.version) { console.log(`Kadris ${VERSION}`); return 0 }
  if (options.resetSession) await rm(resolve(homedir(), '.kadris/session.json'), { force: true })

  const desktopLaunch = findDesktopLaunch()
  const report = collectEnvironmentReport({ electronAvailable: desktopLaunch !== null })
  if (options.diagnoseEnvironment) {
    if (options.json) console.log(JSON.stringify(report, null, 2))
    else {
      console.log(`Platform: ${report.platform}`)
      console.log(`Environment: ${report.runtime}`)
      console.log(`Architecture: ${report.architecture}`)
      console.log(`Graphical session: ${report.hasGraphicalSession ? 'yes' : 'no'}`)
      console.log(`Recommended runtime: ${report.recommendedRuntime}`)
      console.log(`Confidence: ${report.confidence}`)
      if (options.verbose) for (const item of report.evidence) console.log(`Evidence: ${item.source}=${item.result} (${item.weight})`)
    }
    return 0
  }
  if (report.runtime === 'android-proot') { printProotGuidance(); return 2 }

  let decision = selectKadrisRuntime(report)
  if (options.forceWeb) decision = { runtime: 'web', openBrowser: report.runtime !== 'ssh' && report.runtime !== 'headless', reason: 'Web runtime explicitly requested.' }
  if (options.forceDesktop) {
    if (report.runtime !== 'native-desktop' || !desktopLaunch) throw new Error(`Kadris Desktop is unavailable in ${report.runtime}`)
    decision = { runtime: 'electron', openBrowser: false, reason: 'Desktop runtime explicitly requested.' }
  }
  if (decision.runtime === 'blocked') {
    console.error(decision.reason)
    return report.runtime === 'ci' ? 0 : 2
  }

  const workspace = await resolveWorkspace(options.workspace)
  if (decision.runtime === 'electron') {
    if (!desktopLaunch) throw new Error('Electron desktop package is unavailable')
    return launchDesktop(desktopLaunch, workspace)
  }

  const currentDirectory = dirname(fileURLToPath(import.meta.url))
  const webRoot = resolve(currentDirectory, '../web')
  const server = await startLocalServer({
    webRoot,
    workspacePath: workspace,
    report,
    host: options.host,
    port: options.port,
    safeMode: options.safeMode,
    version: VERSION
  })
  console.log(`Kadris ${VERSION}`)
  console.log(`Runtime: ${report.isTermux ? 'Termux Web' : 'Local Web'}`)
  console.log(`Workspace: ${workspace}`)
  console.log(`Server: http://${server.host}:${server.port}`)
  console.log('Press Ctrl+C to stop.')
  if (options.openBrowser && decision.openBrowser) {
    const opened = await openBrowser(server.url, report)
    if (!opened) console.log(`Open this URL: ${server.url}`)
  } else console.log(`Open this URL: ${server.url}`)

  await new Promise<void>((resolvePromise) => {
    let stopping = false
    const stop = (): void => {
      if (stopping) return
      stopping = true
      void server.stop().finally(resolvePromise)
    }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  })
  return 0
}

void runCli().then((code) => { process.exitCode = code }).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Kadris failed to start')
  process.exitCode = 1
})
