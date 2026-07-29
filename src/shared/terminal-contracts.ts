import { z } from 'zod'

export const TERMINAL_CHANNELS = {
  create: 'terminal:create:v1',
  write: 'terminal:write:v1',
  resize: 'terminal:resize:v1',
  close: 'terminal:close:v1',
  data: 'terminal:data:v1',
  exit: 'terminal:exit:v1'
} as const

const terminalIdSchema = z.string().uuid()

export const terminalCreateInputSchema = z.object({
  terminalId: terminalIdSchema,
  cols: z.number().int().min(2).max(500),
  rows: z.number().int().min(1).max(200)
}).strict()

export const terminalInfoSchema = z.object({
  terminalId: terminalIdSchema,
  shellName: z.string().min(1).max(120)
}).strict()

export const terminalWriteInputSchema = z.object({
  terminalId: terminalIdSchema,
  data: z.string().min(1).max(8192).refine((value) => new TextEncoder().encode(value).byteLength <= 8192, 'Terminal input exceeds 8 KiB')
}).strict()

export const terminalResizeInputSchema = z.object({
  terminalId: terminalIdSchema,
  cols: z.number().int().min(2).max(500),
  rows: z.number().int().min(1).max(200)
}).strict()

export const terminalCloseInputSchema = z.object({ terminalId: terminalIdSchema }).strict()

export const terminalDataEventSchema = z.object({
  terminalId: terminalIdSchema,
  data: z.string().max(65536)
}).strict()

export const terminalExitEventSchema = z.object({
  terminalId: terminalIdSchema,
  exitCode: z.number().int().nullable(),
  signal: z.number().int().nullable()
}).strict()

export type TerminalCreateInput = z.infer<typeof terminalCreateInputSchema>
export type TerminalInfo = z.infer<typeof terminalInfoSchema>
export type TerminalWriteInput = z.infer<typeof terminalWriteInputSchema>
export type TerminalResizeInput = z.infer<typeof terminalResizeInputSchema>
export type TerminalCloseInput = z.infer<typeof terminalCloseInputSchema>
export type TerminalDataEvent = z.infer<typeof terminalDataEventSchema>
export type TerminalExitEvent = z.infer<typeof terminalExitEventSchema>
