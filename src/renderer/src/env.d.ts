import type { KadrisDesktopApi } from '../../shared/contracts'

declare global {
  interface Window { kadris?: KadrisDesktopApi }
}

export {}
