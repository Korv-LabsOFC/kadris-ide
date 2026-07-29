import { z } from 'zod'

export const sessionStateSchema = z.object({
  version: z.literal(1),
  workspace: z.string().max(4096).nullable(),
  openTabs: z.array(z.object({
    relativePath: z.string().max(4096),
    scrollPosition: z.number().int().nonnegative(),
    cursorLine: z.number().int().nonnegative(),
    cursorColumn: z.number().int().nonnegative()
  })).max(100),
  activeTab: z.string().max(4096).nullable(),
  sidebarWidth: z.number().int().nonnegative(),
  fontFamily: z.string().max(64),
  fontSize: z.number().int().min(8).max(48)
}).strict()

export interface SessionState {
  version: 1
  workspace: string | null
  openTabs: { relativePath: string; scrollPosition: number; cursorLine: number; cursorColumn: number }[]
  activeTab: string | null
  sidebarWidth: number
  fontFamily: string
  fontSize: number
}
