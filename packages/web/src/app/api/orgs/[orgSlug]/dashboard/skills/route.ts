import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/server/db'
import { requireAuth } from '@/lib/server/auth-helper'
import { handleRouteError } from '@/lib/server/error-helper'
import { parseDateRange } from '@/lib/server/dashboard'
import {
  assertOrgAccessBySlugOrResponse,
  resolveOrgScopedProjectIds,
} from '@/lib/server/dashboard-route-helper'
import { mapSkillRow, type RawSkillRow } from '@/lib/server/dashboard-row-mapping'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/orgs/:orgSlug/dashboard/skills?from=&to=&projectId=
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const { userId } = auth
    const { orgSlug } = await params

    const access = await assertOrgAccessBySlugOrResponse(orgSlug, userId)
    if (access instanceof NextResponse) return access

    const projectIdParam = req.nextUrl.searchParams.get('projectId')
    const projectIds = await resolveOrgScopedProjectIds(access.org.id, userId, access.role, projectIdParam)
    if (projectIds instanceof NextResponse) return projectIds

    const fromQuery = req.nextUrl.searchParams.get('from') ?? undefined
    const toQuery = req.nextUrl.searchParams.get('to') ?? undefined
    const { from, to } = parseDateRange(fromQuery, toQuery)

    if (projectIds.length === 0) {
      return NextResponse.json({ skills: [] })
    }

    const skills = await db.$queryRaw<RawSkillRow[]>`
      WITH event_skill_calls AS (
        SELECT
          skill_name,
          session_id,
          user_id,
          timestamp
        FROM events
        WHERE is_skill_call = true
          AND project_id = ANY(${projectIds}::text[])
          AND skill_name IS NOT NULL
          AND timestamp >= ${from}
          AND timestamp <= ${to}
      ),
      message_slash_calls AS (
        SELECT
          slash_match.match[1] AS skill_name,
          m.session_id,
          s.user_id,
          m.timestamp
        FROM messages m
        JOIN claude_sessions s ON s.id = m.session_id
        CROSS JOIN LATERAL regexp_matches(
          m.content,
          '<command-message>[^<]*</command-message>[[:space:]]*<command-name>/?([^<[:space:]]+)</command-name>',
          'g'
        ) AS slash_match(match)
        WHERE m.role = 'HUMAN'
          AND s.project_id = ANY(${projectIds}::text[])
          AND m.timestamp >= ${from}
          AND m.timestamp <= ${to}
          AND NOT EXISTS (
            SELECT 1
            FROM events e
            WHERE e.session_id = m.session_id
              AND e.is_skill_call = true
              AND e.is_slash_command = true
              AND e.skill_name = slash_match.match[1]
          )
      ),
      skill_events AS (
        SELECT
          skill_name,
          COUNT(*)                   AS call_count,
          COUNT(DISTINCT session_id) AS session_count,
          COUNT(DISTINCT user_id)    AS user_count,
          MAX(timestamp)             AS last_used_at
        FROM (
          SELECT * FROM event_skill_calls
          UNION ALL
          SELECT * FROM message_slash_calls
        ) all_skill_calls
        GROUP BY skill_name
      ),
      skill_durations AS (
        SELECT
          m.tool_input->>'skill'                                        AS skill_name,
          COUNT(m.duration_ms)                                          AS duration_sample_count,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY m.duration_ms)   AS median_duration_ms
        FROM messages m
        JOIN claude_sessions s ON s.id = m.session_id
        WHERE m.tool_name = 'Skill'
          AND s.project_id = ANY(${projectIds}::text[])
          AND m.role = 'TOOL'
          AND m.duration_ms IS NOT NULL
          AND m.timestamp >= ${from}
          AND m.timestamp <= ${to}
        GROUP BY m.tool_input->>'skill'
      )
      SELECT
        e.skill_name,
        e.call_count,
        e.session_count,
        e.user_count,
        e.last_used_at,
        d.median_duration_ms,
        d.duration_sample_count
      FROM skill_events e
      LEFT JOIN skill_durations d USING (skill_name)
      ORDER BY e.call_count DESC
      LIMIT 50
    `

    return NextResponse.json({ skills: skills.map(mapSkillRow) })
  } catch (err) {
    return handleRouteError(err)
  }
}
