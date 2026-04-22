import { NextRequest, NextResponse } from 'next/server'
import type { PaginatedResult, UserStat } from '@argos/shared'
import { db } from '@/lib/server/db'
import { requireAuth } from '@/lib/server/auth-helper'
import { handleRouteError } from '@/lib/server/error-helper'
import { parseDateRange, parsePagination } from '@/lib/server/dashboard'
import {
  assertOrgAccessBySlugOrResponse,
  resolveOrgScopedProjectIds,
} from '@/lib/server/dashboard-route-helper'
import {
  getDailyRollupsForProjects,
  aggregateUserStats,
} from '@/lib/server/daily-rollup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/orgs/:orgSlug/dashboard/users?from=&to=&projectId=&page=&pageSize=&sort=tokens|name
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
    const orgId = access.org.id

    const projectIdParam = req.nextUrl.searchParams.get('projectId')
    const projectIds = await resolveOrgScopedProjectIds(orgId, projectIdParam)
    if (projectIds instanceof NextResponse) return projectIds

    const fromQuery = req.nextUrl.searchParams.get('from') ?? undefined
    const toQuery = req.nextUrl.searchParams.get('to') ?? undefined
    const { from, to } = parseDateRange(fromQuery, toQuery)

    const { page, pageSize, skip, take } = parsePagination(
      req.nextUrl.searchParams.get('page'),
      req.nextUrl.searchParams.get('pageSize'),
    )

    const sortByTokens = req.nextUrl.searchParams.get('sort') === 'tokens'

    const [members, rollups] = await Promise.all([
      db.user.findMany({
        where: { memberships: { some: { orgId } } },
        select: { id: true, name: true, avatarUrl: true },
      }),
      getDailyRollupsForProjects(projectIds, from, to),
    ])

    // aggregateUserStats 가 여러 project 의 rollup 을 날짜별 병합 시 이미 userId
    // 단위로 합산해 두지만, 날짜 교차 병합 과정에서 한 번 더 dedupe/sum 한다.
    const aggregated = aggregateUserStats(rollups)
    const byId = new Map(aggregated.map((a) => [a.userId, a]))

    const allRows: UserStat[] = members.map((m) => {
      const a = byId.get(m.id)
      return {
        userId: m.id,
        name: m.name,
        avatarUrl: m.avatarUrl,
        sessionCount: a?.sessionCount ?? 0,
        inputTokens: a?.inputTokens ?? 0,
        outputTokens: a?.outputTokens ?? 0,
        estimatedCostUsd: a?.estimatedCostUsd ?? 0,
        skillCalls: a?.skillCalls ?? 0,
        agentCalls: a?.agentCalls ?? 0,
      }
    })

    if (sortByTokens) {
      allRows.sort((a, b) => {
        const at = a.inputTokens + a.outputTokens
        const bt = b.inputTokens + b.outputTokens
        if (bt !== at) return bt - at
        return a.name.localeCompare(b.name)
      })
    } else {
      allRows.sort((a, b) => a.name.localeCompare(b.name))
    }

    const total = allRows.length
    const items = allRows.slice(skip, skip + take)

    const body: PaginatedResult<UserStat> = { items, total, page, pageSize }
    return NextResponse.json(body)
  } catch (err) {
    return handleRouteError(err)
  }
}
