/**
 * 주간 리포트 API 응답 타입.
 * 서버(weekly-report.ts)와 클라이언트(hooks/pages)가 공용으로 참조한다.
 */

export interface WeekMeta {
  label: string        // "2026-W16 (4/13~4/19)"
  isoKey: string       // "2026-W16"
  startISO: string     // ISO string of week start (Mon 00:00 UTC)
  endISO: string       // ISO string of week end (Sun 23:59:59.999 UTC)
  isCurrent: boolean   // 오늘이 이 주에 포함되는가 (진행 중 주)
  isFirst: boolean     // 이전 주 데이터가 전혀 없는가 (W/W 비교 불가)
}

export interface WowDelta {
  sessions: number      // % (소수점 1자리). null 표현은 0
  turns: number
  activeUsers: number
  tokens: number
}

export interface WeeklyKpis {
  sessionCount: number
  turnCount: number
  activeUserCount: number
  totalTokens: number   // input + output + cacheRead + cacheCreation
  wow: WowDelta
}

export interface LeaderEntry {
  userId: string
  userName: string
  avatarUrl: string | null
  value: number
  runnerUpValue: number | null
}

export interface WeeklyTopUsers {
  learnFrom: {
    skillUsage: LeaderEntry | null
    skillDiversity: LeaderEntry | null
    delegation: LeaderEntry | null
    conciseSession: LeaderEntry | null
  }
  usageScale: {
    sessionCount: LeaderEntry | null
    tokenUsage: LeaderEntry | null
  }
  eligibleUserCount: number  // 주간 세션 ≥ 3 사용자 수
}

export interface WeeklyInsights {
  delegation: {
    taskCount: number
    topAgents: Array<{ agentType: string; callCount: number }>
    sampleSessionIds: string[]
  }
  skillAssets: {
    totalCalls: number
    distinctSkills: number
    forgottenSkills: string[]  // 최근 4주 호출 있었지만 이번 주 0회
  }
}

export interface DailySeriesPoint {
  date: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  estimatedCostUsd: number
}

export interface WeeklyTrendContext {
  thisWeekSeries: DailySeriesPoint[]
  prevWeekSeries: DailySeriesPoint[]
  topSkills: Array<{ skillName: string; callCount: number }>
  topAgents: Array<{ agentType: string; callCount: number }>
  modelShare: Array<{ model: string; totalTokens: number }>
}

export interface WeeklyReport {
  week: WeekMeta
  kpis: WeeklyKpis
  insights: WeeklyInsights
  topUsers: WeeklyTopUsers
  trendContext: WeeklyTrendContext
}
