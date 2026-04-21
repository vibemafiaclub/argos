'use client'

import { useState, useRef, type CSSProperties } from 'react'
import type { TimelineEvent } from '@/lib/timeline-events'
import { formatTokens, formatCost, formatRelativeTime } from '@/lib/format'

type Props = {
  events: TimelineEvent[]
  selectedIdx: number | null
  onSelect: (idx: number) => void
  sessionStartedAt: string
}

function segmentVisuals(event: TimelineEvent): {
  bg: string
  style: CSSProperties
} {
  if (event.kind === 'message' && event.role === 'HUMAN') {
    return { bg: 'bg-purple-500', style: { flex: '0 0 3px' } }
  }
  if (event.kind === 'message' && event.role === 'ASSISTANT') {
    const grow = Math.max(event.outputTokens, 1)
    return { bg: 'bg-blue-500', style: { flex: `${grow} 0 6px` } }
  }
  return { bg: 'bg-gray-400', style: { flex: '0 0 8px' } }
}

function TooltipBody({
  event,
  sessionStartedAt,
}: {
  event: TimelineEvent
  sessionStartedAt: string
}) {
  const elapsed = formatRelativeTime(event.timestamp, sessionStartedAt)

  if (event.kind === 'message' && event.role === 'HUMAN') {
    const preview = event.content.replace(/\s+/g, ' ').trim().slice(0, 120)
    return (
      <>
        <p className="font-medium text-gray-900">User</p>
        <p className="text-xs text-gray-500 mb-2">{elapsed}</p>
        {preview && (
          <p className="text-xs text-gray-700 max-w-[280px] line-clamp-3">
            {preview}
          </p>
        )}
      </>
    )
  }

  if (event.kind === 'message' && event.role === 'ASSISTANT') {
    return (
      <>
        <p className="font-medium text-gray-900">Agent</p>
        <p className="text-xs text-gray-500 mb-2">{elapsed}</p>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-violet-500" />
            <span className="text-gray-600">Input:</span>
            <span className="font-medium">{formatTokens(event.inputTokens)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-gray-600">Output:</span>
            <span className="font-medium">{formatTokens(event.outputTokens)}</span>
          </div>
          <div className="pt-1 mt-1 border-t border-gray-200">
            <span className="text-gray-600">Cost:</span>
            <span className="font-medium ml-2">
              {formatCost(event.estimatedCostUsd)}
            </span>
          </div>
          {event.model && (
            <div>
              <span className="text-gray-600">Model:</span>
              <span className="font-medium ml-2">{event.model}</span>
            </div>
          )}
        </div>
      </>
    )
  }

  const dur = event.durationMs
    ? `${(event.durationMs / 1000).toFixed(1)}s`
    : null
  const label = event.isSkillCall && event.skillName
    ? `Skill: ${event.skillName}`
    : event.isAgentCall && event.agentType
      ? `Agent: ${event.agentType}`
      : event.toolName
  return (
    <>
      <p className="font-medium text-gray-900">Tool</p>
      <p className="text-xs text-gray-500 mb-2">{elapsed}</p>
      <div className="space-y-1 text-xs">
        <div>
          <span className="text-gray-600">Name:</span>
          <span className="font-medium ml-2">{label}</span>
        </div>
        {dur && (
          <div>
            <span className="text-gray-600">Duration:</span>
            <span className="font-medium ml-2">{dur}</span>
          </div>
        )}
      </div>
    </>
  )
}

export function SessionActivityRibbon({
  events,
  selectedIdx,
  onSelect,
  sessionStartedAt,
}: Props) {
  const [hover, setHover] = useState<{ idx: number; x: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  if (events.length === 0) return null

  const hoveredEvent = hover !== null ? events[hover.idx] : null

  const handleHover = (idx: number) => (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setHover({ idx, x: e.clientX - rect.left })
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex h-8 w-full gap-px overflow-hidden rounded bg-gray-100">
        {events.map((event, idx) => {
          const { bg, style } = segmentVisuals(event)
          const selected = idx === selectedIdx
          return (
            <button
              key={idx}
              type="button"
              style={style}
              onClick={() => onSelect(idx)}
              onMouseEnter={handleHover(idx)}
              onMouseMove={handleHover(idx)}
              onMouseLeave={() => setHover(null)}
              aria-label={`Event ${idx + 1}`}
              className={`h-full ${bg} transition-opacity ${
                selected
                  ? 'outline outline-2 outline-offset-[-2px] outline-purple-700'
                  : 'hover:opacity-70'
              }`}
            />
          )
        })}
      </div>
      {hover && hoveredEvent && (
        <div
          className="pointer-events-none absolute z-10 bg-white border border-gray-200 rounded-lg shadow-lg p-3"
          style={{
            left: `${hover.x}px`,
            bottom: 'calc(100% + 6px)',
            transform: 'translateX(-50%)',
          }}
        >
          <TooltipBody event={hoveredEvent} sessionStartedAt={sessionStartedAt} />
        </div>
      )}
    </div>
  )
}
