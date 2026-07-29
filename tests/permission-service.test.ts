import { describe, expect, it, vi } from 'vitest'
import { PermissionService } from '../src/main/services/permission-service'
import type { PermissionRequest } from '../src/shared/permission-contracts'

function request(overrides: Pick<PermissionRequest, 'action' | 'description'>): Omit<PermissionRequest, 'id'> {
  return { ...overrides, details: {} }
}

describe('PermissionService', () => {
  it('returns empty pending list initially', () => {
    const svc = new PermissionService()
    expect(svc.getPendingRequests()).toHaveLength(0)
  })

  it('returns empty history initially', () => {
    const svc = new PermissionService()
    const history = svc.getHistory()
    expect(history.approved).toHaveLength(0)
    expect(history.denied).toHaveLength(0)
  })

  it('approves actions that are in auto-approve list', async () => {
    const svc = new PermissionService()
    svc.setAutoApprove('file.delete')
    const result = await svc.requestPermission(request({
      action: 'file.delete',
      description: 'Delete file'
    }))
    expect(result).toBe(true)
    expect(svc.getPendingRequests()).toHaveLength(0)
  })

  it('queues non-auto-approved actions and resolves them', async () => {
    const svc = new PermissionService()
    const promise = svc.requestPermission(request({
      action: 'git.push',
      description: 'Push to remote'
    }))
    expect(svc.getPendingRequests()).toHaveLength(1)
    expect(svc.getPendingRequests()[0]!.action).toBe('git.push')
    svc.resolvePermission({ id: svc.getPendingRequests()[0]!.id, approved: true, remember: false })
    const result = await promise
    expect(result).toBe(true)
  })

  it('denies non-auto-approved actions', async () => {
    const svc = new PermissionService()
    const promise = svc.requestPermission(request({
      action: 'git.push',
      description: 'Push to remote'
    }))
    svc.resolvePermission({ id: svc.getPendingRequests()[0]!.id, approved: false, remember: false })
    const result = await promise
    expect(result).toBe(false)
  })

  it('rejects request with timeout after 120 seconds', async () => {
    vi.useFakeTimers()
    const svc = new PermissionService()
    const promise = svc.requestPermission(request({
      action: 'git.push',
      description: 'Push to remote'
    }))
    vi.advanceTimersByTime(121_000)
    const result = await promise
    expect(result).toBe(false)
    vi.useRealTimers()
  })

  it('tracks history of approved and denied actions', async () => {
    const svc = new PermissionService()
    const p1 = svc.requestPermission(request({ action: 'git.push', description: 'Push' }))
    const p2 = svc.requestPermission(request({ action: 'file.delete', description: 'Delete' }))
    const [first, second] = svc.getPendingRequests()
    svc.resolvePermission({ id: first!.id, approved: true, remember: false })
    svc.resolvePermission({ id: second!.id, approved: false, remember: true })
    await Promise.all([p1, p2])
    const history = svc.getHistory()
    expect(history.approved.length + history.denied.length).toBeGreaterThan(0)
  })

  it('resets pending requests and history', () => {
    const svc = new PermissionService()
    void svc.requestPermission(request({ action: 'git.push', description: 'Push' }))
    expect(svc.getPendingRequests()).toHaveLength(1)
    svc.reset()
    expect(svc.getPendingRequests()).toHaveLength(0)
    const history = svc.getHistory()
    expect(history.approved).toHaveLength(0)
    expect(history.denied).toHaveLength(0)
  })
})
