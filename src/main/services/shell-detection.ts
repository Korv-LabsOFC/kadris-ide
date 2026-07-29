import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'

export interface ShellProfile {
  executable: string
  args: string[]
  name: string
}

async function executable(path: string | undefined): Promise<string | null> {
  if (!path || !isAbsolute(path)) return null
  try {
    await access(path, constants.X_OK)
    return path
  } catch {
    return null
  }
}

export async function detectShell(platform = process.platform, environment = process.env): Promise<ShellProfile> {
  if (platform === 'win32') {
    const systemRoot = environment.SystemRoot ?? environment.SYSTEMROOT ?? 'C:\\Windows'
    const candidates = [environment.ComSpec, environment.COMSPEC, join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), join(systemRoot, 'System32', 'cmd.exe')]
    for (const candidate of candidates) {
      const found = await executable(candidate)
      if (found) return { executable: found, args: basename(found).toLocaleLowerCase().startsWith('powershell') ? ['-NoLogo'] : ['/d'], name: basename(found) }
    }
  } else {
    const candidates = [environment.SHELL, ...(platform === 'darwin' ? ['/bin/zsh', '/bin/bash', '/bin/sh'] : ['/bin/bash', '/usr/bin/bash', '/bin/zsh', '/usr/bin/zsh', '/bin/sh'])]
    for (const candidate of candidates) {
      const found = await executable(candidate)
      if (found) return { executable: found, args: [], name: basename(found) }
    }
  }
  throw new Error('No supported shell was found')
}
