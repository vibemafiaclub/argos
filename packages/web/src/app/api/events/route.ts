import { NextResponse, after } from 'next/server'
import { EventType, Prisma } from '@prisma/client'
import { IngestEventSchema } from '@argos/shared'
import { db } from '@/lib/server/db'
import { requireAuth } from '@/lib/server/auth-helper'
import { handleRouteError } from '@/lib/server/error-helper'
import {
  deriveFields,
  truncateMessageContent,
  truncateToolResponse,
} from '@/lib/server/events'
import { calculateCost } from '@/lib/server/cost'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/events
export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const { userId } = auth

    // 1. IngestEventSchema 검증 (Zod safeParse - 응답 shape 호환을 위해 parse 아님)
    const parseResult = IngestEventSchema.safeParse(await req.json())
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.issues },
        { status: 400 }
      )
    }

    const payload = parseResult.data

    // 2. Project 조회 + org 멤버십 확인 (403 if 비멤버)
    const project = await db.project.findUnique({
      where: { id: payload.projectId },
      include: {
        organization: {
          include: {
            memberships: {
              where: { userId },
            },
          },
        },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (project.organization.memberships.length === 0) {
      return NextResponse.json(
        { error: 'Forbidden: not a member of the organization' },
        { status: 403 }
      )
    }

    // 3. ClaudeSession upsert (create-only, 이미 존재하면 update 없음)
    await db.claudeSession.upsert({
      where: { id: payload.sessionId },
      create: {
        id: payload.sessionId,
        projectId: payload.projectId,
        userId,
        transcriptPath: null,
      },
      update: {},
    })

    // 4. deriveFields(payload)로 파생 필드 계산
    const derived = deriveFields(payload)
    const eventType = mapHookEventNameToEventType(payload.hookEventName)

    // 5. Event insert — PRE_TOOL_USE는 Event 대신 TOOL Message로 기록
    if (eventType !== 'PRE_TOOL_USE') {
      await db.event.create({
        data: {
          sessionId: payload.sessionId,
          userId,
          projectId: payload.projectId,
          eventType,
          toolName: payload.toolName ?? null,
          toolInput: (payload.toolInput as Prisma.InputJsonValue) ?? null,
          toolResponse: truncateToolResponse(payload.toolResponse) ?? null,
          exitCode: payload.exitCode ?? null,
          isSkillCall: derived.isSkillCall,
          skillName: derived.skillName,
          isSlashCommand: derived.isSlashCommand,
          isAgentCall: derived.isAgentCall,
          agentType: derived.agentType,
          agentDesc: derived.agentDesc,
          agentId: payload.agentId ?? null,
        },
      })
    }

    // 5-1. PRE/POST TOOL 이벤트는 TOOL Message row upsert로 실시간 기록
    // Stop 때 transcript 기반으로 전체 교체되므로 여기선 best-effort 채움
    if (
      (eventType === 'PRE_TOOL_USE' || eventType === 'POST_TOOL_USE') &&
      payload.toolUseId &&
      payload.toolName
    ) {
      await upsertToolMessage({
        sessionId: payload.sessionId,
        toolUseId: payload.toolUseId,
        toolName: payload.toolName,
        toolInput: payload.toolInput,
        toolResponse: payload.toolResponse,
        isPost: eventType === 'POST_TOOL_USE',
      })
    }

    // 6. Stop/SubagentStop이면 응답 후 비동기 처리
    // Vercel/Node serverless에선 setImmediate가 응답 후 드롭됨 → next/server의 after() 사용
    if (eventType === 'STOP' || eventType === 'SUBAGENT_STOP') {
      after(async () => {
        try {
          // Main Stop: 세션 종료 메타 업데이트 (endedAt, title, summary)
          // SubagentStop은 CLI에서 이미 필터링되지만 방어적으로 STOP만 처리
          if (eventType === 'STOP') {
            await db.claudeSession.update({
              where: { id: payload.sessionId },
              data: {
                endedAt: new Date(),
                ...(payload.title !== undefined ? { title: payload.title } : {}),
                ...(payload.summary !== undefined ? { summary: payload.summary } : {}),
              },
            })
          }

          // usagePerTurn이 있으면 per-turn bulk insert (신규)
          if (payload.usagePerTurn && payload.usagePerTurn.length > 0) {
            await db.usageRecord.createMany({
              data: payload.usagePerTurn.map((u) => ({
                sessionId: payload.sessionId,
                userId,
                projectId: payload.projectId,
                inputTokens: u.inputTokens,
                outputTokens: u.outputTokens,
                cacheCreationTokens: u.cacheCreationTokens,
                cacheReadTokens: u.cacheReadTokens,
                estimatedCostUsd: calculateCost(u),
                model: u.model ?? null,
                isSubagent: eventType === 'SUBAGENT_STOP',
                timestamp: new Date(u.timestamp),
              })),
            })
          } else if (payload.usage) {
            // 하위호환: usagePerTurn이 없으면 기존 단일 insert
            await db.usageRecord.create({
              data: {
                sessionId: payload.sessionId,
                userId,
                projectId: payload.projectId,
                inputTokens: payload.usage.inputTokens,
                outputTokens: payload.usage.outputTokens,
                cacheCreationTokens: payload.usage.cacheCreationTokens,
                cacheReadTokens: payload.usage.cacheReadTokens,
                estimatedCostUsd: calculateCost(payload.usage),
                model: payload.usage.model ?? null,
                isSubagent: eventType === 'SUBAGENT_STOP',
              },
            })
          }

          // messages가 있으면 Message 교체 (transcript가 authoritative)
          // 실시간으로 들어온 TOOL row들도 여기서 정확한 timestamp/duration/content로 덮어씀
          if (payload.messages && payload.messages.length > 0) {
            await db.$transaction([
              db.message.deleteMany({ where: { sessionId: payload.sessionId } }),
              db.message.createMany({
                data: payload.messages.map((m) => ({
                  sessionId: payload.sessionId,
                  role: m.role,
                  content: truncateMessageContent(m.content),
                  sequence: m.sequence,
                  timestamp: new Date(m.timestamp),
                  toolName: m.toolName ?? null,
                  toolInput: (m.toolInput as Prisma.InputJsonValue) ?? null,
                  toolUseId: m.toolUseId ?? null,
                  durationMs: m.durationMs ?? null,
                })),
              }),
            ])
          }
        } catch {
          // 에러 발생해도 무시 (fire-and-forget)
        }
      })
    }

    // 7. 즉시 202 Accepted 응답
    return NextResponse.json({ ok: true }, { status: 202 })
  } catch (err) {
    return handleRouteError(err)
  }
}

/**
 * PRE/POST TOOL 이벤트를 TOOL Message row로 실시간 기록한다.
 * - PRE: row 없으면 생성 (content='', durationMs=null)
 * - POST: row 있으면 content/durationMs 업데이트, 없으면 생성 (duration 계산 불가 → null)
 * Stop 때 transcript 기반으로 전체 교체되므로 best-effort만 한다.
 */
async function upsertToolMessage(opts: {
  sessionId: string
  toolUseId: string
  toolName: string
  toolInput?: Record<string, unknown>
  toolResponse?: string
  isPost: boolean
}): Promise<void> {
  const existing = await db.message.findFirst({
    where: { sessionId: opts.sessionId, toolUseId: opts.toolUseId },
  })

  if (existing) {
    if (opts.isPost) {
      const startMs = existing.timestamp.getTime()
      const endMs = Date.now()
      await db.message.update({
        where: { id: existing.id },
        data: {
          content: truncateMessageContent(opts.toolResponse ?? ''),
          durationMs: Math.max(0, endMs - startMs),
        },
      })
    }
    return
  }

  await db.message.create({
    data: {
      sessionId: opts.sessionId,
      role: 'TOOL',
      content: truncateMessageContent(opts.toolResponse ?? ''),
      sequence: 0, // Stop 때 transcript 기준으로 재할당
      timestamp: new Date(),
      toolName: opts.toolName,
      toolInput: (opts.toolInput as Prisma.InputJsonValue) ?? null,
      toolUseId: opts.toolUseId,
      durationMs: null,
    },
  })
}

// hookEventName → EventType 매핑
function mapHookEventNameToEventType(hookEventName: string): EventType {
  switch (hookEventName) {
    case 'SESSION_START':
      return EventType.SESSION_START
    case 'PRE_TOOL_USE':
      return EventType.PRE_TOOL_USE
    case 'POST_TOOL_USE':
      return EventType.POST_TOOL_USE
    case 'STOP':
      return EventType.STOP
    case 'SUBAGENT_STOP':
      return EventType.SUBAGENT_STOP
    default:
      throw new Error(`Unknown hookEventName: ${hookEventName}`)
  }
}
