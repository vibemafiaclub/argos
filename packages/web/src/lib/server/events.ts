import type { IngestEventPayload } from '@argos/shared'
import { getSubagentDescription, getSubagentType } from '../subagent-tools'

export interface DerivedFields {
  isSkillCall: boolean
  skillName: string | null
  isSlashCommand: boolean
  isAgentCall: boolean
  agentType: string | null
  agentDesc: string | null
}

// toolName === 'Skill' → isSkillCall=true, skillName=toolInput.skill
// Slash commands are normalized by the CLI into toolInput.skill as well.
// toolName === 'Agent' 또는 'Task' + subagent_type → isAgentCall=true
// agentType=toolInput.subagent_type, agentDesc=toolInput.description
// isSlashCommand은 CLI가 채워 보내므로 payload에서 그대로 읽음
export function deriveFields(payload: IngestEventPayload): DerivedFields {
  let skillName: string | null = null

  if (payload.toolInput) {
    const skill = payload.toolInput['skill']
    if (typeof skill === 'string') {
      skillName = skill
    }
  }

  const isSkillCall =
    payload.toolName === 'Skill' || (payload.isSlashCommand === true && skillName !== null)

  const agentType = getSubagentType(payload.toolName, payload.toolInput ?? null)
  const agentDesc = getSubagentDescription(payload.toolName, payload.toolInput ?? null)

  return {
    isSkillCall,
    skillName,
    isSlashCommand: payload.isSlashCommand ?? false, // CLI가 채워서 보냄, 없으면 false
    isAgentCall: agentType !== null,
    agentType,
    agentDesc,
  }
}

// toolResponse를 2,000자로 truncation
export function truncateToolResponse(response: string | undefined): string | undefined {
  if (!response) return undefined
  return response.length > 2000 ? response.slice(0, 2000) : response
}

// message content를 50,000자로 truncation
export function truncateMessageContent(content: string): string {
  return content.length > 50000 ? content.slice(0, 50000) : content
}
