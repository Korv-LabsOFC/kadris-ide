import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { windowStateSchema, type WindowState } from '../shared/window-state'

const fallback: WindowState = { width: 1280, height: 800, maximized: false }

export async function loadWindowState(): Promise<WindowState> {
  try {
    return windowStateSchema.parse(JSON.parse(await readFile(join(app.getPath('userData'), 'window-state.json'), 'utf8')))
  } catch {
    return fallback
  }
}

export async function saveWindowState(window: BrowserWindow): Promise<void> {
  const bounds = window.getNormalBounds()
  const state = windowStateSchema.parse({ ...bounds, maximized: window.isMaximized() })
  const path = join(app.getPath('userData'), 'window-state.json')
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`
  try {
    await writeFile(temporaryPath, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 })
    await rename(temporaryPath, path)
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}
