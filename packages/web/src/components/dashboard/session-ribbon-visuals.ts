import type { CSSProperties } from 'react'
import type { TimelineEvent } from '../../lib/timeline-events'

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
  return { bg: 'bg-muted-foreground', style: { flex: '0 0 8px' } }
}
