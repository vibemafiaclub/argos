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
import { canAccessIndividualData, forbiddenByRole } from '@/lib/server/rbac'

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

function getSessionTotals(session: SessionWithInclude) {
  return {
    inputTokens: session.usageRecords.reduce((sum, r) => sum + r.inputTokens, 0),
    outputTokens: session.usageRecords.reduce((sum, r) => sum + r.outputTokens, 0),
    estimatedCostUsd: session.usageRecords.reduce(
      (sum, r) => sum + (r.estimatedCostUsd ?? 0),
      0,
    ),
  }
}

function mapSessionItem(session: SessionWithInclude): SessionItem {
  const totals = getSessionTotals(session)
  const fallbackTitle = session.messages[0]?.content.slice(0, 200).trim() || null
  const title = session.title?.trim() || fallbackTitle

  return {
    id: session.id,
    userId: session.user.id,
    userName: session.user.name,
    agent: session.agent,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
    estimatedCostUsd: totals.estimatedCostUsd,
    eventCount: session._count.events,
    title,
    project: {
      id: session.project.id,
      slug: session.project.slug,
      name: session.project.name,
    },
  }
}

function csvField(value: string | number | null | undefined) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function buildSessionsCsv(sessions: SessionWithInclude[]) {
  const headers = [
    'Session ID',
    'User',
    'Project',
    'Title',
    'First Prompt',
    'Input Tokens',
    'Output Tokens',
    'Estimated Cost USD',
    'Event Count',
    'Started At',
    'Ended At',
  ]

  const rows = sessions.map((session) => {
    const totals = getSessionTotals(session)
    const title = session.title?.trim() || session.messages[0]?.content.slice(0, 200).trim() || ''

    return [
      session.id,
      session.user.name,
      session.project.name,
      title,
      session.messages[0]?.content ?? '',
      totals.inputTokens,
      totals.outputTokens,
      totals.estimatedCostUsd,
      session._count.events,
      session.startedAt.toISOString(),
      session.endedAt?.toISOString() ?? '',
    ].map(csvField).join(',')
  })

  return `\uFEFF${[headers.join(','), ...rows].join('\r\n')}`
}

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

    // Viewer 차단: 세션 목록은 title에 HUMAN 프롬프트 원문(PII 가능)이 포함되므로 전체 금지.
    if (!canAccessIndividualData(access.role)) {
      return forbiddenByRole(access.role, 'MEMBER 이상')
    }

    const projectIdParam = req.nextUrl.searchParams.get('projectId')
    const projectIds = await resolveOrgScopedProjectIds(access.org.id, userId, access.role, projectIdParam)
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
    const wantsCsv = req.nextUrl.searchParams.get('format') === 'csv'

    const filenameFrom = from.toISOString().slice(0, 10)
    const filenameTo = to.toISOString().slice(0, 10)
    const csvHeaders = {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sessions-${orgSlug}-${filenameFrom}-to-${filenameTo}.csv"`,
    }

    // projectIds 가 비었으면 (org 에 project 가 하나도 없음) 즉시 빈 결과 반환
    if (projectIds.length === 0) {
      if (wantsCsv) {
        return new NextResponse(buildSessionsCsv([]), { headers: csvHeaders })
      }
      const body: PaginatedResult<SessionItem> = { items: [], total: 0, page, pageSize }
      return NextResponse.json(body)
    }

    const where = {
      projectId: { in: projectIds },
      startedAt: { gte: from, lte: to },
    }

    if (wantsCsv) {
      let csvSessions: SessionWithInclude[]

      if (sortBy === 'cost') {
        const rankedRows = await db.$queryRaw<Array<{ id: string }>>`
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
        `
        const ids = rankedRows.map((r) => r.id)
        if (ids.length === 0) {
          csvSessions = []
        } else {
          const rows = await db.claudeSession.findMany({
            where: { id: { in: ids } },
            include: sessionInclude,
          })
          const byId = new Map(rows.map((s) => [s.id, s]))
          csvSessions = ids
            .map((id) => byId.get(id))
            .filter((s): s is SessionWithInclude => !!s)
        }
      } else {
        csvSessions = await db.claudeSession.findMany({
          where,
          include: sessionInclude,
          orderBy: { startedAt: 'desc' },
        })
      }

      return new NextResponse(buildSessionsCsv(csvSessions), { headers: csvHeaders })
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

    const items: SessionItem[] = sessions.map(mapSessionItem)

    const body: PaginatedResult<SessionItem> = { items, total, page, pageSize }
    return NextResponse.json(body)
  } catch (err) {
    return handleRouteError(err)
  }
}
