import { randomUUID } from 'node:crypto'
import type { PermissionManager, PermissionRequest, PermissionDecision } from '../../shared/permission-contracts'

export class PermissionService implements PermissionManager {
  readonly #pending: Map<string, PermissionRequest> = new Map()
  readonly #history: { approved: string[]; denied: string[] } = { approved: [], denied: [] }
  #autoApproveActions: Set<string> = new Set()
  #resolvers: Map<string, (approved: boolean) => void> = new Map()

  setAutoApprove(action: string): void {
    this.#autoApproveActions.add(action)
  }

  removeAutoApprove(action: string): void {
    this.#autoApproveActions.delete(action)
  }

  getAutoApprovedActions(): string[] {
    return [...this.#autoApproveActions]
  }

  async requestPermission(request: Omit<PermissionRequest, 'id'>): Promise<boolean> {
    if (this.#autoApproveActions.has(request.action)) {
      this.#history.approved.push(request.action)
      return true
    }

    const id = randomUUID()
    const fullRequest: PermissionRequest = { id, ...request }
    this.#pending.set(id, fullRequest)

    return new Promise<boolean>((resolvePromise) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        this.#history.denied.push(request.action)
        resolvePromise(false)
      }, 120_000)
      this.#resolvers.set(id, (approved: boolean) => {
        clearTimeout(timer)
        this.#pending.delete(id)
        if (approved) this.#history.approved.push(request.action)
        else this.#history.denied.push(request.action)
        resolvePromise(approved)
      })
    })
  }

  getPendingRequests(): PermissionRequest[] {
    return [...this.#pending.values()]
  }

  resolvePermission(decision: PermissionDecision): void {
    const resolver = this.#resolvers.get(decision.id)
    if (resolver) {
      resolver(decision.approved)
      this.#resolvers.delete(decision.id)
    }
  }

  getHistory(): { approved: string[]; denied: string[] } {
    return { ...this.#history, approved: [...this.#history.approved], denied: [...this.#history.denied] }
  }

  reset(): void {
    for (const resolver of this.#resolvers.values()) resolver(false)
    this.#pending.clear()
    this.#resolvers.clear()
    this.#history.approved = []
    this.#history.denied = []
    this.#autoApproveActions.clear()
  }
}
