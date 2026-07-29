import { describe, expect, it, vi } from 'vitest'
import { filterCommands, type Command } from '../src/renderer/src/commands'

const commands: Command[] = [
  { id: 'workspace.open', title: 'Open Folder', category: 'Workspace', run: vi.fn() },
  { id: 'view.settings', title: 'Show Settings', category: 'View', run: vi.fn() }
]

describe('command filtering', () => {
  it('matches all search terms without case sensitivity', () => {
    expect(filterCommands(commands, 'WORK open').map((command) => command.id)).toEqual(['workspace.open'])
  })

  it('returns all commands for an empty query', () => {
    expect(filterCommands(commands, '')).toHaveLength(2)
  })
})
