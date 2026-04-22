import { NextRequest, NextResponse } from 'next/server'
import type { SkillStat } from '@argos/shared'
import { db } from '@/lib/server/db'
import { requireAuth } from '@/lib/server/auth-helper'
import { handleRouteError } from '@/lib/server/error-helper'
import { parseDateRange } from '@/lib/server/dashboard'
import {
  assertOrgAccessBySlugOrResponse,
  resolveOrgScopedProjectIds,
} from '@/lib/server/dashboard-route-helper'

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
    const projectIds = await resolveOrgScopedProjectIds(access.org.id, projectIdParam)
    if (projectIds instanceof NextResponse) return projectIds

    const fromQuery = req.nextUrl.searchParams.get('from') ?? undefined
    const toQuery = req.nextUrl.searchParams.get('to') ?? undefined
    const { from, to } = parseDateRange(fromQuery, toQuery)

    if (projectIds.length === 0) {
      return NextResponse.json({ skills: [] })
    }

    const skills = await db.$queryRaw<Array<{
      skill_name: string
      call_count: bigint
      session_count: bigint
      last_used_at: Date
    }>>`
      SELECT
        skill_name,
        COUNT(*) AS call_count,
        COUNT(DISTINCT session_id) AS session_count,
        MAX(timestamp) AS last_used_at
      FROM events
      WHERE project_id = ANY(${projectIds}::text[])
        AND is_skill_call = true
        AND skill_name IS NOT NULL
        AND timestamp >= ${from}
        AND timestamp <= ${to}
      GROUP BY skill_name
      ORDER BY call_count DESC
      LIMIT 50
    `

    const skillStats: SkillStat[] = skills.map((s) => ({
      skillName: s.skill_name,
      callCount: Number(s.call_count),
      sessionCount: Number(s.session_count),
      lastUsedAt: s.last_used_at.toISOString(),
    }))

    return NextResponse.json({ skills: skillStats })
  } catch (err) {
    return handleRouteError(err)
  }
}
