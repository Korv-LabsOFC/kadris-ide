export type ViewId = 'explorer' | 'search' | 'source-control' | 'agent' | 'settings'

export interface Command {
  id: string
  title: string
  category: string
  shortcut?: string
  run: () => void | Promise<void>
}

export function filterCommands(commands: Command[], query: string): Command[] {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return commands
  return commands.filter((command) => {
    const searchable = `${command.category} ${command.title}`.toLocaleLowerCase()
    return terms.every((term) => searchable.includes(term))
  })
}
