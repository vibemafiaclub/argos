import type { SessionDetail } from '@argos/shared'

export type MessageEvent = {
  kind: 'message'
  role: 'HUMAN' | 'ASSISTANT'
  content: string
  timestamp: string
  sequence: number
  outputTokens: number
}

export type ToolEvent = {
  kind: 'tool'
  toolName: string
  toolInput: Record<string, unknown> | null
  content: string          // tool_result 텍스트
  durationMs: number | null
  timestamp: string
  sequence: number
  isSkillCall: boolean
  skillName: string | null
  isAgentCall: boolean
  agentType: string | null
}

export type TimelineEvent = MessageEvent | ToolEvent

function getSkillName(toolName: string, input: Record<string, unknown> | null): string | null {
  if (toolName !== 'Skill' || !input) return null
  const skill = input['skill']
  return typeof skill === 'string' ? skill : null
}

function getAgentType(toolName: string, input: Record<string, unknown> | null): string | null {
  if (toolName !== 'Agent' || !input) return null
  const t = input['subagent_type']
  return typeof t === 'string' ? t : null
}

export function messagesToTimeline(messages: SessionDetail['messages']): TimelineEvent[] {
  const events: TimelineEvent[] = messages.map((m) => {
    if (m.role === 'TOOL') {
      const toolName = m.toolName ?? 'unknown'
      const toolInput = (m.toolInput ?? null) as Record<string, unknown> | null
      const skillName = getSkillName(toolName, toolInput)
      const agentType = getAgentType(toolName, toolInput)
      return {
        kind: 'tool',
        toolName,
        toolInput,
        content: m.content,
        durationMs: m.durationMs ?? null,
        timestamp: m.timestamp,
        sequence: m.sequence,
        isSkillCall: toolName === 'Skill',
        skillName,
        isAgentCall: toolName === 'Agent',
        agentType,
      }
    }
    return {
      kind: 'message',
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      sequence: m.sequence,
      outputTokens: m.outputTokens ?? 0,
    }
  })

  events.sort((a, b) => {
    if (a.timestamp < b.timestamp) return -1
    if (a.timestamp > b.timestamp) return 1
    return a.sequence - b.sequence
  })

  return events
}
