import { Hono } from 'hono'
import { authMiddleware } from '@/middleware/auth'
import { db } from '@/db'
import { IngestEventSchema } from '@argos/shared'
import { deriveFields, truncateToolResponse, truncateMessageContent } from '@/lib/events'
import { calculateCost } from '@/lib/cost'
import { EventType, Prisma } from '@prisma/client'

type Variables = {
  userId: string
}

const app = new Hono<{ Variables: Variables }>()

// POST /api/events (auth 필요)
app.post('/', authMiddleware, async (c) => {
  const userId = c.get('userId')

  // 1. IngestEventSchema 검증 (Zod)
  const parseResult = IngestEventSchema.safeParse(await c.req.json())
  if (!parseResult.success) {
    return c.json({ error: 'Validation failed', details: parseResult.error.issues }, 400)
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
    return c.json({ error: 'Project not found' }, 404)
  }

  if (project.organization.memberships.length === 0) {
    return c.json({ error: 'Forbidden: not a member of the organization' }, 403)
  }

  // 3. ClaudeSession upsert
  await db.claudeSession.upsert({
    where: { id: payload.sessionId },
    create: {
      id: payload.sessionId,
      projectId: payload.projectId,
      userId,
      transcriptPath: null,
    },
    update: {}, // 이미 존재하면 업데이트 없음
  })

  // 4. deriveFields(payload)로 파생 필드 계산
  const derived = deriveFields(payload)

  // 5. Event insert
  const eventType = mapHookEventNameToEventType(payload.hookEventName)

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

  // 6. 즉시 202 Accepted 응답
  c.status(202)
  const response = c.json({ ok: true })

  // 7. Stop/SubagentStop이면 비동기로 처리
  if (eventType === 'STOP' || eventType === 'SUBAGENT_STOP') {
    setImmediate(async () => {
      try {
        // usage가 있으면 UsageRecord insert
        if (payload.usage) {
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

        // messages가 있으면 Message bulk insert
        if (payload.messages && payload.messages.length > 0) {
          await db.message.createMany({
            data: payload.messages.map((m) => ({
              sessionId: payload.sessionId,
              role: m.role,
              content: truncateMessageContent(m.content),
              sequence: m.sequence,
              timestamp: new Date(m.timestamp),
            })),
            skipDuplicates: true, // 재전송에 대비
          })
        }
      } catch {
        // 에러 발생해도 무시 (fire-and-forget)
      }
    })
  }

  return response
})

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

export default app
