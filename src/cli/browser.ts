import { spawn } from 'node:child_process'
import type { EnvironmentReport } from '../environment/types'

export async function openBrowser(url: string, report: EnvironmentReport): Promise<boolean> {
  if (report.runtime === 'ssh' || report.runtime === 'headless' || report.runtime === 'container' || report.runtime === 'wsl' || report.runtime === 'ci') return false
  const command = report.isTermux
    ? { executable: 'termux-open-url', args: [url] }
    : report.platform === 'windows'
      ? { executable: 'cmd.exe', args: ['/d', '/s', '/c', 'start', '', url] }
      : report.platform === 'macos'
        ? { executable: 'open', args: [url] }
        : { executable: 'xdg-open', args: [url] }
  return new Promise((resolve) => {
    const child = spawn(command.executable, command.args, { detached: true, stdio: 'ignore', windowsHide: true })
    child.once('error', () => resolve(false))
    child.once('spawn', () => { child.unref(); resolve(true) })
  })
}
