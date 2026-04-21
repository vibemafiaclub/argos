import type { TimelineEvent } from '@/lib/timeline-events'
import { parseMessageContent } from '@/lib/parse-message-content'
import { formatDate } from '@/lib/format'
import { User, Bot, Wrench } from 'lucide-react'

type EventDetailProps = { event: TimelineEvent | null }

function getHeaderIcon(event: TimelineEvent) {
  if (event.kind === 'message') {
    if (event.role === 'HUMAN') {
      return { Icon: User, bg: 'bg-purple-500' }
    }
    return { Icon: Bot, bg: 'bg-blue-500' }
  }
  const isSpecial = event.isSkillCall || event.isAgentCall
  return { Icon: Wrench, bg: isSpecial ? 'bg-amber-500' : 'bg-gray-400' }
}

function getHeaderLabel(event: TimelineEvent): string {
  if (event.kind === 'message') {
    return event.role === 'HUMAN' ? 'User' : 'Assistant'
  }
  return event.toolName
}

function getHeaderSubLabel(event: TimelineEvent): string | null {
  if (event.kind !== 'tool') return null
  if (event.isSkillCall && event.skillName) return `Skill: ${event.skillName}`
  if (event.isAgentCall && event.agentType) return `Agent: ${event.agentType}`
  return null
}

export function EventDetail({ event }: EventDetailProps) {
  if (event === null) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
          Select an event to see details
        </div>
      </div>
    )
  }

  const { Icon, bg } = getHeaderIcon(event)
  const label = getHeaderLabel(event)
  const subLabel = getHeaderSubLabel(event)

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${bg}`}
          >
            <Icon className="h-3.5 w-3.5 text-white" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">
              {label}
            </div>
            {subLabel && (
              <div className="text-xs text-gray-500 truncate">{subLabel}</div>
            )}
          </div>
        </div>
        <span className="shrink-0 text-xs text-gray-500">
          {formatDate(event.timestamp)}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {event.kind === 'message' ? (
          <div className="space-y-3">
            {parseMessageContent(event.content).map((part, idx) => {
              if (part.type === 'code') {
                return (
                  <div key={idx}>
                    {part.language && part.language !== 'text' && (
                      <div className="mb-1 inline-block rounded bg-gray-200 px-2 py-0.5 text-[10px] font-mono uppercase text-gray-700">
                        {part.language}
                      </div>
                    )}
                    <pre className="bg-gray-900 text-gray-100 rounded p-3 text-xs overflow-x-auto">
                      <code>{part.content}</code>
                    </pre>
                  </div>
                )
              }
              return (
                <p
                  key={idx}
                  className="whitespace-pre-wrap text-sm text-gray-800"
                >
                  {part.content}
                </p>
              )
            })}
          </div>
        ) : (
          <div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-gray-500">Tool</dt>
              <dd className="text-gray-900 font-medium">{event.toolName}</dd>
              <dt className="text-gray-500">Event type</dt>
              <dd className="text-gray-900">{event.eventType}</dd>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              {event.isSkillCall && event.skillName && (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                  Skill: {event.skillName}
                </span>
              )}
              {event.isAgentCall && event.agentType && (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                  Agent: {event.agentType}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-4">
              Tool inputs/outputs not captured at this time.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
