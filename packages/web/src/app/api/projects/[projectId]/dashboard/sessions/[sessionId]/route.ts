import { NextRequest, NextResponse } from 'next/server'
import type { SessionDetail, SessionTimelineUsage } from '@argos/shared'
import { db } from '@/lib/server/db'
import { requireAuth } from '@/lib/server/auth-helper'
import { handleRouteError } from '@/lib/server/error-helper'
import { assertProjectAccessOrResponse } from '@/lib/server/dashboard-route-helper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/projects/:projectId/dashboard/sessions/:sessionId
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; sessionId: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const { userId } = auth
    const { projectId, sessionId } = await params

    const access = await assertProjectAccessOrResponse(projectId, userId)
    if (access instanceof NextResponse) return access

    const session = await db.claudeSession.findUnique({
      where: { id: sessionId },
      include: {
        user: { select: { id: true, name: true } },
        usageRecords: { orderBy: { timestamp: 'asc' } },
        messages: { orderBy: [{ timestamp: 'asc' }, { sequence: 'asc' }] },
        _count: { select: { events: true } }
      }
    })

    if (!session || session.projectId !== projectId) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const totalInput = session.usageRecords.reduce((sum, r) => sum + r.inputTokens, 0)
    const totalOutput = session.usageRecords.reduce((sum, r) => sum + r.outputTokens, 0)
    const totalCost = session.usageRecords.reduce((sum, r) => sum + (r.estimatedCostUsd ?? 0), 0)

    const usageTimeline: SessionTimelineUsage[] = session.usageRecords.map((r) => ({
      timestamp: r.timestamp.toISOString(),
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      estimatedCostUsd: r.estimatedCostUsd ?? 0,
      model: r.model,
      isSubagent: r.isSubagent,
    }))

    // 각 UsageRecord를 "직전 ASSISTANT 턴"에 귀속시켜 메시지별 토큰/비용/모델 집계.
    // TOOL 메시지는 건너뛰고 가장 가까운 선행 ASSISTANT로 타고 올라감.
    type MsgAgg = { outputTokens: number; inputTokens: number; cost: number; model: string | null }
    const msgAgg: MsgAgg[] = session.messages.map(() => ({
      outputTokens: 0,
      inputTokens: 0,
      cost: 0,
      model: null,
    }))
    {
      let msgIdx = -1
      for (const u of session.usageRecords) {
        while (
          msgIdx + 1 < session.messages.length &&
          session.messages[msgIdx + 1].timestamp.getTime() <= u.timestamp.getTime()
        ) {
          msgIdx++
        }
        let ownerIdx = msgIdx
        while (ownerIdx >= 0 && session.messages[ownerIdx].role === 'TOOL') ownerIdx--
        if (ownerIdx >= 0 && session.messages[ownerIdx].role === 'ASSISTANT') {
          const agg = msgAgg[ownerIdx]
          agg.outputTokens += u.outputTokens
          agg.inputTokens += u.inputTokens
          agg.cost += u.estimatedCostUsd ?? 0
          if (!agg.model && u.model) agg.model = u.model
        }
      }
    }

    const firstHuman = session.messages.find((m) => m.role === 'HUMAN')
    const fallbackTitle = firstHuman?.content.slice(0, 200).trim() || null
    const title = session.title?.trim() || fallbackTitle
    const summary = session.summary?.trim() || null

    const detail: SessionDetail = {
      id: session.id,
      userId: session.user.id,
      userName: session.user.name,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      estimatedCostUsd: totalCost,
      eventCount: session._count.events,
      title,
      summary,
      messages: session.messages.map((m, i) => ({
        role: m.role,
        content: m.content,
        sequence: m.sequence,
        timestamp: m.timestamp.toISOString(),
        outputTokens: msgAgg[i].outputTokens,
        inputTokens: msgAgg[i].inputTokens,
        estimatedCostUsd: msgAgg[i].cost,
        model: msgAgg[i].model,
        toolName: m.toolName,
        toolInput: m.toolInput as Record<string, unknown> | null,
        toolUseId: m.toolUseId,
        durationMs: m.durationMs,
      })),
      usageTimeline,
    }

    return NextResponse.json(detail)
  } catch (err) {
    return handleRouteError(err)
  }
}

// DELETE /api/projects/:projectId/dashboard/sessions/:sessionId
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; sessionId: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const { userId } = auth
    const { projectId, sessionId } = await params

    const access = await assertProjectAccessOrResponse(projectId, userId)
    if (access instanceof NextResponse) return access

    const session = await db.claudeSession.findUnique({
      where: { id: sessionId },
      select: { projectId: true },
    })

    if (!session || session.projectId !== projectId) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    await db.claudeSession.delete({ where: { id: sessionId } })

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return handleRouteError(err)
  }
}
