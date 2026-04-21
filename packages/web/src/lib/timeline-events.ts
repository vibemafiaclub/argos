import type { SessionDetail } from '@argos/shared'

export type MessageEvent = {
  kind: 'message'
  role: 'HUMAN' | 'ASSISTANT'
  content: string
  timestamp: string
  sequence: number
}

export type ToolEvent = {
  kind: 'tool'
  toolName: string
  eventType: 'PRE_TOOL_USE' | 'POST_TOOL_USE'
  timestamp: string
  isSkillCall: boolean
  skillName?: string | null
  isAgentCall: boolean
  agentType?: string | null
}

export type TimelineEvent = MessageEvent | ToolEvent

export function mergeTimelineEvents(
  messages: SessionDetail['messages'],
  toolEvents: SessionDetail['toolEvents'],
): TimelineEvent[] {
  const merged: TimelineEvent[] = []

  for (const message of messages) {
    merged.push({
      kind: 'message',
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      sequence: message.sequence,
    })
  }

  for (const tool of toolEvents) {
    if (tool.eventType !== 'PRE_TOOL_USE') continue
    merged.push({
      kind: 'tool',
      toolName: tool.toolName,
      eventType: tool.eventType,
      timestamp: tool.timestamp,
      isSkillCall: tool.isSkillCall,
      skillName: tool.skillName,
      isAgentCall: tool.isAgentCall,
      agentType: tool.agentType,
    })
  }

  merged.sort((a, b) => {
    if (a.timestamp < b.timestamp) return -1
    if (a.timestamp > b.timestamp) return 1
    if (a.kind === 'message' && b.kind === 'message') {
      return a.sequence - b.sequence
    }
    if (a.kind === 'message') return -1
    if (b.kind === 'message') return 1
    return 0
  })

  return merged
}
