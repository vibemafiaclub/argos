import { MessageRole } from './events.js'

export interface DashboardSummary {
  sessionCount: number
  activeUserCount: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheCreationTokens: number
  estimatedCostUsd: number
  topSkills: Array<{ skillName: string; callCount: number }>
  topAgents: Array<{ agentType: string; callCount: number }>
}

export interface UsageSeries {
  date: string  // YYYY-MM-DD
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  estimatedCostUsd: number
}

export interface UserStat {
  userId: string
  name: string
  avatarUrl?: string | null
  sessionCount: number
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
  skillCalls: number
  agentCalls: number
}

export interface SkillStat {
  skillName: string
  callCount: number
  slashCommandCount: number
  lastUsedAt: string
}

export interface AgentStat {
  agentType: string
  callCount: number
  sampleDesc?: string | null
}

export interface SessionItem {
  id: string
  userId: string
  userName: string
  startedAt: string
  endedAt?: string | null
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
  eventCount: number
}

export interface SessionDetail extends SessionItem {
  messages: Array<{ role: MessageRole; content: string; sequence: number; timestamp: string }>
}
