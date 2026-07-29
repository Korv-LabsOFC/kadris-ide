import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import type { PermissionRequest } from '../../../shared/permission-contracts'
import { usePlatformBridge } from '../platform/PlatformBridgeContext'

export function PermissionModal() {
  const bridge = usePlatformBridge()
  const [pending, setPending] = useState<PermissionRequest[]>([])

  useEffect(() => {
    const check = () => setPending(bridge.permissions.getPendingRequests())
    check()
    const interval = setInterval(check, 1000)
    return () => clearInterval(interval)
  }, [bridge])

  if (pending.length === 0) return null

  const request = pending[0]!

  return <div className="permission-overlay" style={{
    position: 'fixed', inset: 0, zIndex: 10000,
    display: 'grid', placeItems: 'center',
    background: 'rgba(0,0,0,0.6)',
  }}>
    <div className="permission-dialog" style={{
      background: '#1e2028', border: '1px solid #3b3f49', borderRadius: 8,
      padding: 24, maxWidth: 400, width: '90%',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <ShieldAlert size={20} style={{ color: '#d4aa84' }} />
        <strong style={{ color: '#d7dae0', fontSize: 14 }}>Permission Required</strong>
      </div>
      <p style={{ color: '#b9bec8', fontSize: 12, lineHeight: 1.5, marginBottom: 4 }}>{request.description}</p>
      <p style={{ color: '#8c929e', fontSize: 11, marginBottom: 16 }}>Action: <code style={{ color: '#d4aa84' }}>{request.action}</code></p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          type="button"
          className="secondary-button"
          onClick={() => { bridge.permissions.resolvePermission(request.id, false) }}
        >Deny</button>
        <button
          type="button"
          className="primary-button"
          onClick={() => { bridge.permissions.resolvePermission(request.id, true) }}
        >Allow</button>
      </div>
    </div>
  </div>
}
