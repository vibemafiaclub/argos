# Phase 5: API Events Route

## 사전 준비

아래 문서들을 반드시 읽어라:

- `docs/code-architecture.md` — 이벤트 처리 흐름 (4번 섹션, `routes/events.ts` 설명), CLI lib/transcript.ts
- `docs/data-schema.md` — Event, UsageRecord, Message, ClaudeSession 모델
- `docs/adr.md` — ADR-005 (hook always exits 0), ADR-006 (fire-and-forget)
- `docs/flow.md` — Flow 6 (Hook 이벤트 수집)

이전 phase 산출물을 반드시 확인하라:

- `packages/api/src/middleware/auth.ts`
- `packages/api/src/db.ts`
- `packages/shared/src/types/events.ts`
- `packages/shared/src/schemas/events.ts`

## 작업 내용

`POST /api/events` 라우트와 관련 lib를 구현한다.

### 1. `src/lib/cost.ts`

```typescript
import { MODEL_PRICING } from '@argos/shared'
import type { UsagePayload } from '@argos/shared'

// UsagePayload를 받아 USD 비용을 계산한다
// 모델명 매핑 실패 시 'default' 키 사용
export function calculateCost(usage: UsagePayload): number
```

계산식:
```
cost = (inputTokens / 1_000_000) * pricing.inputPerM
     + (outputTokens / 1_000_000) * pricing.outputPerM
     + (cacheCreationTokens / 1_000_000) * pricing.cacheWritePerM
     + (cacheReadTokens / 1_000_000) * pricing.cacheReadPerM
```

### 2. `src/lib/events.ts`

hook payload에서 파생 필드를 계산한다:

```typescript
import type { IngestEventPayload } from '@argos/shared'

export interface DerivedFields {
  isSkillCall: boolean
  skillName: string | null
  isSlashCommand: boolean
  isAgentCall: boolean
  agentType: string | null
  agentDesc: string | null
}

// toolName === 'Skill' → isSkillCall=true, skillName=toolInput.skill
// toolName === 'Agent' → isAgentCall=true, agentType=toolInput.subagent_type, agentDesc=toolInput.description
// isSlashCommand은 CLI가 채워 보내므로 payload에서 그대로 읽음
export function deriveFields(payload: IngestEventPayload): DerivedFields

// toolResponse를 2,000자로 truncation
export function truncateToolResponse(response: string | undefined): string | undefined

// message content를 50,000자로 truncation
export function truncateMessageContent(content: string): string
```

### 3. `src/routes/events.ts`

**`POST /api/events`** (auth 필요):

처리 순서:
1. IngestEventSchema 검증 (Zod)
2. Project 조회 + org 멤버십 확인 (403 if 비멤버)
3. ClaudeSession upsert:
   ```typescript
   await db.claudeSession.upsert({
     where: { id: payload.sessionId },
     create: { id: payload.sessionId, projectId, userId, transcriptPath: null },
     update: {},  // 이미 존재하면 업데이트 없음
   })
   ```
4. `deriveFields(payload)`로 파생 필드 계산
5. Event insert:
   - `toolInput`: JSON 저장 (null이면 null)
   - `toolResponse`: `truncateToolResponse()` 적용
   - `hookEventName → eventType` 변환: `SESSION_START` → `EventType.SESSION_START` 등
6. **즉시 `202 Accepted` 응답**
7. Stop/SubagentStop이면 비동기로 처리:
   ```typescript
   setImmediate(async () => {
     // usage가 있으면 UsageRecord insert
     // messages가 있으면 Message bulk insert (createMany)
     // 에러 발생해도 무시 (fire-and-forget)
   })
   ```

**hookEventName → EventType 매핑**:
```
SESSION_START    → SESSION_START
PRE_TOOL_USE     → PRE_TOOL_USE
POST_TOOL_USE    → POST_TOOL_USE
STOP             → STOP
SUBAGENT_STOP    → SUBAGENT_STOP
```

**Message insert**:
```typescript
await db.message.createMany({
  data: payload.messages.map(m => ({
    sessionId: payload.sessionId,
    role: m.role,
    content: truncateMessageContent(m.content),
    sequence: m.sequence,
    timestamp: new Date(m.timestamp),
  })),
  skipDuplicates: true,  // 재전송에 대비
})
```

**UsageRecord insert**:
```typescript
await db.usageRecord.create({
  data: {
    sessionId: payload.sessionId,
    userId,
    projectId,
    inputTokens: payload.usage.inputTokens,
    outputTokens: payload.usage.outputTokens,
    cacheCreationTokens: payload.usage.cacheCreationTokens,
    cacheReadTokens: payload.usage.cacheReadTokens,
    estimatedCostUsd: calculateCost(payload.usage),
    model: payload.usage.model,
    isSubagent: payload.hookEventName === 'SUBAGENT_STOP',
  },
})
```

### 4. `src/app.ts` 업데이트

```typescript
app.route('/api/events', eventsRoute)
```

## Acceptance Criteria

```bash
cd /Users/choesumin/Desktop/dev/vmc/argos
pnpm --filter @argos/api build
# 컴파일 에러 없음
```

## AC 검증 방법

빌드 성공 시 `/tasks/1-mvp/index.json`의 phase 5 status를 `"completed"`로 변경하라.
3회 이상 실패 시 `"error"`로, 에러 내용 기록.

## 주의사항

- **202를 먼저 반환하고 비동기 처리**한다. UsageRecord/Message insert는 응답 후에 실행된다. 순서를 바꾸면 hook 3초 타임아웃을 초과할 수 있다.
- `setImmediate()` 내부의 에러는 절대 catch하지 않고 무시한다 (fire-and-forget). 에러로 인해 202 응답이 영향받으면 안 된다.
- `ClaudeSession upsert`는 `update: {}`로 기존 세션을 변경하지 않는다. 동시에 여러 이벤트가 같은 sessionId로 오더라도 중복 생성이 없어야 한다.
- `toolInput`은 Zod 스키마에서 `z.record(z.unknown())`으로 받아 그대로 Prisma `Json` 필드에 저장하라.
- Message의 `skipDuplicates: true`는 Stop 이벤트가 중복 전송될 때 idempotent하게 처리한다.
- `payload.messages`는 CLI가 transcript에서 추출해서 보내는 것이다. API가 transcript 파일을 직접 읽지 않는다 (transcript_path는 ClaudeSession에 저장되지 않음 — 필드 제거해도 됨).
