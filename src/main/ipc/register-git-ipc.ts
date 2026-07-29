import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { safeHandler } from './register-ipc'
import { IPC_CHANNELS } from '../../shared/contracts'
import { gitCommitInputSchema, gitCheckoutInputSchema, gitAddInputSchema } from '../../shared/git-contracts'
import type { GitService } from '../services/git-service'

export function registerGitIpc(getGitService: () => GitService | null, isTrustedSender: (event: IpcMainInvokeEvent) => boolean): () => void {
  const channels = [
    IPC_CHANNELS.gitIsRepo,
    IPC_CHANNELS.gitInit,
    IPC_CHANNELS.gitStatus,
    IPC_CHANNELS.gitDiff,
    IPC_CHANNELS.gitAdd,
    IPC_CHANNELS.gitCommit,
    IPC_CHANNELS.gitLog,
    IPC_CHANNELS.gitBranch,
    IPC_CHANNELS.gitCheckout,
    IPC_CHANNELS.gitStash,
    IPC_CHANNELS.gitStashPop,
    IPC_CHANNELS.gitStashList,
    IPC_CHANNELS.gitPush,
    IPC_CHANNELS.gitPull,
    IPC_CHANNELS.gitFetch
  ]

  const g = (): GitService | null => getGitService()

  ipcMain.handle(IPC_CHANNELS.gitIsRepo, safeHandler(async () => { const git = g(); return git ? git.isRepo() : false }, isTrustedSender))
  ipcMain.handle(IPC_CHANNELS.gitInit, safeHandler(async () => { const git = g(); if (!git) throw new Error('No workspace is open'); await git.init(); return null }, isTrustedSender))
  ipcMain.handle(IPC_CHANNELS.gitStatus, safeHandler(async () => { const git = g(); if (!git) throw new Error('No workspace is open'); return git.status() }, isTrustedSender))
  ipcMain.handle(IPC_CHANNELS.gitDiff, safeHandler(async () => { const git = g(); if (!git) throw new Error('No workspace is open'); return git.diff() }, isTrustedSender))
  ipcMain.handle(IPC_CHANNELS.gitAdd, safeHandler(async (_e, input) => { const parsed = gitAddInputSchema.parse(input); const git = g(); if (!git) throw new Error('No workspace is open'); await git.add(parsed.files); return null }, isTrustedSender))
  ipcMain.handle(IPC_CHANNELS.gitCommit, safeHandler(async (_e, input) => { const parsed = gitCommitInputSchema.parse(input); const git = g(); if (!git) throw new Error('No workspace is open'); await git.commit(parsed.message, parsed.all); return null }, isTrustedSender))
  ipcMain.handle(IPC_CHANNELS.gitLog, safeHandler(async () => { const git = g(); if (!git) throw new Error('No workspace is open'); return git.log() }, isTrustedSender))
  ipcMain.handle(IPC_CHANNELS.gitBranch, safeHandler(async () => { const git = g(); if (!git) throw new Error('No workspace is open'); return git.branch() }, isTrustedSender))
  ipcMain.handle(IPC_CHANNELS.gitCheckout, safeHandler(async (_e, input) => { const parsed = gitCheckoutInputSchema.parse(input); const git = g(); if (!git) throw new Error('No workspace is open'); await git.checkout(parsed.branch, parsed.create); return null }, isTrustedSender))
  ipcMain.handle(IPC_CHANNELS.gitStash, safeHandler(async () => { const git = g(); if (!git) throw new Error('No workspace is open'); await git.stash(); return null }, isTrustedSender))
  ipcMain.handle(IPC_CHANNELS.gitStashPop, safeHandler(async () => { const git = g(); if (!git) throw new Error('No workspace is open'); await git.stashPop(); return null }, isTrustedSender))
  ipcMain.handle(IPC_CHANNELS.gitStashList, safeHandler(async () => { const git = g(); if (!git) throw new Error('No workspace is open'); return git.stashList() }, isTrustedSender))
  ipcMain.handle(IPC_CHANNELS.gitPush, safeHandler(async () => { const git = g(); if (!git) throw new Error('No workspace is open'); await git.push(); return null }, isTrustedSender))
  ipcMain.handle(IPC_CHANNELS.gitPull, safeHandler(async () => { const git = g(); if (!git) throw new Error('No workspace is open'); await git.pull(); return null }, isTrustedSender))
  ipcMain.handle(IPC_CHANNELS.gitFetch, safeHandler(async () => { const git = g(); if (!git) throw new Error('No workspace is open'); await git.fetch(); return null }, isTrustedSender))

  return () => { for (const channel of channels) ipcMain.removeHandler(channel) }
}
