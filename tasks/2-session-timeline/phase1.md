# Phase 1: CLI transcript 파싱 변경

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `/docs/code-architecture.md`
- `/docs/data-schema.md`

그리고 이전 phase의 작업물과 현재 코드를 반드시 확인하라:

- `/packages/shared/src/types/events.ts` — Phase 0에서 추가된 `UsagePerTurnPayload` 타입
- `/packages/cli/src/lib/transcript.ts` — 현재 `extractUsageFromTranscript`, `readTranscriptLines` 구현
- `/packages/cli/src/commands/hook.ts` — 현재 Stop/SubagentStop 처리 로직 (`buildPayload`, `makeHookCommand`)
- `/packages/shared/src/types/events.ts` — `IngestEventPayload`의 `usagePerTurn` 필드

이전 phase에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업 내용

### 1. `packages/cli/src/lib/transcript.ts` — `extractUsagePerTurn` 함수 추가

기존 `extractUsageFromTranscript` 함수는 **절대 수정하지 마라** (하위호환). 새 함수를 추가한다.

```typescript
import type { UsagePerTurnPayload } from '@argos/shared'

/**
 * Extract per-assistant-turn usage from transcript.
 * Returns one UsagePerTurnPayload per "assistant" entry in transcript.jsonl.
 * Each entry's timestamp comes from the transcript line's timestamp field.
 */
export async function extractUsagePerTurn(
  transcriptPath: string
): Promise<UsagePerTurnPayload[]>
```

구현 로직:
- `readTranscriptLines(transcriptPath)`로 라인 읽기
- `line.type === 'assistant'`이고 `line.message?.usage`가 존재하는 라인마다 1건의 `UsagePerTurnPayload` 생성
- 각 항목의 `timestamp`는 `line.timestamp`를 사용. 없으면 `new Date().toISOString()` fallback
- usage 값이 모두 0인 항목은 건너뛰지 마라 — API에서 타임라인 데이터 포인트로 사용해야 하므로
- 결과 배열이 비어있으면 빈 배열 `[]` 반환 (null 아님)

### 2. `packages/cli/src/commands/hook.ts` — Stop/SubagentStop 처리에 `usagePerTurn` 추가

현재 코드 (약 라인 174~189):
```typescript
if (event.hook_event_name === 'Stop' || event.hook_event_name === 'SubagentStop') {
  const transcriptPath = event.hook_event_name === 'SubagentStop'
    ? event.agent_transcript_path
    : event.transcript_path
  if (transcriptPath) {
    const usage = await deps.transcript.extractUsage(transcriptPath)
    if (usage) {
      payload.usage = usage
    }
    // ... messages 처리 ...
  }
}
```

여기에 `usagePerTurn` 추출을 추가한다:

```typescript
if (transcriptPath) {
  const usage = await deps.transcript.extractUsage(transcriptPath)
  if (usage) {
    payload.usage = usage
  }

  // 신규: per-turn usage 추출
  const usagePerTurn = await deps.transcript.extractUsagePerTurn(transcriptPath)
  if (usagePerTurn.length > 0) {
    payload.usagePerTurn = usagePerTurn
  }

  // ... 기존 messages 처리 ...
}
```

### 3. `packages/cli/src/deps.ts` (또는 deps 관련 파일) — transcript 의존성 업데이트

`deps.transcript`에 `extractUsagePerTurn` 메서드를 추가해야 한다. 기존 deps 구조를 확인하고, `extractUsage`와 동일한 패턴으로 `extractUsagePerTurn`을 등록하라.

deps 파일의 위치와 구조는 직접 확인하라. `packages/cli/src/deps.ts` 또는 유사한 파일에 있을 것이다.

## Acceptance Criteria

```bash
cd /Users/choesumin/Desktop/dev/vmc/argos && pnpm --filter cli build
```

컴파일 에러 없이 빌드 성공해야 한다.

추가로 기존 테스트가 있다면 통과해야 한다:
```bash
cd /Users/choesumin/Desktop/dev/vmc/argos && pnpm --filter cli test 2>/dev/null || echo "no tests configured"
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/2-session-timeline/index.json`의 phase 1 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.
작업 중 사용자 개입이 반드시 필요한 상황이 발생하면 status를 `"blocked"`로, `"blocked_reason"` 필드에 사유를 구체적으로 기록하고 작업을 즉시 중단하라.

## 주의사항

- `extractUsageFromTranscript` 함수를 수정하지 마라. 하위호환을 위해 그대로 유지해야 한다.
- `buildPayload` 함수를 수정하지 마라. `usagePerTurn`은 `hook.ts`의 `makeHookCommand` 내부에서 payload에 직접 할당한다.
- `payload.usage`는 반드시 유지하라. `usagePerTurn`은 **추가** 필드이다. 둘 다 보내야 한다.
- transcript 파싱 중 에러가 발생해도 전체 hook이 실패하면 안 된다. try-catch로 감싸고, 에러 시 `usagePerTurn`을 빈 배열이나 undefined로 처리하라.
