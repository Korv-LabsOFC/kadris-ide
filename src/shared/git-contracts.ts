import { z } from 'zod'

export const gitStatusSchema = z.object({
  currentBranch: z.string(),
  behind: z.number().int().nonnegative(),
  ahead: z.number().int().nonnegative(),
  files: z.array(z.object({
    path: z.string(),
    staged: z.boolean(),
    kind: z.enum(['modified', 'added', 'deleted', 'renamed', 'copied', 'untracked', 'unmerged', 'ignored'])
  })).max(5000),
  hasUnstaged: z.boolean()
})

export const gitDiffSchema = z.object({
  path: z.string(),
  staged: z.boolean(),
  content: z.string().max(524288)
})

export const gitCommitLogSchema = z.object({
  commits: z.array(z.object({
    hash: z.string().length(40),
    abbreviatedHash: z.string().min(7).max(10),
    message: z.string().max(65536),
    author: z.string().max(256),
    authorEmail: z.string().max(256).optional(),
    timestamp: z.number().int().positive(),
    refs: z.string().max(512).optional()
  })).max(200)
})

export const gitBranchSchema = z.object({
  branches: z.array(z.object({
    name: z.string().max(1024),
    current: z.boolean(),
    tracking: z.string().max(1024).optional(),
    ahead: z.number().int().nonnegative().optional(),
    behind: z.number().int().nonnegative().optional()
  })).max(200)
})

export const gitStashSchema = z.object({
  entries: z.array(z.object({
    index: z.number().int().nonnegative(),
    message: z.string().max(65536)
  })).max(200)
})

export const gitCloneInputSchema = z.object({
  url: z.string().url().max(4096),
  directory: z.string().min(1).max(4096),
  branch: z.string().max(256).optional()
}).strict()

export const gitCommitInputSchema = z.object({
  message: z.string().min(1).max(65536),
  author: z.string().max(256).optional(),
  all: z.boolean().default(false)
}).strict()

export const gitBranchInputSchema = z.object({
  name: z.string().min(1).max(256)
}).strict()

export const gitCheckoutInputSchema = z.object({
  branch: z.string().min(1).max(256),
  create: z.boolean().default(false)
}).strict()

export const gitStashInputSchema = z.object({
  message: z.string().max(65536).optional()
}).strict()

export const gitAddInputSchema = z.object({
  files: z.array(z.string().min(1).max(4096)).min(1).max(1000)
}).strict()

export const gitRemoteInputSchema = z.object({
  name: z.string().max(256).default('origin'),
  url: z.string().url().max(4096)
}).strict()

export type GitStatus = z.infer<typeof gitStatusSchema>
export type GitDiff = z.infer<typeof gitDiffSchema>
export type GitCommitLog = z.infer<typeof gitCommitLogSchema>
export type GitBranchInfo = z.infer<typeof gitBranchSchema>
export type GitStashInfo = z.infer<typeof gitStashSchema>
export type GitCloneInput = z.infer<typeof gitCloneInputSchema>
export type GitCommitInput = z.infer<typeof gitCommitInputSchema>
export type GitBranchInput = z.infer<typeof gitBranchInputSchema>
export type GitCheckoutInput = z.infer<typeof gitCheckoutInputSchema>
export type GitStashInput = z.infer<typeof gitStashInputSchema>
export type GitAddInput = z.infer<typeof gitAddInputSchema>
export type GitRemoteInput = z.infer<typeof gitRemoteInputSchema>
