import { z } from 'zod'

export const searchInputSchema = z.object({
  query: z.string().min(1).max(500),
  path: z.string().max(4096).default(''),
  includePattern: z.string().max(256).default(''),
  excludePattern: z.string().max(256).default(''),
  maxResults: z.number().int().min(1).max(5000).default(200),
  caseSensitive: z.boolean().default(false),
  wholeWord: z.boolean().default(false),
  useRegex: z.boolean().default(false)
}).strict()

export const searchResultSchema = z.object({
  results: z.array(z.object({
    path: z.string(),
    line: z.number().int().positive(),
    column: z.number().int().nonnegative(),
    lineContent: z.string().max(4096),
    matchStart: z.number().int().nonnegative(),
    matchEnd: z.number().int().nonnegative()
  })).max(5000),
  totalMatches: z.number().int().nonnegative(),
  truncated: z.boolean()
})

export type SearchInput = z.infer<typeof searchInputSchema>
export type SearchResult = z.infer<typeof searchResultSchema>
