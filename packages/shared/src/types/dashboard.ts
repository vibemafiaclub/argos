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

/** 세션 타임라인 차트용 — UsageRecord 1건에 대응 */
export interface SessionTimelineUsage {
  timestamp: string      // ISO 8601
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
  model?: string | null
  isSubagent: boolean
}

export interface SessionDetailMessage {
  role: MessageRole
  content: string
  sequence: number
  timestamp: string
  /** 이 메시지 구간에 귀속되는 usageRecord outputTokens 합 (ASSISTANT 메시지 외에는 보통 0) */
  outputTokens: number
  // TOOL role 전용
  toolName?: string | null
  toolInput?: Record<string, unknown> | null
  toolUseId?: string | null
  durationMs?: number | null
}

export interface SessionDetail extends SessionItem {
  messages: SessionDetailMessage[]
  usageTimeline: SessionTimelineUsage[]
}
