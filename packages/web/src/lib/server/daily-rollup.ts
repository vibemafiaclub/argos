import { Prisma } from '@prisma/client'
import { db } from './db'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DailyRollup {
  date: string // YYYY-MM-DD (UTC day)
  sessionCount: number
  turnCount: number
  activeUserCount: number
  activeUserIds: string[]
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  estimatedCostUsd: number
  skillCounts: Record<string, number>
  agentCounts: Record<string, number>
  modelTokens: Record<string, number>
  userStats: DailyUserStat[]
}

export interface DailyUserStat {
  userId: string
  name: string
  avatarUrl: string | null
  sessionCount: number
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
  skillCalls: number
  agentCalls: number
}

// ─── Day boundary helpers ──────────────────────────────────────────────────

/** UTC 자정 시작 Date */
function utcDayStart(date: Date): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0, 0, 0, 0,
  ))
}

/** UTC 자정 끝 Date (다음날 시작 직전) */
function utcDayEnd(date: Date): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    23, 59, 59, 999,
  ))
}

/** YYYY-MM-DD (UTC) */
function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** 범위 내 모든 UTC 날짜 (start, end 포함) */
function enumerateUtcDates(from: Date, to: Date): Date[] {
  const days: Date[] = []
  const cur = utcDayStart(from)
  const end = utcDayStart(to)
  while (cur.getTime() <= end.getTime()) {
    days.push(new Date(cur))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return days
}

/** 현재 시점의 UTC 오늘 00:00 (캐시 경계) */
function utcTodayStart(): Date {
  return utcDayStart(new Date())
}

// ─── Today's live rollup in-memory cache (per-process) ─────────────────────
// 오늘 치는 DB 캐시 없이 매 요청 live 집계하므로 비싸다.
// 같은 프로세스 내에서 30초간 결과를 공유해 summary/usage/users가 중복 계산하지 않도록 한다.
// Vercel serverless는 인스턴스당 per-instance라 best-effort 성격.

const TODAY_ROLLUP_TTL_MS = 30_000
const todayRollupCache = new Map<string, { expiresAt: number; rollup: DailyRollup }>()

function todayCacheKey(projectId: string, dayStart: Date): string {
  return `${projectId}:${dayStart.toISOString()}`
}

async function computeDailyRollupCachedForToday(
  projectId: string,
  date: Date,
): Promise<DailyRollup> {
  const key = todayCacheKey(projectId, utcDayStart(date))
  const now = Date.now()
  const entry = todayRollupCache.get(key)
  if (entry && entry.expiresAt > now) {
    return entry.rollup
  }
  const rollup = await computeDailyRollup(projectId, date)
  todayRollupCache.set(key, { expiresAt: now + TODAY_ROLLUP_TTL_MS, rollup })
  return rollup
}

// ─── Core: compute one day's rollup from raw tables ────────────────────────

async function computeDailyRollup(projectId: string, date: Date): Promise<DailyRollup> {
  const from = utcDayStart(date)
  const to = utcDayEnd(date)

  const [
    sessionCount,
    turnCount,
    usageTotals,
    skillGroups,
    agentGroups,
    modelGroups,
    userStatsRaw,
    activeUserRows,
  ] = await Promise.all([
    db.claudeSession.count({
      where: { projectId, startedAt: { gte: from, lte: to } },
    }),
    db.event.count({
      where: {
        projectId,
        eventType: 'STOP',
        timestamp: { gte: from, lte: to },
      },
    }),
    db.$queryRaw<Array<{
      inputTokens: bigint | null
      outputTokens: bigint | null
      cacheReadTokens: bigint | null
      cacheCreationTokens: bigint | null
      estimatedCostUsd: number | null
    }>>`
      SELECT
        SUM(input_tokens)::bigint           AS "inputTokens",
        SUM(output_tokens)::bigint          AS "outputTokens",
        SUM(cache_read_tokens)::bigint      AS "cacheReadTokens",
        SUM(cache_creation_tokens)::bigint  AS "cacheCreationTokens",
        COALESCE(SUM(estimated_cost_usd), 0) AS "estimatedCostUsd"
      FROM usage_records
      WHERE project_id = ${projectId}
        AND timestamp >= ${from}
        AND timestamp <= ${to}
    `,
    db.event.groupBy({
      by: ['skillName'],
      where: {
        projectId,
        isSkillCall: true,
        skillName: { not: null },
        timestamp: { gte: from, lte: to },
      },
      _count: { id: true },
    }),
    db.event.groupBy({
      by: ['agentType'],
      where: {
        projectId,
        isAgentCall: true,
        agentType: { not: null },
        timestamp: { gte: from, lte: to },
      },
      _count: { id: true },
    }),
    db.$queryRaw<Array<{ model: string | null; totalTokens: bigint | null }>>`
      SELECT
        model,
        SUM(input_tokens + output_tokens)::bigint AS "totalTokens"
      FROM usage_records
      WHERE project_id = ${projectId}
        AND timestamp >= ${from}
        AND timestamp <= ${to}
      GROUP BY model
    `,
    // user-level 집계는 각 테이블을 user_id로 먼저 GROUP BY한 뒤 LEFT JOIN한다.
    // 직접 JOIN하면 usage_records × sessions × events 만큼 cartesian fan-out이 일어나
    // SUM/COUNT가 곱셈으로 부풀려지고, 쿼리가 DB statement_timeout에 걸린다.
    db.$queryRaw<Array<{
      id: string
      name: string
      avatar_url: string | null
      session_count: bigint
      input_tokens: bigint | null
      output_tokens: bigint | null
      cost_usd: number | null
      skill_calls: bigint
      agent_calls: bigint
    }>>`
      WITH ur_agg AS (
        SELECT
          user_id,
          SUM(input_tokens)::bigint          AS input_tokens,
          SUM(output_tokens)::bigint         AS output_tokens,
          SUM(estimated_cost_usd)            AS cost_usd
        FROM usage_records
        WHERE project_id = ${projectId}
          AND timestamp >= ${from}
          AND timestamp <= ${to}
        GROUP BY user_id
      ),
      s_agg AS (
        SELECT
          user_id,
          COUNT(*)::bigint AS session_count
        FROM claude_sessions
        WHERE project_id = ${projectId}
          AND started_at >= ${from}
          AND started_at <= ${to}
        GROUP BY user_id
      ),
      e_agg AS (
        SELECT
          user_id,
          COUNT(*) FILTER (WHERE is_skill_call)::bigint AS skill_calls,
          COUNT(*) FILTER (WHERE is_agent_call)::bigint AS agent_calls
        FROM events
        WHERE project_id = ${projectId}
          AND timestamp >= ${from}
          AND timestamp <= ${to}
        GROUP BY user_id
      )
      SELECT
        u.id,
        u.name,
        u.avatar_url,
        COALESCE(s_agg.session_count, 0)::bigint AS session_count,
        ur_agg.input_tokens,
        ur_agg.output_tokens,
        ur_agg.cost_usd,
        COALESCE(e_agg.skill_calls, 0)::bigint   AS skill_calls,
        COALESCE(e_agg.agent_calls, 0)::bigint   AS agent_calls
      FROM users u
      LEFT JOIN ur_agg ON ur_agg.user_id = u.id
      LEFT JOIN s_agg  ON s_agg.user_id  = u.id
      LEFT JOIN e_agg  ON e_agg.user_id  = u.id
      WHERE ur_agg.user_id IS NOT NULL
         OR s_agg.user_id  IS NOT NULL
    `,
    db.$queryRaw<Array<{ user_id: string }>>`
      SELECT DISTINCT user_id FROM usage_records
      WHERE project_id = ${projectId}
        AND timestamp >= ${from}
        AND timestamp <= ${to}
    `,
  ])

  const totals = usageTotals[0]
  const activeUserIds = activeUserRows.map(r => r.user_id)

  const skillCounts: Record<string, number> = {}
  for (const row of skillGroups) {
    if (row.skillName) skillCounts[row.skillName] = row._count.id
  }

  const agentCounts: Record<string, number> = {}
  for (const row of agentGroups) {
    if (row.agentType) agentCounts[row.agentType] = row._count.id
  }

  const modelTokens: Record<string, number> = {}
  for (const row of modelGroups) {
    if (row.model) modelTokens[row.model] = Number(row.totalTokens ?? 0)
  }

  const userStats: DailyUserStat[] = userStatsRaw.map(u => ({
    userId: u.id,
    name: u.name,
    avatarUrl: u.avatar_url,
    sessionCount: Number(u.session_count),
    inputTokens: Number(u.input_tokens ?? 0),
    outputTokens: Number(u.output_tokens ?? 0),
    estimatedCostUsd: Number(u.cost_usd ?? 0),
    skillCalls: Number(u.skill_calls),
    agentCalls: Number(u.agent_calls),
  }))

  return {
    date: toDateKey(date),
    sessionCount,
    turnCount,
    activeUserCount: activeUserIds.length,
    activeUserIds,
    inputTokens: Number(totals?.inputTokens ?? 0),
    outputTokens: Number(totals?.outputTokens ?? 0),
    cacheReadTokens: Number(totals?.cacheReadTokens ?? 0),
    cacheCreationTokens: Number(totals?.cacheCreationTokens ?? 0),
    estimatedCostUsd: Number(totals?.estimatedCostUsd ?? 0),
    skillCounts,
    agentCounts,
    modelTokens,
    userStats,
  }
}

// ─── DB row ↔ in-memory DailyRollup ────────────────────────────────────────

function rowToRollup(row: {
  date: Date
  sessionCount: number
  turnCount: number
  activeUserCount: number
  activeUserIds: Prisma.JsonValue
  inputTokens: bigint
  outputTokens: bigint
  cacheReadTokens: bigint
  cacheCreationTokens: bigint
  estimatedCostUsd: number
  skillCounts: Prisma.JsonValue
  agentCounts: Prisma.JsonValue
  modelTokens: Prisma.JsonValue
  userStats: Prisma.JsonValue
}): DailyRollup {
  return {
    date: toDateKey(row.date),
    sessionCount: row.sessionCount,
    turnCount: row.turnCount,
    activeUserCount: row.activeUserCount,
    activeUserIds: Array.isArray(row.activeUserIds) ? (row.activeUserIds as string[]) : [],
    inputTokens: Number(row.inputTokens),
    outputTokens: Number(row.outputTokens),
    cacheReadTokens: Number(row.cacheReadTokens),
    cacheCreationTokens: Number(row.cacheCreationTokens),
    estimatedCostUsd: row.estimatedCostUsd,
    skillCounts: (row.skillCounts as Record<string, number>) ?? {},
    agentCounts: (row.agentCounts as Record<string, number>) ?? {},
    modelTokens: (row.modelTokens as Record<string, number>) ?? {},
    userStats: (row.userStats as unknown as DailyUserStat[]) ?? [],
  }
}

async function upsertRollup(projectId: string, date: Date, rollup: DailyRollup): Promise<void> {
  const dayStart = utcDayStart(date)
  const data = {
    sessionCount: rollup.sessionCount,
    turnCount: rollup.turnCount,
    activeUserCount: rollup.activeUserCount,
    activeUserIds: rollup.activeUserIds as Prisma.InputJsonValue,
    inputTokens: BigInt(rollup.inputTokens),
    outputTokens: BigInt(rollup.outputTokens),
    cacheReadTokens: BigInt(rollup.cacheReadTokens),
    cacheCreationTokens: BigInt(rollup.cacheCreationTokens),
    estimatedCostUsd: rollup.estimatedCostUsd,
    skillCounts: rollup.skillCounts as Prisma.InputJsonValue,
    agentCounts: rollup.agentCounts as Prisma.InputJsonValue,
    modelTokens: rollup.modelTokens as Prisma.InputJsonValue,
    userStats: rollup.userStats as unknown as Prisma.InputJsonValue,
    computedAt: new Date(),
  }
  await db.dailyProjectStat.upsert({
    where: { projectId_date: { projectId, date: dayStart } },
    create: { projectId, date: dayStart, ...data },
    update: data,
  })
}

// ─── Public: ensure rollups exist for [from, to], return daily rollups ─────

/**
 * 주어진 project 리스트에 대해 각자 [from, to] 의 rollup을 계산하고
 * 날짜 단위로 병합해 하나의 `DailyRollup[]` 으로 반환한다.
 *
 * 병합 규칙:
 * - scalar 지표: 합산
 * - activeUserIds/*Counts/modelTokens/userStats: 합집합/합산
 *
 * projectId 전체가 org 에 속하는 경우 orgAccessor 에서 미리 필터링되어 있다고 가정한다.
 */
export async function getDailyRollupsForProjects(
  projectIds: string[],
  from: Date,
  to: Date,
): Promise<DailyRollup[]> {
  if (projectIds.length === 0) return []

  const perProject = await Promise.all(
    projectIds.map((pid) => getDailyRollups(pid, from, to)),
  )

  // date-key 기준으로 병합
  const byDate = new Map<string, DailyRollup>()
  for (const rollups of perProject) {
    for (const r of rollups) {
      const prev = byDate.get(r.date)
      if (!prev) {
        byDate.set(r.date, {
          date: r.date,
          sessionCount: r.sessionCount,
          turnCount: r.turnCount,
          activeUserCount: 0, // 나중에 union 크기로 재계산
          activeUserIds: [...r.activeUserIds],
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          cacheReadTokens: r.cacheReadTokens,
          cacheCreationTokens: r.cacheCreationTokens,
          estimatedCostUsd: r.estimatedCostUsd,
          skillCounts: { ...r.skillCounts },
          agentCounts: { ...r.agentCounts },
          modelTokens: { ...r.modelTokens },
          userStats: r.userStats.map((u) => ({ ...u })),
        })
      } else {
        prev.sessionCount += r.sessionCount
        prev.turnCount += r.turnCount
        prev.inputTokens += r.inputTokens
        prev.outputTokens += r.outputTokens
        prev.cacheReadTokens += r.cacheReadTokens
        prev.cacheCreationTokens += r.cacheCreationTokens
        prev.estimatedCostUsd += r.estimatedCostUsd
        // activeUserIds: 합집합
        const userSet = new Set(prev.activeUserIds)
        for (const u of r.activeUserIds) userSet.add(u)
        prev.activeUserIds = Array.from(userSet)
        for (const [k, v] of Object.entries(r.skillCounts)) {
          prev.skillCounts[k] = (prev.skillCounts[k] ?? 0) + v
        }
        for (const [k, v] of Object.entries(r.agentCounts)) {
          prev.agentCounts[k] = (prev.agentCounts[k] ?? 0) + v
        }
        for (const [k, v] of Object.entries(r.modelTokens)) {
          prev.modelTokens[k] = (prev.modelTokens[k] ?? 0) + v
        }
        // userStats: userId 기준 sum
        const userMap = new Map(prev.userStats.map((u) => [u.userId, u]))
        for (const u of r.userStats) {
          const prevU = userMap.get(u.userId)
          if (!prevU) {
            userMap.set(u.userId, { ...u })
          } else {
            prevU.sessionCount += u.sessionCount
            prevU.inputTokens += u.inputTokens
            prevU.outputTokens += u.outputTokens
            prevU.estimatedCostUsd += u.estimatedCostUsd
            prevU.skillCalls += u.skillCalls
            prevU.agentCalls += u.agentCalls
          }
        }
        prev.userStats = Array.from(userMap.values())
      }
    }
  }

  // activeUserCount 재계산
  for (const r of byDate.values()) {
    r.activeUserCount = r.activeUserIds.length
  }

  const result = Array.from(byDate.values())
  result.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return result
}

/**
 * [from, to] 범위에 대해 일별 rollup을 반환한다.
 * - 과거 완결된 UTC 날짜: DB 캐시에서 읽고, 없으면 계산 후 upsert
 * - 오늘(UTC 기준): 캐시하지 않고 live 계산
 * 반환 배열은 date 오름차순.
 */
export async function getDailyRollups(
  projectId: string,
  from: Date,
  to: Date,
): Promise<DailyRollup[]> {
  const today = utcTodayStart()

  // 캐시 대상: [from, min(to, today-1ms)]
  const cacheUpperBound = to.getTime() < today.getTime()
    ? utcDayStart(to)
    : new Date(today.getTime() - 1)

  const cachedResults: Map<string, DailyRollup> = new Map()

  if (cacheUpperBound.getTime() >= utcDayStart(from).getTime()) {
    const fromDay = utcDayStart(from)
    const toDay = utcDayStart(cacheUpperBound)

    const existing = await db.dailyProjectStat.findMany({
      where: {
        projectId,
        date: { gte: fromDay, lte: toDay },
      },
    })

    for (const row of existing) {
      const rollup = rowToRollup(row)
      cachedResults.set(rollup.date, rollup)
    }

    const allDays = enumerateUtcDates(fromDay, toDay)
    const missingDays = allDays.filter(d => !cachedResults.has(toDateKey(d)))

    // 날짜 병렬도 4로 cold rollup 계산. 하루당 내부 쿼리 8개 × 4 = 최대 32 concurrent.
    // 서로 다른 (projectId, date) primary key이므로 upsert 간 충돌은 없다.
    const DAY_CONCURRENCY = 4
    for (let i = 0; i < missingDays.length; i += DAY_CONCURRENCY) {
      const batch = missingDays.slice(i, i + DAY_CONCURRENCY)
      const computedBatch = await Promise.all(
        batch.map(async (day) => {
          const computed = await computeDailyRollup(projectId, day)
          await upsertRollup(projectId, day, computed)
          return computed
        }),
      )
      for (const computed of computedBatch) {
        cachedResults.set(computed.date, computed)
      }
    }
  }

  // 오늘(또는 to가 오늘) → live 계산 (DB 캐시 없음, 30초 메모리 캐시만)
  let liveToday: DailyRollup | null = null
  if (to.getTime() >= today.getTime()) {
    liveToday = await computeDailyRollupCachedForToday(projectId, today)
  }

  const result: DailyRollup[] = []
  for (const [, r] of cachedResults) result.push(r)
  if (liveToday) result.push(liveToday)
  result.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return result
}

// ─── Aggregation helpers for endpoints ─────────────────────────────────────

export interface AggregatedSummary {
  sessionCount: number
  turnCount: number
  activeUserCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  estimatedCostUsd: number
  topSkills: Array<{ skillName: string; callCount: number }>
  topAgents: Array<{ agentType: string; callCount: number }>
  modelShare: Array<{ model: string; totalTokens: number }>
}

export function aggregateSummary(rollups: DailyRollup[], topN = 5): AggregatedSummary {
  const totals = {
    sessionCount: 0,
    turnCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    estimatedCostUsd: 0,
  }
  const skillCounts: Record<string, number> = {}
  const agentCounts: Record<string, number> = {}
  const modelTokens: Record<string, number> = {}
  const activeUsers = new Set<string>()

  for (const r of rollups) {
    totals.sessionCount += r.sessionCount
    totals.turnCount += r.turnCount
    totals.inputTokens += r.inputTokens
    totals.outputTokens += r.outputTokens
    totals.cacheReadTokens += r.cacheReadTokens
    totals.cacheCreationTokens += r.cacheCreationTokens
    totals.estimatedCostUsd += r.estimatedCostUsd
    for (const u of r.activeUserIds) activeUsers.add(u)
    for (const [k, v] of Object.entries(r.skillCounts)) skillCounts[k] = (skillCounts[k] ?? 0) + v
    for (const [k, v] of Object.entries(r.agentCounts)) agentCounts[k] = (agentCounts[k] ?? 0) + v
    for (const [k, v] of Object.entries(r.modelTokens)) modelTokens[k] = (modelTokens[k] ?? 0) + v
  }

  const topSkills = Object.entries(skillCounts)
    .map(([skillName, callCount]) => ({ skillName, callCount }))
    .sort((a, b) => b.callCount - a.callCount)
    .slice(0, topN)

  const topAgents = Object.entries(agentCounts)
    .map(([agentType, callCount]) => ({ agentType, callCount }))
    .sort((a, b) => b.callCount - a.callCount)
    .slice(0, topN)

  const modelShare = Object.entries(modelTokens)
    .filter(([, v]) => v > 0)
    .map(([model, totalTokens]) => ({ model, totalTokens }))
    .sort((a, b) => b.totalTokens - a.totalTokens)

  return {
    ...totals,
    activeUserCount: activeUsers.size,
    topSkills,
    topAgents,
    modelShare,
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

export function aggregateUsageSeries(rollups: DailyRollup[]): DailySeriesPoint[] {
  return rollups.map(r => ({
    date: r.date,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    cacheReadTokens: r.cacheReadTokens,
    cacheCreationTokens: r.cacheCreationTokens,
    estimatedCostUsd: r.estimatedCostUsd,
  }))
}

export interface AggregatedUser {
  userId: string
  name: string
  avatarUrl: string | null
  sessionCount: number
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
  skillCalls: number
  agentCalls: number
}

/**
 * 여러 날짜의 userStats를 userId로 union/sum한다.
 * activeUsers set과는 별개로, userStats row가 있는 사용자만 포함한다.
 * (=실제로 해당 기간에 usage/session/event이 있는 사용자)
 */
export function aggregateUserStats(rollups: DailyRollup[]): AggregatedUser[] {
  const map = new Map<string, AggregatedUser>()
  for (const r of rollups) {
    for (const u of r.userStats) {
      const prev = map.get(u.userId)
      if (!prev) {
        map.set(u.userId, { ...u })
      } else {
        prev.sessionCount += u.sessionCount
        prev.inputTokens += u.inputTokens
        prev.outputTokens += u.outputTokens
        prev.estimatedCostUsd += u.estimatedCostUsd
        prev.skillCalls += u.skillCalls
        prev.agentCalls += u.agentCalls
      }
    }
  }
  return Array.from(map.values())
}
