import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface DesktopLaunch {
  executable: string
  args: string[]
}

export function findDesktopLaunch(env: NodeJS.ProcessEnv = process.env): DesktopLaunch | null {
  const explicit = env.KADRIS_DESKTOP_EXECUTABLE
  if (explicit && existsSync(explicit)) return { executable: explicit, args: [] }
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const executable = process.platform === 'win32'
    ? resolve(repositoryRoot, 'node_modules/electron/dist/electron.exe')
    : process.platform === 'darwin'
      ? resolve(repositoryRoot, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
      : resolve(repositoryRoot, 'node_modules/electron/dist/electron')
  if (existsSync(executable) && existsSync(resolve(repositoryRoot, 'out/main/index.js'))) {
    return { executable, args: [repositoryRoot] }
  }
  return null
}

export function launchDesktop(launch: DesktopLaunch, workspace: string): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(launch.executable, launch.args, {
      stdio: 'inherit',
      windowsHide: false,
      env: { ...process.env, KADRIS_OPEN_WORKSPACE: workspace }
    })
    child.once('error', reject)
    child.once('exit', (code) => resolvePromise(code ?? 1))
  })
}
