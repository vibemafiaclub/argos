import type { SessionDetail } from '@argos/shared'

export type MessageEvent = {
  kind: 'message'
  role: 'HUMAN' | 'ASSISTANT'
  content: string
  timestamp: string
  sequence: number
  outputTokens: number
  inputTokens: number
  estimatedCostUsd: number
  model: string | null
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

export const SLASH_COMMAND_TAG_RE =
  /<command-message>[^<]*<\/command-message>\s*<command-name>\/([^<\s]+)<\/command-name>/g

export function extractSlashCommands(content: string): {
  stripped: string
  names: string[]
} {
  const names: string[] = []
  const stripped = content
    .replace(SLASH_COMMAND_TAG_RE, (_, name) => {
      names.push(name)
      return ''
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { stripped, names }
}

export function messagesToTimeline(messages: SessionDetail['messages']): TimelineEvent[] {
  const events: TimelineEvent[] = messages.flatMap((m) => {
    if (m.role === 'TOOL') {
      const toolName = m.toolName ?? 'unknown'
      const toolInput = (m.toolInput ?? null) as Record<string, unknown> | null
      const skillName = getSkillName(toolName, toolInput)
      const agentType = getAgentType(toolName, toolInput)
      return [
        {
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
        },
      ]
    }

    if (m.role === 'HUMAN') {
      const { stripped, names } = extractSlashCommands(m.content)
      if (names.length > 0) {
        const out: TimelineEvent[] = []
        if (stripped.length > 0) {
          out.push({
            kind: 'message',
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
            sequence: m.sequence,
            outputTokens: m.outputTokens ?? 0,
            inputTokens: m.inputTokens ?? 0,
            estimatedCostUsd: m.estimatedCostUsd ?? 0,
            model: m.model ?? null,
          })
        }
        names.forEach((name, i) => {
          out.push({
            kind: 'tool',
            toolName: 'Skill',
            toolInput: { skill: name },
            content: '',
            durationMs: null,
            timestamp: m.timestamp,
            sequence: m.sequence + (i + 1) * 0.001,
            isSkillCall: true,
            skillName: name,
            isAgentCall: false,
            agentType: null,
          })
        })
        return out
      }
    }

    return [
      {
        kind: 'message',
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        sequence: m.sequence,
        outputTokens: m.outputTokens ?? 0,
        inputTokens: m.inputTokens ?? 0,
        estimatedCostUsd: m.estimatedCostUsd ?? 0,
        model: m.model ?? null,
      },
    ]
  })

  events.sort((a, b) => {
    if (a.timestamp < b.timestamp) return -1
    if (a.timestamp > b.timestamp) return 1
    return a.sequence - b.sequence
  })

  return events
}
