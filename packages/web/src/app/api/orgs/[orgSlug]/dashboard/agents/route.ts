import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/server/db'
import { requireAuth } from '@/lib/server/auth-helper'
import { handleRouteError } from '@/lib/server/error-helper'
import { parseDateRange } from '@/lib/server/dashboard'
import {
  assertOrgAccessBySlugOrResponse,
  resolveOrgScopedProjectIds,
} from '@/lib/server/dashboard-route-helper'
import { mapAgentRow, type RawAgentRow } from '@/lib/server/dashboard-row-mapping'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/orgs/:orgSlug/dashboard/agents?from=&to=&projectId=
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
      return NextResponse.json({ agents: [] })
    }

    const agents = await db.$queryRaw<RawAgentRow[]>`
      WITH agent_counts AS (
        SELECT
          agent_type,
          COUNT(*)                   AS call_count,
          COUNT(DISTINCT session_id) AS session_count,
          COUNT(DISTINCT user_id)    AS user_count,
          MAX(timestamp)             AS last_used_at
        FROM events
        WHERE is_agent_call = true
          AND project_id = ANY(${projectIds}::text[])
          AND agent_type IS NOT NULL
          AND timestamp >= ${from}
          AND timestamp <= ${to}
        GROUP BY agent_type
      ),
      agent_samples AS (
        SELECT DISTINCT ON (agent_type)
          agent_type,
          agent_desc
        FROM events
        WHERE is_agent_call = true
          AND project_id = ANY(${projectIds}::text[])
          AND agent_type IS NOT NULL
          AND timestamp >= ${from}
          AND timestamp <= ${to}
        ORDER BY agent_type, timestamp DESC
      ),
      agent_durations AS (
        SELECT
          m.tool_input->>'subagent_type'                                AS agent_type,
          COUNT(m.duration_ms)                                          AS duration_sample_count,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY m.duration_ms)   AS median_duration_ms
        FROM messages m
        JOIN claude_sessions s ON s.id = m.session_id
        WHERE m.tool_name IN ('Agent', 'Task')
          AND s.project_id = ANY(${projectIds}::text[])
          AND m.role = 'TOOL'
          AND m.duration_ms IS NOT NULL
          AND m.tool_input->>'subagent_type' IS NOT NULL
          AND m.timestamp >= ${from}
          AND m.timestamp <= ${to}
        GROUP BY m.tool_input->>'subagent_type'
      )
      SELECT
        ac.agent_type,
        ac.call_count,
        ac.session_count,
        ac.user_count,
        ac.last_used_at,
        ags.agent_desc AS sample_desc,
        ad.median_duration_ms,
        ad.duration_sample_count
      FROM agent_counts ac
      LEFT JOIN agent_samples ags ON ags.agent_type = ac.agent_type
      LEFT JOIN agent_durations ad ON ad.agent_type = ac.agent_type
      ORDER BY ac.call_count DESC
      LIMIT 50
    `

    return NextResponse.json({ agents: agents.map(mapAgentRow) })
  } catch (err) {
    return handleRouteError(err)
  }
}
