# Phase 0: shared 타입 확장

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `/docs/code-architecture.md`
- `/docs/data-schema.md`
- `/docs/adr.md`

그리고 아래 파일들을 읽고 현재 구조를 파악하라:

- `/packages/shared/src/types/events.ts` — 현재 UsagePayload, IngestEventPayload 정의
- `/packages/shared/src/types/dashboard.ts` — 현재 SessionDetail 정의
- `/packages/shared/src/schemas/events.ts` — Zod 스키마 (IngestEventSchema)
- `/packages/shared/src/index.ts` — export 목록 확인

## 작업 내용

### 1. `packages/shared/src/types/events.ts` 수정

기존 `UsagePayload`는 건드리지 않는다. 새 타입을 추가한다:

```typescript
/** assistant 턴 1회분의 토큰 사용량 + 타임스탬프 */
export interface UsagePerTurnPayload extends UsagePayload {
  timestamp: string // ISO 8601 — transcript의 assistant 메시지 timestamp
}
```

`IngestEventPayload`에 새 필드를 추가한다:

```typescript
export interface IngestEventPayload {
  // ... 기존 필드 유지 ...

  // Stop/SubagentStop에서 CLI가 transcript에서 추출해서 채워 보냄
  usage?: UsagePayload               // 기존 — 전체 합산 (하위호환)
  usagePerTurn?: UsagePerTurnPayload[] // 신규 — assistant 턴별 개별 usage
  messages?: MessagePayload[]
}
```

### 2. `packages/shared/src/schemas/events.ts` 수정

`UsagePerTurnPayloadSchema`를 추가하고, `IngestEventSchema`에 `usagePerTurn` 필드를 추가한다:

```typescript
const UsagePerTurnPayloadSchema = UsagePayloadSchema.extend({
  timestamp: z.string(),
})

export const IngestEventSchema = z.object({
  // ... 기존 필드 유지 ...
  usage: UsagePayloadSchema.optional(),
  usagePerTurn: z.array(UsagePerTurnPayloadSchema).optional(), // 신규
  messages: z.array(MessagePayloadSchema).optional(),
})
```

### 3. `packages/shared/src/types/dashboard.ts` 수정

`SessionDetail`에 타임라인 데이터를 추가한다:

```typescript
/** 세션 타임라인 차트용 — UsageRecord 1건에 대응 */
export interface SessionTimelineUsage {
  timestamp: string      // ISO 8601
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
  model?: string | null
  isSubagent: boolean
}

/** 세션 타임라인 차트용 — tool call 이벤트 1건 */
export interface SessionTimelineTool {
  timestamp: string
  toolName: string
  eventType: 'PRE_TOOL_USE' | 'POST_TOOL_USE'
  isSkillCall: boolean
  skillName?: string | null
  isAgentCall: boolean
  agentType?: string | null
}

export interface SessionDetail extends SessionItem {
  messages: Array<{ role: MessageRole; content: string; sequence: number; timestamp: string }>
  usageTimeline: SessionTimelineUsage[]   // 신규
  toolEvents: SessionTimelineTool[]       // 신규
}
```

### 4. export 확인

`packages/shared/src/index.ts`에서 새 타입들이 re-export되는지 확인하고, 안 되어 있으면 추가하라. 이 파일의 기존 export 패턴을 따르라.

## Acceptance Criteria

```bash
cd /Users/choesumin/Desktop/dev/vmc/argos && pnpm --filter @argos/shared build
```

컴파일 에러 없이 빌드 성공해야 한다.

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/2-session-timeline/index.json`의 phase 0 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.
작업 중 사용자 개입이 반드시 필요한 상황이 발생하면 status를 `"blocked"`로, `"blocked_reason"` 필드에 사유를 구체적으로 기록하고 작업을 즉시 중단하라.

## 주의사항

- 기존 `UsagePayload`, `IngestEventPayload`, `SessionItem`의 필드를 삭제하거나 변경하지 마라. **추가만** 한다.
- `SessionDetail`의 기존 `messages` 필드를 건드리지 마라.
- Zod 스키마에서 `usagePerTurn`은 반드시 `.optional()`이어야 한다. 기존 CLI가 이 필드 없이 보내기 때문이다.
- 새 타입 이름은 정확히 `UsagePerTurnPayload`, `SessionTimelineUsage`, `SessionTimelineTool`을 사용하라.
