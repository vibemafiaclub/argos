/**
 * skill-aggregation.ts
 *
 * skills route 와 daily-rollup 의 단일 출처.
 *
 * Layer 1 — skillCallRowsRelation: events (is_skill_call=true) UNION ALL
 * messages slash commands (anti-join으로 events 중복 제거) 의 row-level relation
 * expression 을 Prisma.Sql 로 반환한다. caller 가
 * `WITH skill_call_rows AS (${skillCallRowsRelation(...)}) SELECT ...` 로 감싸 사용.
 *
 * Layer 2 — aggregateSkillCountsForRange: rollup builder 용 thin wrapper.
 * Layer 1 relation 을 임베드해 GROUP BY 집계 후 { skillName, callCount } 배열 반환.
 */

import { Prisma } from '@prisma/client'
import { db } from './db'

// ─── Layer 1 ─────────────────────────────────────────────────────────────────

/**
 * `(SELECT skill_name, session_id, user_id, timestamp, source FROM ...)
 *  UNION ALL
 *  (SELECT skill_name, session_id, user_id, timestamp, source FROM ...)`
 * 형태의 relation expression 을 반환한다. CTE definition 이 아니라 SELECT 결과 자체.
 *
 * caller 사용 예:
 * ```ts
 * const rel = skillCallRowsRelation(projectIds, from, toExclusive)
 * const rows = await db.$queryRaw`
 *   WITH skill_call_rows AS (${rel})
 *   SELECT skill_name, COUNT(*) FROM skill_call_rows GROUP BY skill_name
 * `
 * ```
 *
 * 컬럼:
 * - skill_name TEXT
 * - session_id TEXT
 * - user_id TEXT
 * - timestamp TIMESTAMPTZ
 * - source TEXT  ('event' | 'message_slash')
 *
 * 시간 경계: timestamp >= fromInclusive AND timestamp < toExclusive (half-open).
 *
 * skills route 와 daily-rollup 의 단일 출처.
 */
export function skillCallRowsRelation(
  projectIds: string[],
  fromInclusive: Date,
  toExclusive: Date,
): Prisma.Sql {
  return Prisma.sql`
    SELECT
      skill_name,
      session_id,
      user_id,
      timestamp,
      'event'::text AS source
    FROM events
    WHERE is_skill_call = true
      AND project_id = ANY(${projectIds}::text[])
      AND skill_name IS NOT NULL
      AND timestamp >= ${fromInclusive}
      AND timestamp < ${toExclusive}

    UNION ALL

    SELECT
      slash_match.match[1] AS skill_name,
      m.session_id,
      s.user_id,
      m.timestamp,
      'message_slash'::text AS source
    FROM messages m
    JOIN claude_sessions s ON s.id = m.session_id
    CROSS JOIN LATERAL regexp_matches(
      m.content,
      '<command-message>[^<]*</command-message>[[:space:]]*<command-name>/?([^<[:space:]]+)</command-name>',
      'g'
    ) AS slash_match(match)
    WHERE m.role = 'HUMAN'
      AND s.project_id = ANY(${projectIds}::text[])
      AND m.timestamp >= ${fromInclusive}
      AND m.timestamp < ${toExclusive}
      AND NOT EXISTS (
        SELECT 1
        FROM events e
        WHERE e.session_id = m.session_id
          AND e.is_skill_call = true
          AND e.is_slash_command = true
          AND e.skill_name = slash_match.match[1]
      )
  `
}

// ─── Layer 2 ─────────────────────────────────────────────────────────────────

/**
 * Layer 1 relation 을 임베드해 skill 별 callCount 집계를 반환한다.
 *
 * rollup builder (`computeDailyRollup`) 용 thin wrapper.
 * 반환 순서는 보장하지 않는다 (caller 가 직접 정렬).
 *
 * 빈 projectIds → DB 호출 없이 빈 배열 early return.
 *
 * skills route 와 daily-rollup 의 단일 출처.
 */
export async function aggregateSkillCountsForRange(
  projectIds: string[],
  fromInclusive: Date,
  toExclusive: Date,
): Promise<Array<{ skillName: string; callCount: number }>> {
  if (projectIds.length === 0) {
    return []
  }

  const rel = skillCallRowsRelation(projectIds, fromInclusive, toExclusive)

  const rows = await db.$queryRaw<Array<{ skill_name: string; call_count: bigint }>>`
    WITH skill_call_rows AS (${rel})
    SELECT skill_name, COUNT(*)::bigint AS call_count
    FROM skill_call_rows
    GROUP BY skill_name
  `

  return rows.map((row) => ({
    skillName: row.skill_name,
    callCount: Number(row.call_count),
  }))
}
