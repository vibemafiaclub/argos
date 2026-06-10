import type { CSSProperties } from 'react'
import type { TimelineEvent } from '../../lib/timeline-events'

const CONTENT_THRESHOLD = 500
const MIN_PX = 8

export function segmentVisuals(event: TimelineEvent): {
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
  if (event.kind === 'tool' && (event.isSkillCall || event.isAgentCall)) {
    return { bg: 'bg-chart-4', style: { flex: '0 0 8px' } }
  }
  // plain tool: content.length 기반 동적 flex-grow
  const grow =
    event.kind === 'tool' && event.content.length > CONTENT_THRESHOLD
      ? Math.ceil(event.content.length / 100)
      : 0
  return {
    bg: 'bg-muted-foreground',
    style: { flex: grow > 0 ? `${grow} 0 ${MIN_PX}px` : `0 0 ${MIN_PX}px` },
  }
}
