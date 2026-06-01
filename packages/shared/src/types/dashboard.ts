import { MessageRole } from './events.js'

/** 페이지네이션 응답 공통 형태 (offset 방식) */
export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface ModelShare {
  model: string
  totalTokens: number
}

export interface DashboardSummary {
  sessionCount: number
  turnCount: number
  activeUserCount: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheCreationTokens: number
  estimatedCostUsd: number
  topSkills: Array<{ skillName: string; callCount: number }>
  topAgents: Array<{ agentType: string; callCount: number }>
  modelShare: ModelShare[]
}

export interface UsageSeries {
  date: string  // YYYY-MM-DD
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  estimatedCostUsd: number
}

/** summary + usage를 한 번에 반환하는 overview 엔드포인트 응답 */
export interface DashboardOverview {
  summary: DashboardSummary
  usage: { series: UsageSeries[] }
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
  sessionCount: number
  lastUsedAt: string
  /** 집계 기간 내 이 skill을 호출한 distinct user_id 수 (events 테이블 기준) */
  userCount: number
  /**
   * 이 skill의 tool_completion 시간 중앙값(ms). messages.duration_ms 의 p50.
   * 샘플 < 3건이면 통계 신뢰성 휴리스틱으로 null을 반환한다.
   * "샘플 3" 임계값은 의도적으로 낮은 휴리스틱이며 통계적 유의수준이 아니다.
   */
  medianDurationMs: number | null
}

export interface AgentStat {
  agentType: string
  callCount: number
  sessionCount: number
  lastUsedAt: string
  sampleDesc?: string | null
  /** 집계 기간 내 이 agent를 호출한 distinct user_id 수 (events 테이블 기준) */
  userCount: number
  /**
   * 이 agent의 tool_completion 시간 중앙값(ms). messages.duration_ms 의 p50.
   * 샘플 < 3건이면 통계 신뢰성 휴리스틱으로 null을 반환한다.
   * "샘플 3" 임계값은 의도적으로 낮은 휴리스틱이며 통계적 유의수준이 아니다.
   */
  medianDurationMs: number | null
}

/** org-scoped 세션 리스트/디테일에서 사용하는 project 요약 정보 */
export interface SessionProjectSummary {
  id: string
  slug: string
  name: string
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
  /** 저장된 session.title, 없으면 첫 HUMAN 메시지로 fallback (200자 truncation). 완전히 비어있으면 null */
  title: string | null
  /** org-scoped 응답에서는 반드시 포함. 기존 project-scoped 응답은 미포함(후방호환). */
  project?: SessionProjectSummary
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
  /** 이 메시지 구간에 귀속되는 usageRecord 합계 (ASSISTANT 메시지 외에는 보통 0) */
  outputTokens: number
  inputTokens: number
  estimatedCostUsd: number
  model?: string | null
  // TOOL role 전용
  toolName?: string | null
  toolInput?: Record<string, unknown> | null
  toolUseId?: string | null
  durationMs?: number | null
}

export interface SessionDetail extends SessionItem {
  /** 저장된 session.summary (transcript "summary" 라인). 없으면 null */
  summary: string | null
  messages: SessionDetailMessage[]
  usageTimeline: SessionTimelineUsage[]
}
