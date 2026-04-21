import { User, Bot, Wrench } from 'lucide-react'
import type { TimelineEvent } from '@/lib/timeline-events'

type EventListProps = {
  events: TimelineEvent[]
  selectedIdx: number
  onSelect: (idx: number) => void
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function getTypeLabel(event: TimelineEvent): string {
  if (event.kind === 'message') {
    return event.role === 'HUMAN' ? 'User' : 'Assistant'
  }
  if (event.isSkillCall && event.skillName) return event.skillName
  if (event.isAgentCall && event.agentType) return `Agent:${event.agentType}`
  return event.toolName
}

function getPreview(event: TimelineEvent): string {
  if (event.kind === 'message') {
    const stripped = event.content.replace(/\s+/g, ' ').trim()
    return stripped.slice(0, 80)
  }
  if (event.skillName) return `Skill: ${event.skillName}`
  return `${event.toolName} call`
}

function getIcon(event: TimelineEvent) {
  if (event.kind === 'message') {
    if (event.role === 'HUMAN') {
      return { Icon: User, bg: 'bg-purple-500' }
    }
    return { Icon: Bot, bg: 'bg-blue-500' }
  }
  const isSpecial = event.isSkillCall || event.isAgentCall
  return { Icon: Wrench, bg: isSpecial ? 'bg-amber-500' : 'bg-gray-400' }
}

export function EventList({ events, selectedIdx, onSelect }: EventListProps) {
  if (events.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-gray-500">
        No events recorded
      </div>
    )
  }

  return (
    <ul className="divide-y divide-gray-100">
      {events.map((event, idx) => {
        const { Icon, bg } = getIcon(event)
        const isSelected = idx === selectedIdx
        const label = getTypeLabel(event)
        const preview = getPreview(event)
        const time = formatTime(event.timestamp)

        return (
          <li key={idx}>
            <button
              type="button"
              onClick={() => onSelect(idx)}
              className={`w-full text-left flex items-center gap-3 px-3 py-2 transition-colors ${
                isSelected
                  ? 'border-l-4 border-purple-500 bg-purple-50'
                  : 'border-l-4 border-transparent hover:bg-gray-50'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${bg}`}
              >
                <Icon className="h-3 w-3 text-white" />
              </span>
              <span className="w-20 shrink-0 text-sm font-medium truncate">
                {label}
              </span>
              <span className="flex-1 truncate text-sm text-gray-600">
                {preview}
              </span>
              <span className="shrink-0 text-xs text-gray-400 tabular-nums">
                {time}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
