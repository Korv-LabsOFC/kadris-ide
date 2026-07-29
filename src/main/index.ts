import { writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { app, BrowserWindow, Menu, safeStorage, screen, session, shell, type IpcMainInvokeEvent } from 'electron'
import { registerIpc } from './ipc/register-ipc'
import { registerTerminalIpc } from './ipc/register-terminal-ipc'
import { registerAiProviderIpc } from './ipc/register-ai-provider-ipc'
import { registerCodexIpc } from './ipc/register-codex-ipc'
import { registerLiveServerIpc } from './ipc/register-live-server-ipc'
import { createRendererTarget, isAllowedRendererUrl } from './security/renderer-policy'
import { WorkspaceService } from './services/workspace-service'
import { TerminalService } from './services/terminal-service'
import { AiProviderConfigService } from './services/ai-provider-config-service'
import { CodexService } from './services/codex-service'
import { LiveServerService } from './services/live-server-service'
import { TERMINAL_CHANNELS } from '../shared/terminal-contracts'
import { loadWindowState, saveWindowState } from './window-state'

const workspaceService = new WorkspaceService()
let removeIpcHandlers: (() => void) | undefined
let removeTerminalIpcHandlers: (() => void) | undefined
let removeAiProviderIpcHandlers: (() => void) | undefined
let mainWindow: BrowserWindow | null = null
let creatingWindow: Promise<BrowserWindow> | null = null
const terminalService = new TerminalService(
  workspaceService,
  (event) => mainWindow?.webContents.send(TERMINAL_CHANNELS.data, event),
  (event) => mainWindow?.webContents.send(TERMINAL_CHANNELS.exit, event)
)
const codexService = new CodexService((url) => shell.openExternal(url))
let removeCodexIpcHandlers: (() => void) | undefined
const liveServerService = new LiveServerService()
let removeLiveServerIpcHandlers: (() => void) | undefined

// Chromium GPU processes are unreliable on some Linux/Wayland drivers. Software
// rendering is preferable to an unusable black window and can be opted out.
app.setName('Kadris')

if (process.platform === 'linux' && process.env.KADRIS_ENABLE_HARDWARE_ACCELERATION !== '1') {
  app.disableHardwareAcceleration()
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()

function installApplicationMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] }
  ]))
}

async function createWindow(): Promise<BrowserWindow> {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow
  const state = await loadWindowState()
  const savedX = state.x
  const savedY = state.y
  const savedPositionIsVisible = savedX !== undefined && savedY !== undefined && screen.getAllDisplays().some(({ workArea }) => {
    const visibleWidth = Math.max(0, Math.min(savedX + state.width, workArea.x + workArea.width) - Math.max(savedX, workArea.x))
    const visibleHeight = Math.max(0, Math.min(savedY + state.height, workArea.y + workArea.height) - Math.max(savedY, workArea.y))
    return visibleWidth >= 80 && visibleHeight >= 40
  })
  const rendererPath = join(__dirname, '../renderer/index.html')
  const rendererTarget = createRendererTarget(app.isPackaged, process.env.ELECTRON_RENDERER_URL, rendererPath)
  const window = new BrowserWindow({
    width: state.width,
    height: state.height,
    ...(savedPositionIsVisible ? { x: savedX, y: savedY } : {}),
    show: false,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#111318',
    title: 'Kadris',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })
  mainWindow = window

  if (state.maximized) window.maximize()
  window.once('ready-to-show', () => window.show())
  window.webContents.on('preload-error', (_event, path, error) => {
    console.error(`Preload failed at ${path}`, error)
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    terminalService.closeAll()
    codexService.destroy()
    liveServerService.destroy()
    console.error('Renderer process terminated', details.reason)
  })
  window.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) { workspaceService.clearRoot(); terminalService.closeAll() }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedRendererUrl(url, rendererTarget)) event.preventDefault()
  })
  let closeAfterSave = false
  let savingState = false
  window.on('close', (event) => {
    if (closeAfterSave) return
    event.preventDefault()
    if (savingState) return
    savingState = true
    void saveWindowState(window)
      .catch((error: unknown) => console.error('Unable to persist window state', error))
      .finally(() => {
        closeAfterSave = true
        if (!window.isDestroyed()) window.close()
      })
  })
  window.on('closed', () => {
    terminalService.closeAll()
    workspaceService.clearRoot()
    if (mainWindow === window) mainWindow = null
  })

  const testWorkspace = process.env.KADRIS_TEST_WORKSPACE
  const initialWorkspace = testWorkspace ?? process.env.KADRIS_OPEN_WORKSPACE
  let autoOpenData: string | undefined
  if (testWorkspace && !app.isPackaged && process.env.KADRIS_SMOKE_CAPTURE === '1') {
    try {
      await workspaceService.setRoot(testWorkspace)
      const entries = await workspaceService.listDirectory('')
      const workspace = { name: basename(testWorkspace), path: testWorkspace }
      const openFile = process.env.KADRIS_SMOKE_FILE
      autoOpenData = JSON.stringify({ workspace, entries, openFile })
    } catch (error) {
      console.error('Failed to open test workspace:', error)
    }
  }

  const loadUrl = autoOpenData
    ? `${rendererTarget.url}?autoOpen=${encodeURIComponent(autoOpenData)}`
    : rendererTarget.url
  await window.loadURL(loadUrl)

  // Navigation revokes the prior capability; an explicit CLI workspace is granted after load.
  if (initialWorkspace) await workspaceService.setRoot(initialWorkspace)

  if (!app.isPackaged && process.env.KADRIS_SMOKE_CAPTURE === '1') {
    await new Promise((resolve) => setTimeout(resolve, 6000))
    const image = await window.webContents.capturePage()
    await writeFile('/tmp/kadris-smoke.png', image.toPNG())
    app.quit()
  }
  return window
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return
  const rendererPath = join(__dirname, '../renderer/index.html')
  const rendererTarget = createRendererTarget(app.isPackaged, process.env.ELECTRON_RENDERER_URL, rendererPath)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [rendererTarget.csp]
      }
    })
  })
  installApplicationMenu()
  const isTrustedSender = (event: IpcMainInvokeEvent): boolean => {
    const window = mainWindow
    return window !== null && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === event.sender.mainFrame && isAllowedRendererUrl(event.senderFrame.url, rendererTarget)
  }
  removeIpcHandlers = registerIpc(workspaceService, isTrustedSender)
  removeTerminalIpcHandlers = registerTerminalIpc(terminalService, isTrustedSender)
  removeAiProviderIpcHandlers = registerAiProviderIpc(new AiProviderConfigService(app.getPath('userData'), safeStorage), isTrustedSender)
  removeCodexIpcHandlers = registerCodexIpc(codexService, isTrustedSender, () => mainWindow?.webContents ?? null, () => workspaceService.getRoot())
  removeLiveServerIpcHandlers = registerLiveServerIpc(liveServerService, workspaceService, isTrustedSender)
  creatingWindow = createWindow()
  await creatingWindow
  creatingWindow = null
  app.on('activate', () => {
    if (!mainWindow && !creatingWindow) {
      creatingWindow = createWindow().finally(() => { creatingWindow = null })
    }
  })
}).catch((error: unknown) => {
  console.error('Application startup failed', error)
  app.quit()
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => {
  terminalService.closeAll()
  codexService.destroy()
  removeIpcHandlers?.()
  removeTerminalIpcHandlers?.()
  removeAiProviderIpcHandlers?.()
  removeCodexIpcHandlers?.()
  removeLiveServerIpcHandlers?.()
  liveServerService.destroy()
})
app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})
