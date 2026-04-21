import { NextRequest, NextResponse } from 'next/server'
import type { UsageSeries } from '@argos/shared'
import { requireAuth } from '@/lib/server/auth-helper'
import { handleRouteError } from '@/lib/server/error-helper'
import { parseDateRange } from '@/lib/server/dashboard'
import { assertProjectAccessOrResponse } from '@/lib/server/dashboard-route-helper'
import { getDailyRollups, aggregateUsageSeries } from '@/lib/server/daily-rollup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/projects/:projectId/dashboard/usage
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const { userId } = auth
    const { projectId } = await params

    const access = await assertProjectAccessOrResponse(projectId, userId)
    if (access instanceof NextResponse) return access

    const fromQuery = req.nextUrl.searchParams.get('from') ?? undefined
    const toQuery = req.nextUrl.searchParams.get('to') ?? undefined
    const { from, to } = parseDateRange(fromQuery, toQuery)

    const rollups = await getDailyRollups(projectId, from, to)
    const series: UsageSeries[] = aggregateUsageSeries(rollups)

    // 비어있는 rollup(토큰 0)은 프런트에서 빈 bar로 표시할 필요가 있으면 유지,
    // 없애고 싶으면 여기서 filter하면 됨. 기본값은 모두 포함.
    return NextResponse.json({ series })
  } catch (err) {
    return handleRouteError(err)
  }
}
