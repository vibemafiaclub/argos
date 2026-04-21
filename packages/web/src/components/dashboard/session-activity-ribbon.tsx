'use client'

import { useMemo, useState, useRef, type CSSProperties } from 'react'
import {
  SLASH_COMMAND_TAG_RE,
  buildTimelineGroups,
  type TimelineEvent,
} from '@/lib/timeline-events'
import { formatTokens, formatCost, formatRelativeTime } from '@/lib/format'

type Props = {
  events: TimelineEvent[]
  selectedIdx: number | null
  onSelect: (idx: number) => void
  sessionStartedAt: string
  expandedGroups: Set<number>
  onToggleGroup: (firstIdx: number) => void
}

type HoverState =
  | { kind: 'event'; idx: number; x: number }
  | {
      kind: 'merged'
      firstIdx: number
      toolName: string
      count: number
      firstEvent: TimelineEvent
      x: number
    }

function segmentVisuals(event: TimelineEvent): {
  bg: string
  style: CSSProperties
} {
  if (event.kind === 'message' && event.role === 'HUMAN') {
    return { bg: 'bg-brand', style: { flex: '0 0 3px' } }
  }
  if (event.kind === 'message' && event.role === 'ASSISTANT') {
    const grow = Math.max(event.outputTokens, 1)
    return { bg: 'bg-brand-2', style: { flex: `${grow} 0 6px` } }
  }
  return { bg: 'bg-muted-foreground', style: { flex: '0 0 8px' } }
}

function EventTooltipBody({
  event,
  sessionStartedAt,
}: {
  event: TimelineEvent
  sessionStartedAt: string
}) {
  const elapsed = formatRelativeTime(event.timestamp, sessionStartedAt)

  if (event.kind === 'message' && event.role === 'HUMAN') {
    const preview = event.content
      .replace(SLASH_COMMAND_TAG_RE, (_, name) => `/${name}`)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120)
    return (
      <>
        <p className="font-medium">User</p>
        <p className="text-xs text-muted-foreground mb-2">{elapsed}</p>
        {preview && (
          <p className="text-xs text-foreground max-w-[280px] line-clamp-3">
            {preview}
          </p>
        )}
      </>
    )
  }

  if (event.kind === 'message') {
    return (
      <>
        <p className="font-medium">Agent</p>
        <p className="text-xs text-muted-foreground mb-2">{elapsed}</p>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-chart-1" />
            <span className="text-muted-foreground">Input:</span>
            <span className="font-medium tabular-nums">{formatTokens(event.inputTokens)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-chart-2" />
            <span className="text-muted-foreground">Output:</span>
            <span className="font-medium tabular-nums">{formatTokens(event.outputTokens)}</span>
          </div>
          <div className="pt-1 mt-1 border-t border-border">
            <span className="text-muted-foreground">Cost:</span>
            <span className="font-medium ml-2 tabular-nums">
              {formatCost(event.estimatedCostUsd)}
            </span>
          </div>
          {event.model && (
            <div>
              <span className="text-muted-foreground">Model:</span>
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
      <p className="font-medium">Tool</p>
      <p className="text-xs text-muted-foreground mb-2">{elapsed}</p>
      <div className="space-y-1 text-xs">
        <div>
          <span className="text-muted-foreground">Name:</span>
          <span className="font-medium ml-2">{label}</span>
        </div>
        {dur && (
          <div>
            <span className="text-muted-foreground">Duration:</span>
            <span className="font-medium ml-2 tabular-nums">{dur}</span>
          </div>
        )}
      </div>
    </>
  )
}

function MergedTooltipBody({
  toolName,
  count,
  firstEvent,
  sessionStartedAt,
}: {
  toolName: string
  count: number
  firstEvent: TimelineEvent
  sessionStartedAt: string
}) {
  const elapsed = formatRelativeTime(firstEvent.timestamp, sessionStartedAt)
  return (
    <>
      <p className="font-medium">Tool</p>
      <p className="text-xs text-muted-foreground mb-2">{elapsed}</p>
      <div className="space-y-1 text-xs">
        <div>
          <span className="text-muted-foreground">Name:</span>
          <span className="font-medium ml-2">
            {toolName} <span className="text-muted-foreground">x{count}</span>
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground pt-1">
          클릭하여 펼치기
        </p>
      </div>
    </>
  )
}

export function SessionActivityRibbon({
  events,
  selectedIdx,
  onSelect,
  sessionStartedAt,
  expandedGroups,
  onToggleGroup,
}: Props) {
  const [hover, setHover] = useState<HoverState | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const groups = useMemo(() => buildTimelineGroups(events), [events])

  if (events.length === 0) return null

  const trackMouse = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return e.clientX
    return e.clientX - rect.left
  }

  const handleEventHover = (idx: number) => (e: React.MouseEvent) => {
    setHover({ kind: 'event', idx, x: trackMouse(e) })
  }

  const handleMergedHover = (
    firstIdx: number,
    toolName: string,
    count: number,
    firstEvent: TimelineEvent,
  ) => (e: React.MouseEvent) => {
    setHover({
      kind: 'merged',
      firstIdx,
      toolName,
      count,
      firstEvent,
      x: trackMouse(e),
    })
  }

  const segments: React.ReactNode[] = []
  for (const group of groups) {
    if (group.kind === 'single') {
      const { event, idx } = group
      const { bg, style } = segmentVisuals(event)
      const selected = idx === selectedIdx
      segments.push(
        <button
          key={`s-${idx}`}
          type="button"
          style={style}
          onClick={() => onSelect(idx)}
          onMouseEnter={handleEventHover(idx)}
          onMouseMove={handleEventHover(idx)}
          onMouseLeave={() => setHover(null)}
          aria-label={`Event ${idx + 1}`}
          className={`h-full ${bg} transition-opacity ${
            selected
              ? 'outline outline-2 outline-offset-[-2px] outline-foreground'
              : 'hover:opacity-70'
          }`}
        />,
      )
      continue
    }

    if (group.items.length === 1) {
      const { event, idx } = group.items[0]
      const { bg, style } = segmentVisuals(event)
      const selected = idx === selectedIdx
      segments.push(
        <button
          key={`gs-${idx}`}
          type="button"
          style={style}
          onClick={() => onSelect(idx)}
          onMouseEnter={handleEventHover(idx)}
          onMouseMove={handleEventHover(idx)}
          onMouseLeave={() => setHover(null)}
          aria-label={`Event ${idx + 1}`}
          className={`h-full ${bg} transition-opacity ${
            selected
              ? 'outline outline-2 outline-offset-[-2px] outline-foreground'
              : 'hover:opacity-70'
          }`}
        />,
      )
      continue
    }

    const firstIdx = group.items[0].idx
    const lastIdx = group.items[group.items.length - 1].idx
    const containsSelected =
      selectedIdx !== null && selectedIdx >= firstIdx && selectedIdx <= lastIdx
    const isExpanded = expandedGroups.has(firstIdx) || containsSelected

    if (isExpanded) {
      for (const { event, idx } of group.items) {
        const { bg, style } = segmentVisuals(event)
        const selected = idx === selectedIdx
        segments.push(
          <button
            key={`gc-${idx}`}
            type="button"
            style={style}
            onClick={() => onSelect(idx)}
            onMouseEnter={handleEventHover(idx)}
            onMouseMove={handleEventHover(idx)}
            onMouseLeave={() => setHover(null)}
            aria-label={`Event ${idx + 1}`}
            className={`h-full ${bg} transition-opacity ${
              selected
                ? 'outline outline-2 outline-offset-[-2px] outline-foreground'
                : 'hover:opacity-70'
            }`}
          />,
        )
      }
      continue
    }

    segments.push(
      <button
        key={`gh-${firstIdx}`}
        type="button"
        style={{ flex: '0 0 10px' }}
        onClick={() => onToggleGroup(firstIdx)}
        onMouseEnter={handleMergedHover(
          firstIdx,
          group.toolName,
          group.items.length,
          group.items[0].event,
        )}
        onMouseMove={handleMergedHover(
          firstIdx,
          group.toolName,
          group.items.length,
          group.items[0].event,
        )}
        onMouseLeave={() => setHover(null)}
        aria-label={`${group.toolName} x${group.items.length}`}
        className="relative h-full bg-muted-foreground transition-opacity hover:opacity-70"
      >
        <span className="pointer-events-none absolute inset-y-1 left-1/2 -translate-x-1/2 w-px bg-background/50" />
      </button>,
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex h-8 w-full gap-px overflow-hidden rounded-md bg-muted">
        {segments}
      </div>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg p-3"
          style={{
            left: `${hover.x}px`,
            bottom: 'calc(100% + 6px)',
            transform: 'translateX(-50%)',
          }}
        >
          {hover.kind === 'event' ? (
            <EventTooltipBody
              event={events[hover.idx]}
              sessionStartedAt={sessionStartedAt}
            />
          ) : (
            <MergedTooltipBody
              toolName={hover.toolName}
              count={hover.count}
              firstEvent={hover.firstEvent}
              sessionStartedAt={sessionStartedAt}
            />
          )}
        </div>
      )}
    </div>
  )
}
