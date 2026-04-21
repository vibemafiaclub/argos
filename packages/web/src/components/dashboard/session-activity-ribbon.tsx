'use client'

import type { CSSProperties } from 'react'
import type { TimelineEvent } from '@/lib/timeline-events'

type Props = {
  events: TimelineEvent[]
  selectedIdx: number | null
  onSelect: (idx: number) => void
}

function segmentStyle(event: TimelineEvent): {
  bg: string
  style: CSSProperties
  title: string
} {
  if (event.kind === 'message' && event.role === 'HUMAN') {
    return {
      bg: 'bg-purple-500',
      style: { flex: '0 0 3px' },
      title: 'User message',
    }
  }
  if (event.kind === 'message' && event.role === 'ASSISTANT') {
    const grow = Math.max(event.outputTokens, 1)
    return {
      bg: 'bg-blue-500',
      style: { flex: `${grow} 0 6px` },
      title: `Agent — ${event.outputTokens.toLocaleString()} output tokens`,
    }
  }
  const tool = event as Extract<TimelineEvent, { kind: 'tool' }>
  const dur = tool.durationMs ? ` · ${(tool.durationMs / 1000).toFixed(1)}s` : ''
  return {
    bg: 'bg-gray-400',
    style: { flex: '0 0 8px' },
    title: `${tool.toolName}${dur}`,
  }
}

export function SessionActivityRibbon({
  events,
  selectedIdx,
  onSelect,
}: Props) {
  if (events.length === 0) return null

  return (
    <div className="flex h-5 w-full gap-px overflow-hidden rounded bg-gray-100">
      {events.map((event, idx) => {
        const { bg, style, title } = segmentStyle(event)
        const selected = idx === selectedIdx
        return (
          <button
            key={idx}
            type="button"
            style={style}
            onClick={() => onSelect(idx)}
            title={title}
            aria-label={title}
            className={`h-full ${bg} transition-opacity ${
              selected
                ? 'outline outline-2 outline-offset-[-2px] outline-purple-700'
                : 'hover:opacity-70'
            }`}
          />
        )
      })}
    </div>
  )
}
