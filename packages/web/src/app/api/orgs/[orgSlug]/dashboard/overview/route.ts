import { NextRequest, NextResponse } from 'next/server'
import type { DashboardOverview, DashboardSummary, UsageSeries } from '@argos/shared'
import { requireAuth } from '@/lib/server/auth-helper'
import { handleRouteError } from '@/lib/server/error-helper'
import { parseDateRange } from '@/lib/server/dashboard'
import {
  assertOrgAccessBySlugOrResponse,
  resolveOrgScopedProjectIds,
} from '@/lib/server/dashboard-route-helper'
import {
  getDailyRollupsForProjects,
  aggregateSummary,
  aggregateUsageSeries,
} from '@/lib/server/daily-rollup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/orgs/:orgSlug/dashboard/overview?from=&to=&projectId=
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

    const rollups = await getDailyRollupsForProjects(projectIds, from, to)

    const agg = aggregateSummary(rollups, 5)
    const summary: DashboardSummary = {
      sessionCount: agg.sessionCount,
      turnCount: agg.turnCount,
      activeUserCount: agg.activeUserCount,
      totalInputTokens: agg.inputTokens,
      totalOutputTokens: agg.outputTokens,
      totalCacheReadTokens: agg.cacheReadTokens,
      totalCacheCreationTokens: agg.cacheCreationTokens,
      estimatedCostUsd: agg.estimatedCostUsd,
      topSkills: agg.topSkills,
      topAgents: agg.topAgents,
      modelShare: agg.modelShare,
    }

    const series: UsageSeries[] = aggregateUsageSeries(rollups)

    const body: DashboardOverview = { summary, usage: { series } }
    return NextResponse.json(body)
  } catch (err) {
    return handleRouteError(err)
  }
}
