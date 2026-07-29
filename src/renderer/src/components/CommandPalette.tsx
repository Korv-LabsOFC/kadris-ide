import { useEffect, useRef, useState } from 'react'
import { Command as CommandIcon, Search } from 'lucide-react'
import { filterCommands, type Command } from '../commands'

export function CommandPalette({ commands, onClose, onError }: { commands: Command[]; onClose: () => void; onError: (message: string) => void }) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const results = filterCommands(commands, query)
  useEffect(() => inputRef.current?.focus(), [])
  useEffect(() => setActiveIndex(0), [query])

  async function execute(command: Command): Promise<void> {
    onClose()
    try {
      await command.run()
    } catch {
      onError(`Command failed: ${command.title}`)
    }
  }

  return <div className="palette-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="palette" role="dialog" aria-modal="true" aria-label="Command Palette" onKeyDown={(event) => {
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowDown' && results.length > 0) { event.preventDefault(); setActiveIndex((index) => (index + 1) % results.length) }
      else if (event.key === 'ArrowUp' && results.length > 0) { event.preventDefault(); setActiveIndex((index) => (index - 1 + results.length) % results.length) }
      else if (event.key === 'Enter' && results[activeIndex]) { event.preventDefault(); void execute(results[activeIndex]) }
    }}>
      <label className="palette-input"><Search size={17} aria-hidden="true" /><span className="sr-only">Search commands</span><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a command" /></label>
      <div className="command-results" role="listbox">
        {results.length === 0 ? <p className="empty-small">No matching commands</p> : results.map((command, index) => <button key={command.id} type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? 'command-row selected' : 'command-row'} onMouseMove={() => setActiveIndex(index)} onClick={() => { void execute(command) }}><CommandIcon size={15} aria-hidden="true" /><span><strong>{command.title}</strong><small>{command.category}</small></span>{command.shortcut && <kbd>{command.shortcut}</kbd>}</button>)}
      </div>
    </section>
  </div>
}
