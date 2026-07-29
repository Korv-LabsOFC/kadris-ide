import { z } from 'zod'

export const permissionRequestSchema = z.object({
  id: z.string().uuid(),
  action: z.enum([
    'git.push',
    'git.deleteBranch',
    'git.forcePush',
    'git.reset',
    'file.delete',
    'file.batchDelete',
    'workspace.format',
    'agent.writeFile',
    'agent.deleteFile',
    'agent.executeCommand',
    'network.expose'
  ]),
  description: z.string().max(500),
  details: z.record(z.string(), z.string()).default({})
}).strict()

export const permissionDecisionSchema = z.object({
  id: z.string().uuid(),
  approved: z.boolean(),
  remember: z.boolean().default(false)
}).strict()

export type PermissionRequest = z.infer<typeof permissionRequestSchema>
export type PermissionDecision = z.infer<typeof permissionDecisionSchema>

export interface PermissionManager {
  requestPermission: (request: Omit<PermissionRequest, 'id'>) => Promise<boolean>
  getPendingRequests: () => PermissionRequest[]
  resolvePermission: (decision: PermissionDecision) => void
  getHistory: () => { approved: string[]; denied: string[] }
  reset: () => void
}
