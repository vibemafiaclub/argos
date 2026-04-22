import { NextRequest, NextResponse } from 'next/server'
import type { PaginatedResult, SessionItem } from '@argos/shared'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/server/db'
import { requireAuth } from '@/lib/server/auth-helper'
import { handleRouteError } from '@/lib/server/error-helper'
import { parseDateRange, parsePagination } from '@/lib/server/dashboard'
import {
  assertOrgAccessBySlugOrResponse,
  resolveOrgScopedProjectIds,
} from '@/lib/server/dashboard-route-helper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const sessionInclude = {
  user: { select: { id: true, name: true } },
  project: { select: { id: true, slug: true, name: true } },
  usageRecords: {
    select: { inputTokens: true, outputTokens: true, estimatedCostUsd: true },
  },
  // Title fallback — 저장된 title이 없는 세션용으로 첫 HUMAN 메시지 1건만 로딩
  messages: {
    where: { role: 'HUMAN' as const },
    orderBy: [{ timestamp: 'asc' as const }, { sequence: 'asc' as const }],
    take: 1,
    select: { content: true },
  },
  _count: { select: { events: true } },
} satisfies Prisma.ClaudeSessionInclude

type SessionWithInclude = Prisma.ClaudeSessionGetPayload<{ include: typeof sessionInclude }>

// GET /api/orgs/:orgSlug/dashboard/sessions?from=&to=&projectId=&page=&pageSize=&sort=recent|cost
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

    const { page, pageSize, skip, take } = parsePagination(
      req.nextUrl.searchParams.get('page'),
      req.nextUrl.searchParams.get('pageSize'),
    )

    const sortBy: 'cost' | 'recent' =
      req.nextUrl.searchParams.get('sort') === 'cost' ? 'cost' : 'recent'

    // projectIds 가 비었으면 (org 에 project 가 하나도 없음) 즉시 빈 결과 반환
    if (projectIds.length === 0) {
      const body: PaginatedResult<SessionItem> = { items: [], total: 0, page, pageSize }
      return NextResponse.json(body)
    }

    const where = {
      projectId: { in: projectIds },
      startedAt: { gte: from, lte: to },
    }

    let sessions: SessionWithInclude[]
    let total: number

    if (sortBy === 'cost') {
      // 1) SUM(estimated_cost_usd) 기준으로 해당 페이지의 session id만 먼저 뽑는다.
      //    tie-breaker: started_at desc → id asc 로 페이지 경계를 안정화.
      const [rankedRows, countResult] = await Promise.all([
        db.$queryRaw<Array<{ id: string }>>`
          SELECT cs.id
          FROM claude_sessions cs
          LEFT JOIN usage_records ur ON ur.session_id = cs.id
          WHERE cs.project_id = ANY(${projectIds}::text[])
            AND cs.started_at >= ${from}
            AND cs.started_at <= ${to}
          GROUP BY cs.id, cs.started_at
          ORDER BY COALESCE(SUM(ur.estimated_cost_usd), 0) DESC,
                   cs.started_at DESC,
                   cs.id ASC
          LIMIT ${take} OFFSET ${skip}
        `,
        db.claudeSession.count({ where }),
      ])
      total = countResult

      const ids = rankedRows.map((r) => r.id)
      if (ids.length === 0) {
        sessions = []
      } else {
        // 2) 해당 id들만 기존 include 구조로 하이드레이션 후 rank 순서 복원.
        const rows = await db.claudeSession.findMany({
          where: { id: { in: ids } },
          include: sessionInclude,
        })
        const byId = new Map(rows.map((s) => [s.id, s]))
        sessions = ids
          .map((id) => byId.get(id))
          .filter((s): s is SessionWithInclude => !!s)
      }
    } else {
      const [rows, countResult] = await Promise.all([
        db.claudeSession.findMany({
          where,
          include: sessionInclude,
          orderBy: { startedAt: 'desc' },
          skip,
          take,
        }),
        db.claudeSession.count({ where }),
      ])
      sessions = rows
      total = countResult
    }

    const items: SessionItem[] = sessions.map((s) => {
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
        project: {
          id: s.project.id,
          slug: s.project.slug,
          name: s.project.name,
        },
      }
    })

    const body: PaginatedResult<SessionItem> = { items, total, page, pageSize }
    return NextResponse.json(body)
  } catch (err) {
    return handleRouteError(err)
  }
}
