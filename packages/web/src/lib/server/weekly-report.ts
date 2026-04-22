import 'server-only'

import {
  startOfISOWeek,
  format,
  getISOWeek,
  getISOWeekYear,
  subWeeks,
} from 'date-fns'
import { db } from './db'
import {
  getDailyRollupsForProjects,
  aggregateSummary,
  aggregateUserStats,
  type DailyRollup,
} from './daily-rollup'
import type {
  WeeklyReport,
  WeekMeta,
  WeeklyKpis,
  WeeklyInsights,
  WeeklyTopUsers,
  WeeklyTrendContext,
  LeaderEntry,
  DailySeriesPoint,
} from '@/types/reports'

// ─── Week utilities ────────────────────────────────────────────────────────

export interface WeekRange {
  start: Date  // Monday 00:00 UTC
  end: Date    // Sunday 23:59:59.999 UTC
  isoKey: string
}

function toUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0, 0, 0, 0,
  ))
}

function formatIsoKey(date: Date): string {
  const year = getISOWeekYear(date)
  const week = getISOWeek(date)
  return `${year}-W${String(week).padStart(2, '0')}`
}

function formatWeekLabel(start: Date, end: Date): string {
  const isoKey = formatIsoKey(start)
  const startLabel = format(start, 'M/d')
  const endLabel = format(end, 'M/d')
  return `${isoKey} (${startLabel}~${endLabel})`
}

/** 날짜가 속한 ISO week의 월요일 00:00 UTC와 일요일 23:59:59.999 UTC */
export function getWeekRangeForDate(date: Date): WeekRange {
  // startOfISOWeek는 local time 기준이므로 UTC midnight으로 정규화
  const monday = toUtcMidnight(startOfISOWeek(date))
  const end = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)
  return {
    start: monday,
    end,
    isoKey: formatIsoKey(monday),
  }
}

/** "2026-W16" → WeekRange. 유효하지 않으면 null */
export function parseWeekParam(iso: string): WeekRange | null {
  const m = iso.match(/^(\d{4})-W(\d{1,2})$/)
  if (!m) return null
  const year = parseInt(m[1], 10)
  const week = parseInt(m[2], 10)
  if (week < 1 || week > 53) return null

  // ISO 8601: week 1 = year-01-04를 포함하는 주
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const weekRepresentative = new Date(jan4.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000)
  return getWeekRangeForDate(weekRepresentative)
}

/** 직전 완료 주 (기본값). 현재 주는 진행 중이므로 제외 */
export function getDefaultWeekRange(): WeekRange {
  return getWeekRangeForDate(subWeeks(new Date(), 1))
}

function buildWeekMeta(week: WeekRange, isFirst: boolean): WeekMeta {
  const now = new Date()
  const isCurrent = now.getTime() >= week.start.getTime() && now.getTime() <= week.end.getTime()
  return {
    label: formatWeekLabel(week.start, week.end),
    isoKey: week.isoKey,
    startISO: week.start.toISOString(),
    endISO: week.end.toISOString(),
    isCurrent,
    isFirst,
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function percentDelta(current: number, prev: number): number {
  if (prev === 0) return current === 0 ? 0 : 100
  return Math.round(((current - prev) / prev) * 1000) / 10  // 소수점 1자리
}

function totalTokensFromRollups(rollups: DailyRollup[]): number {
  return rollups.reduce(
    (sum, r) => sum + r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheCreationTokens,
    0,
  )
}

function seriesFromRollups(rollups: DailyRollup[]): DailySeriesPoint[] {
  return rollups.map((r) => ({
    date: r.date,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    cacheReadTokens: r.cacheReadTokens,
    cacheCreationTokens: r.cacheCreationTokens,
    estimatedCostUsd: r.estimatedCostUsd,
  }))
}

function pickLeader(
  candidates: Array<{ userId: string; userName: string; avatarUrl: string | null; value: number }>,
  orderAsc = false,
): LeaderEntry | null {
  if (candidates.length === 0) return null
  const sorted = [...candidates].sort((a, b) => {
    const diff = orderAsc ? a.value - b.value : b.value - a.value
    if (diff !== 0) return diff
    // 동률 시 userId 사전순 (결정적 순서)
    return a.userId.localeCompare(b.userId)
  })
  const leader = sorted[0]
  const runnerUp = sorted.length >= 2 ? sorted[1] : null
  return {
    userId: leader.userId,
    userName: leader.userName,
    avatarUrl: leader.avatarUrl,
    value: leader.value,
    runnerUpValue: runnerUp ? runnerUp.value : null,
  }
}

// ─── Sub-queries that need raw SQL ─────────────────────────────────────────

interface DiversityRow {
  user_id: string
  name: string
  avatar_url: string | null
  diversity: bigint
}

/** 사용자별 distinct skillName 개수 — aggregateUserStats 에 없어서 별도 쿼리 */
async function queryTopSkillDiversityByUser(
  projectIds: string[],
  start: Date,
  end: Date,
  eligibleUserIds: string[],
): Promise<Array<{ userId: string; userName: string; avatarUrl: string | null; value: number }>> {
  if (projectIds.length === 0 || eligibleUserIds.length === 0) return []
  const rows = await db.$queryRaw<DiversityRow[]>`
    SELECT
      u.id            AS user_id,
      u.name          AS name,
      u.avatar_url    AS avatar_url,
      COUNT(DISTINCT e.skill_name)::bigint AS diversity
    FROM events e
    JOIN users u ON u.id = e.user_id
    WHERE e.project_id = ANY(${projectIds}::text[])
      AND e.is_skill_call = true
      AND e.skill_name IS NOT NULL
      AND e.timestamp >= ${start}
      AND e.timestamp <= ${end}
      AND e.user_id = ANY(${eligibleUserIds}::text[])
    GROUP BY u.id, u.name, u.avatar_url
  `
  return rows.map((r) => ({
    userId: r.user_id,
    userName: r.name,
    avatarUrl: r.avatar_url,
    value: Number(r.diversity),
  }))
}

interface TokenRow {
  user_id: string
  name: string
  avatar_url: string | null
  total_tokens: bigint
}

/** 사용자별 총 토큰 (input + output + cache_read) — cache_read 포함이 aggregateUserStats 에 없어 별도 쿼리 */
async function queryTopTokenUsageByUser(
  projectIds: string[],
  start: Date,
  end: Date,
  eligibleUserIds: string[],
): Promise<Array<{ userId: string; userName: string; avatarUrl: string | null; value: number }>> {
  if (projectIds.length === 0 || eligibleUserIds.length === 0) return []
  const rows = await db.$queryRaw<TokenRow[]>`
    SELECT
      u.id         AS user_id,
      u.name       AS name,
      u.avatar_url AS avatar_url,
      SUM(ur.input_tokens + ur.output_tokens + ur.cache_read_tokens)::bigint AS total_tokens
    FROM usage_records ur
    JOIN users u ON u.id = ur.user_id
    WHERE ur.project_id = ANY(${projectIds}::text[])
      AND ur.timestamp >= ${start}
      AND ur.timestamp <= ${end}
      AND ur.user_id = ANY(${eligibleUserIds}::text[])
    GROUP BY u.id, u.name, u.avatar_url
  `
  return rows.map((r) => ({
    userId: r.user_id,
    userName: r.name,
    avatarUrl: r.avatar_url,
    value: Number(r.total_tokens),
  }))
}

interface ConciseRow {
  user_id: string
  name: string
  avatar_url: string | null
  avg_human_msg: number
}

/**
 * 간결 세션 마스터 —
 * 유효 세션: turnCount(STOP 이벤트 수) ≥ 3
 * 유효 세션 ≥ 3 인 사용자 중 세션당 평균 HUMAN 메시지가 가장 적은 사용자
 */
async function queryConciseSessionLeaders(
  projectIds: string[],
  start: Date,
  end: Date,
): Promise<Array<{ userId: string; userName: string; avatarUrl: string | null; value: number }>> {
  if (projectIds.length === 0) return []
  const rows = await db.$queryRaw<ConciseRow[]>`
    WITH session_turns AS (
      SELECT
        s.id         AS session_id,
        s.user_id    AS user_id,
        (SELECT COUNT(*) FROM events e
          WHERE e.session_id = s.id
            AND e.event_type = 'STOP'
        ) AS turn_count,
        (SELECT COUNT(*) FROM messages m
          WHERE m.session_id = s.id
            AND m.role = 'HUMAN'
        ) AS human_msg_count
      FROM claude_sessions s
      WHERE s.project_id = ANY(${projectIds}::text[])
        AND s.started_at >= ${start}
        AND s.started_at <= ${end}
    ),
    valid_sessions AS (
      SELECT user_id, human_msg_count
      FROM session_turns
      WHERE turn_count >= 3
    ),
    user_avg AS (
      SELECT
        user_id,
        AVG(human_msg_count)::float AS avg_human,
        COUNT(*) AS valid_session_count
      FROM valid_sessions
      GROUP BY user_id
      HAVING COUNT(*) >= 3
    )
    SELECT
      u.id          AS user_id,
      u.name        AS name,
      u.avatar_url  AS avatar_url,
      ua.avg_human  AS avg_human_msg
    FROM user_avg ua
    JOIN users u ON u.id = ua.user_id
  `
  return rows.map((r) => ({
    userId: r.user_id,
    userName: r.name,
    avatarUrl: r.avatar_url,
    value: Number(r.avg_human_msg),
  }))
}

interface SessionIdRow {
  session_id: string
}

/** Task 도구 호출이 있었던 세션 id (최근순 3개) — 위임 사례 링크용 */
async function queryTaskDelegationSampleSessionIds(
  projectIds: string[],
  start: Date,
  end: Date,
): Promise<string[]> {
  if (projectIds.length === 0) return []
  const rows = await db.$queryRaw<SessionIdRow[]>`
    SELECT DISTINCT session_id
    FROM events
    WHERE project_id = ANY(${projectIds}::text[])
      AND tool_name = 'Task'
      AND timestamp >= ${start}
      AND timestamp <= ${end}
      AND agent_id IS NULL
    ORDER BY session_id DESC
    LIMIT 3
  `
  return rows.map((r) => r.session_id)
}

interface SkillNameRow {
  skill_name: string
}

/** 최근 4주에 1회+ 호출됐지만 이번 주 0회인 스킬 목록 */
async function queryForgottenSkills(
  projectIds: string[],
  pastStart: Date,
  weekStart: Date,
  weekEnd: Date,
): Promise<string[]> {
  if (projectIds.length === 0) return []
  const rows = await db.$queryRaw<SkillNameRow[]>`
    WITH past_skills AS (
      SELECT DISTINCT skill_name
      FROM events
      WHERE project_id = ANY(${projectIds}::text[])
        AND is_skill_call = true
        AND skill_name IS NOT NULL
        AND timestamp >= ${pastStart}
        AND timestamp < ${weekStart}
    ),
    current_skills AS (
      SELECT DISTINCT skill_name
      FROM events
      WHERE project_id = ANY(${projectIds}::text[])
        AND is_skill_call = true
        AND skill_name IS NOT NULL
        AND timestamp >= ${weekStart}
        AND timestamp <= ${weekEnd}
    )
    SELECT p.skill_name
    FROM past_skills p
    WHERE NOT EXISTS (
      SELECT 1 FROM current_skills c WHERE c.skill_name = p.skill_name
    )
    ORDER BY p.skill_name ASC
  `
  return rows.map((r) => r.skill_name)
}

// ─── Main service ──────────────────────────────────────────────────────────

export async function getWeeklyReport(
  projectIds: string[],
  week: WeekRange,
): Promise<WeeklyReport> {
  const prevWeekStart = new Date(week.start.getTime() - 7 * 24 * 60 * 60 * 1000)
  const prevWeekEnd = new Date(week.end.getTime() - 7 * 24 * 60 * 60 * 1000)
  const fourWeeksAgoStart = new Date(week.start.getTime() - 4 * 7 * 24 * 60 * 60 * 1000)

  const [
    thisWeekRollups,
    prevWeekRollups,
    taskSampleSessionIds,
    forgottenSkills,
    conciseLeaderCandidates,
  ] = await Promise.all([
    getDailyRollupsForProjects(projectIds, week.start, week.end),
    getDailyRollupsForProjects(projectIds, prevWeekStart, prevWeekEnd),
    queryTaskDelegationSampleSessionIds(projectIds, week.start, week.end),
    queryForgottenSkills(projectIds, fourWeeksAgoStart, week.start, week.end),
    queryConciseSessionLeaders(projectIds, week.start, week.end),
  ])

  const summary = aggregateSummary(thisWeekRollups, 10)
  const prevSummary = aggregateSummary(prevWeekRollups, 10)

  const kpis: WeeklyKpis = {
    sessionCount: summary.sessionCount,
    turnCount: summary.turnCount,
    activeUserCount: summary.activeUserCount,
    totalTokens: totalTokensFromRollups(thisWeekRollups),
    wow: {
      sessions: percentDelta(summary.sessionCount, prevSummary.sessionCount),
      turns: percentDelta(summary.turnCount, prevSummary.turnCount),
      activeUsers: percentDelta(summary.activeUserCount, prevSummary.activeUserCount),
      tokens: percentDelta(
        totalTokensFromRollups(thisWeekRollups),
        totalTokensFromRollups(prevWeekRollups),
      ),
    },
  }

  const userStats = aggregateUserStats(thisWeekRollups)
  const eligibleUsers = userStats.filter((u) => u.sessionCount >= 3)
  const eligibleUserIds = eligibleUsers.map((u) => u.userId)

  // #1 skill usage leader — from aggregated userStats
  const skillUsageCandidates = eligibleUsers.map((u) => ({
    userId: u.userId,
    userName: u.name,
    avatarUrl: u.avatarUrl,
    value: u.skillCalls,
  }))
  // #3 delegation (agentCalls)
  const delegationCandidates = eligibleUsers.map((u) => ({
    userId: u.userId,
    userName: u.name,
    avatarUrl: u.avatarUrl,
    value: u.agentCalls,
  }))
  // #5 session count
  const sessionCountCandidates = eligibleUsers.map((u) => ({
    userId: u.userId,
    userName: u.name,
    avatarUrl: u.avatarUrl,
    value: u.sessionCount,
  }))

  // #2 diversity, #6 tokens — separate queries, restricted to eligible
  const [diversityCandidates, tokenCandidates] = await Promise.all([
    queryTopSkillDiversityByUser(projectIds, week.start, week.end, eligibleUserIds),
    queryTopTokenUsageByUser(projectIds, week.start, week.end, eligibleUserIds),
  ])

  const topUsers: WeeklyTopUsers = {
    learnFrom: {
      skillUsage: pickLeader(skillUsageCandidates),
      skillDiversity: pickLeader(diversityCandidates),
      delegation: pickLeader(delegationCandidates),
      conciseSession: pickLeader(conciseLeaderCandidates, true),  // 오름차순 (적을수록 1등)
    },
    usageScale: {
      sessionCount: pickLeader(sessionCountCandidates),
      tokenUsage: pickLeader(tokenCandidates),
    },
    eligibleUserCount: eligibleUsers.length,
  }

  // Insights — delegation
  const totalAgentCalls = thisWeekRollups.reduce(
    (sum, r) => sum + Object.values(r.agentCounts).reduce((a, b) => a + b, 0),
    0,
  )
  const totalSkillCalls = thisWeekRollups.reduce(
    (sum, r) => sum + Object.values(r.skillCounts).reduce((a, b) => a + b, 0),
    0,
  )
  const distinctSkillsThisWeek = new Set<string>()
  for (const r of thisWeekRollups) {
    for (const k of Object.keys(r.skillCounts)) distinctSkillsThisWeek.add(k)
  }

  const insights: WeeklyInsights = {
    delegation: {
      taskCount: totalAgentCalls,
      topAgents: summary.topAgents.slice(0, 3),
      sampleSessionIds: taskSampleSessionIds,
    },
    skillAssets: {
      totalCalls: totalSkillCalls,
      distinctSkills: distinctSkillsThisWeek.size,
      forgottenSkills,
    },
  }

  const trendContext: WeeklyTrendContext = {
    thisWeekSeries: seriesFromRollups(thisWeekRollups),
    prevWeekSeries: seriesFromRollups(prevWeekRollups),
    topSkills: summary.topSkills.slice(0, 10),
    topAgents: summary.topAgents.slice(0, 10),
    modelShare: summary.modelShare,
  }

  const hasPrevWeekData = prevWeekRollups.length > 0 && prevSummary.sessionCount > 0
  const weekMeta = buildWeekMeta(week, !hasPrevWeekData)

  return {
    week: weekMeta,
    kpis,
    insights,
    topUsers,
    trendContext,
  }
}

