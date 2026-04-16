# Phase 2: API 수정 (이벤트 처리 + 세션 상세)

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `/docs/code-architecture.md`
- `/docs/data-schema.md`
- `/docs/adr.md`

그리고 이전 phase의 작업물과 현재 코드를 반드시 확인하라:

- `/packages/shared/src/types/events.ts` — Phase 0에서 추가된 `UsagePerTurnPayload`
- `/packages/shared/src/types/dashboard.ts` — Phase 0에서 추가된 `SessionTimelineUsage`, `SessionTimelineTool`, 확장된 `SessionDetail`
- `/packages/api/src/routes/events.ts` — 현재 이벤트 처리 (STOP/SUBAGENT_STOP 시 UsageRecord 생성)
- `/packages/api/src/routes/dashboard.ts` — 현재 세션 상세 API (약 라인 407~460)
- `/packages/api/src/lib/cost.ts` — `calculateCost` 함수
- `/packages/api/prisma/schema.prisma` — UsageRecord, Event 모델 구조

이전 phase에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업 내용

### 1. `packages/api/src/routes/events.ts` — usagePerTurn 처리

현재 STOP/SUBAGENT_STOP 처리 부분 (약 라인 92~111)을 수정한다.

**로직**:
- `payload.usagePerTurn`이 존재하고 길이가 1 이상이면:
  - `db.usageRecord.createMany()`로 턴별 UsageRecord를 bulk insert
  - 각 레코드의 `timestamp`는 `usagePerTurn[i].timestamp`를 사용
  - 각 레코드의 `estimatedCostUsd`는 `calculateCost()`로 개별 계산
  - `isSubagent`는 eventType이 `SUBAGENT_STOP`이면 true
- `payload.usagePerTurn`이 없으면:
  - **기존 로직 그대로 유지** (`payload.usage`로 단일 UsageRecord 생성) — 하위호환

```typescript
// 수정 후 pseudo-code:
if (eventType === 'STOP' || eventType === 'SUBAGENT_STOP') {
  setImmediate(async () => {
    try {
      if (payload.usagePerTurn && payload.usagePerTurn.length > 0) {
        // 신규: per-turn bulk insert
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
        // 하위호환: 기존 단일 insert
        await db.usageRecord.create({ ... })  // 기존 코드 유지
      }

      // messages 처리 — 기존 코드 그대로
      if (payload.messages && payload.messages.length > 0) { ... }
    } catch { /* fire-and-forget */ }
  })
}
```

**핵심 규칙**: `usagePerTurn`이 있으면 `usage`(합산)로는 UsageRecord를 만들지 않는다. 중복 방지.

### 2. `packages/api/src/routes/dashboard.ts` — 세션 상세 API 확장

현재 세션 상세 API (약 라인 407~460)를 수정한다.

**변경 1**: Prisma 쿼리에 `events` include 추가

```typescript
const session = await db.claudeSession.findUnique({
  where: { id: sessionId },
  include: {
    user: { select: { id: true, name: true } },
    usageRecords: { orderBy: { timestamp: 'asc' } },  // 수정: orderBy 추가
    messages: { orderBy: { sequence: 'asc' } },
    events: {                                           // 신규
      where: {
        eventType: { in: ['PRE_TOOL_USE', 'POST_TOOL_USE'] },
      },
      orderBy: { timestamp: 'asc' },
      select: {
        timestamp: true,
        toolName: true,
        eventType: true,
        isSkillCall: true,
        skillName: true,
        isAgentCall: true,
        agentType: true,
      },
    },
    _count: { select: { events: true } },
  },
})
```

**변경 2**: 응답에 `usageTimeline`과 `toolEvents` 추가

```typescript
import type { SessionDetail, SessionTimelineUsage, SessionTimelineTool } from '@argos/shared'

const usageTimeline: SessionTimelineUsage[] = session.usageRecords.map((r) => ({
  timestamp: r.timestamp.toISOString(),
  inputTokens: r.inputTokens,
  outputTokens: r.outputTokens,
  estimatedCostUsd: r.estimatedCostUsd ?? 0,
  model: r.model,
  isSubagent: r.isSubagent,
}))

const toolEvents: SessionTimelineTool[] = session.events.map((e) => ({
  timestamp: e.timestamp.toISOString(),
  toolName: e.toolName ?? 'unknown',
  eventType: e.eventType as 'PRE_TOOL_USE' | 'POST_TOOL_USE',
  isSkillCall: e.isSkillCall,
  skillName: e.skillName,
  isAgentCall: e.isAgentCall,
  agentType: e.agentType,
}))

const detail: SessionDetail = {
  // ... 기존 필드 그대로 ...
  usageTimeline,   // 신규
  toolEvents,      // 신규
}
```

기존 `totalInput`, `totalOutput`, `totalCost` 계산과 `messages` 매핑은 그대로 유지한다.

## Acceptance Criteria

```bash
cd /Users/choesumin/Desktop/dev/vmc/argos && pnpm --filter api build
```

컴파일 에러 없이 빌드 성공해야 한다.

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/2-session-timeline/index.json`의 phase 2 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.
작업 중 사용자 개입이 반드시 필요한 상황이 발생하면 status를 `"blocked"`로, `"blocked_reason"` 필드에 사유를 구체적으로 기록하고 작업을 즉시 중단하라.

## 주의사항

- `events.ts`에서 `usagePerTurn`이 있을 때 `usage`로 중복 UsageRecord를 만들지 마라.
- `dashboard.ts`의 `events` include에서 `PRE_TOOL_USE`와 `POST_TOOL_USE`만 가져온다. SESSION_START, STOP, SUBAGENT_STOP은 가져오지 않는다.
- 기존 `totalInput`, `totalOutput`, `totalCost` 합산 로직은 수정하지 마라. usageRecords 기반 합산이므로 per-turn 데이터여도 동일하게 동작한다.
- `usageTimeline`의 `estimatedCostUsd`에서 null을 0으로 변환하라 (`r.estimatedCostUsd ?? 0`).
- Prisma의 `createMany`는 `skipDuplicates` 옵션을 사용하지 마라 — UsageRecord에 unique constraint가 없으므로 불필요하다.
- 기존 messages 처리 코드는 건드리지 마라.
