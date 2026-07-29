import { z } from 'zod'

export const LIVE_SERVER_CHANNELS = {
  start: 'live-server:start:v1',
  stop: 'live-server:stop:v1',
  getStatus: 'live-server:get-status:v1'
} as const

export const liveServerStartInputSchema = z.object({
  filePath: z.string().min(1).max(4096)
}).strict()

export const liveServerStatusSchema = z.object({
  running: z.boolean(),
  url: z.string().max(200).nullable(),
  filePath: z.string().max(4096).nullable()
}).strict()

export type LiveServerStartInput = z.infer<typeof liveServerStartInputSchema>
export type LiveServerStatus = z.infer<typeof liveServerStatusSchema>
