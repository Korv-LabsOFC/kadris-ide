import { createContext, useContext, type ReactNode } from 'react'
import type { PlatformBridge } from '../../../shared/contracts'

const PlatformBridgeContext = createContext<PlatformBridge | null>(null)

export function PlatformBridgeProvider({ bridge, children }: { bridge: PlatformBridge; children: ReactNode }) {
  return <PlatformBridgeContext.Provider value={bridge}>{children}</PlatformBridgeContext.Provider>
}

export function usePlatformBridge(): PlatformBridge {
  const bridge = useContext(PlatformBridgeContext)
  if (!bridge) throw new Error('Platform bridge is not initialized')
  return bridge
}
