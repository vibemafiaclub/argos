import type { IngestEventPayload } from '@argos/shared'

export interface DerivedFields {
  isSkillCall: boolean
  skillName: string | null
  isSlashCommand: boolean
  isAgentCall: boolean
  agentType: string | null
  agentDesc: string | null
}

// toolName === 'Skill' → isSkillCall=true, skillName=toolInput.skill
// toolName === 'Agent' → isAgentCall=true, agentType=toolInput.subagent_type, agentDesc=toolInput.description
// isSlashCommand은 CLI가 채워 보내므로 payload에서 그대로 읽음
export function deriveFields(payload: IngestEventPayload): DerivedFields {
  const isSkillCall = payload.toolName === 'Skill'
  const isAgentCall = payload.toolName === 'Agent'

  let skillName: string | null = null
  let agentType: string | null = null
  let agentDesc: string | null = null

  if (isSkillCall && payload.toolInput) {
    const skill = payload.toolInput['skill']
    if (typeof skill === 'string') {
      skillName = skill
    }
  }

  if (isAgentCall && payload.toolInput) {
    const subagentType = payload.toolInput['subagent_type']
    const description = payload.toolInput['description']

    if (typeof subagentType === 'string') {
      agentType = subagentType
    }
    if (typeof description === 'string') {
      agentDesc = description
    }
  }

  return {
    isSkillCall,
    skillName,
    isSlashCommand: payload.isSlashCommand ?? false, // CLI가 채워서 보냄, 없으면 false
    isAgentCall,
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
