import { Bot, Files, GitBranch, Search, Settings } from 'lucide-react'
import type { ViewId } from '../commands'

const activities = [
  { id: 'explorer', label: 'Explorer', Icon: Files },
  { id: 'search', label: 'Search', Icon: Search },
  { id: 'source-control', label: 'Source Control', Icon: GitBranch },
  { id: 'agent', label: 'Agent', Icon: Bot },
  { id: 'settings', label: 'Settings', Icon: Settings }
] as const

export function ActivityBar({ active, onSelect }: { active: ViewId; onSelect: (view: ViewId) => void }) {
  return <nav className="activity-bar" aria-label="Primary">
    {activities.map(({ id, label, Icon }) => <button key={id} type="button" className={active === id ? 'activity active' : 'activity'} aria-label={label} title={label} onClick={() => onSelect(id)}><Icon aria-hidden="true" size={20} /></button>)}
  </nav>
}
