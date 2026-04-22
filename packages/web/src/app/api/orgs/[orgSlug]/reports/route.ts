import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/auth-helper'
import { handleRouteError } from '@/lib/server/error-helper'
import {
  assertOrgAccessBySlugOrResponse,
  resolveOrgScopedProjectIds,
} from '@/lib/server/dashboard-route-helper'
import {
  getWeeklyReport,
  getDefaultWeekRange,
  parseWeekParam,
} from '@/lib/server/weekly-report'
import type { WeeklyReport } from '@/types/reports'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/orgs/:orgSlug/reports?week=YYYY-Www&projectId=...
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const { userId } = auth
    const { orgSlug } = await params

    const access = await assertOrgAccessBySlugOrResponse(orgSlug, userId)
    if (access instanceof NextResponse) return access

    // VIEWER는 개인 식별자 접근 불가 — 리포트는 사용자 이름 랭킹 노출
    if (access.role === 'VIEWER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const projectIdParam = req.nextUrl.searchParams.get('projectId')
    const projectIds = await resolveOrgScopedProjectIds(access.org.id, projectIdParam)
    if (projectIds instanceof NextResponse) return projectIds

    const weekParam = req.nextUrl.searchParams.get('week')
    const weekRange = weekParam ? parseWeekParam(weekParam) : getDefaultWeekRange()
    if (!weekRange) {
      return NextResponse.json(
        { error: { code: 'INVALID_WEEK', message: 'week must be in YYYY-Www format' } },
        { status: 400 },
      )
    }

    const report: WeeklyReport = await getWeeklyReport(projectIds, weekRange)
    return NextResponse.json(report)
  } catch (err) {
    return handleRouteError(err)
  }
}
