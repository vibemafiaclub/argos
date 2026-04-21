import { NextRequest, NextResponse } from 'next/server'
import type { PaginatedResult, SessionItem } from '@argos/shared'
import { db } from '@/lib/server/db'
import { requireAuth } from '@/lib/server/auth-helper'
import { handleRouteError } from '@/lib/server/error-helper'
import { parseDateRange, parsePagination } from '@/lib/server/dashboard'
import { assertProjectAccessOrResponse } from '@/lib/server/dashboard-route-helper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/projects/:projectId/dashboard/sessions?page=&pageSize=&from=&to=
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

    const { page, pageSize, skip, take } = parsePagination(
      req.nextUrl.searchParams.get('page'),
      req.nextUrl.searchParams.get('pageSize'),
    )

    const where = {
      projectId,
      startedAt: { gte: from, lte: to },
    }

    const [sessions, total] = await Promise.all([
      db.claudeSession.findMany({
        where,
        include: {
          user: { select: { id: true, name: true } },
          usageRecords: {
            select: { inputTokens: true, outputTokens: true, estimatedCostUsd: true }
          },
          // Title fallback — 저장된 title이 없는 세션용으로 첫 HUMAN 메시지 1건만 로딩
          messages: {
            where: { role: 'HUMAN' },
            orderBy: [{ timestamp: 'asc' }, { sequence: 'asc' }],
            take: 1,
            select: { content: true }
          },
          _count: { select: { events: true } }
        },
        orderBy: { startedAt: 'desc' },
        skip,
        take,
      }),
      db.claudeSession.count({ where }),
    ])

    const items: SessionItem[] = sessions.map(s => {
      const totalInput = s.usageRecords.reduce((sum, r) => sum + r.inputTokens, 0)
      const totalOutput = s.usageRecords.reduce((sum, r) => sum + r.outputTokens, 0)
      const totalCost = s.usageRecords.reduce((sum, r) => sum + (r.estimatedCostUsd ?? 0), 0)
      const fallbackTitle = s.messages[0]?.content.slice(0, 200).trim() || null
      const title = s.title?.trim() || fallbackTitle

      return {
        id: s.id,
        userId: s.user.id,
        userName: s.user.name,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt?.toISOString() ?? null,
        inputTokens: totalInput,
        outputTokens: totalOutput,
        estimatedCostUsd: totalCost,
        eventCount: s._count.events,
        title,
      }
    })

    const body: PaginatedResult<SessionItem> = { items, total, page, pageSize }
    return NextResponse.json(body)
  } catch (err) {
    return handleRouteError(err)
  }
}
