import { z } from 'zod'

export const windowStateSchema = z.object({
  width: z.number().int().min(800).max(10000),
  height: z.number().int().min(600).max(10000),
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  maximized: z.boolean()
}).strict()

export type WindowState = z.infer<typeof windowStateSchema>
