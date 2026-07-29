import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { logoUrl } from './brand'
import { PlatformBridgeProvider } from './platform/PlatformBridgeContext'
import { createWebPlatformBridge } from './platform/WebPlatformBridge'
import './styles.css'

const favicon = document.createElement('link')
favicon.rel = 'icon'
favicon.type = 'image/png'
favicon.href = logoUrl
document.head.append(favicon)

const root = document.getElementById('root')
if (!root) throw new Error('Renderer root is missing')

try {
  const bridge = window.kadris ?? createWebPlatformBridge()
  createRoot(root).render(<StrictMode><PlatformBridgeProvider bridge={bridge}><App /></PlatformBridgeProvider></StrictMode>)
} catch (error) {
  const container = document.createElement('main')
  container.className = 'startup-error'
  container.setAttribute('role', 'alert')
  const title = document.createElement('strong')
  title.textContent = 'Kadris could not start'
  const message = document.createElement('span')
  message.textContent = error instanceof Error ? error.message : 'The platform bridge failed to load.'
  container.append(title, message)
  root.replaceChildren(container)
}
