# Goal 0 — 이벤트 파이프라인 구조 완전성

> 이 goal을 active로 잡은 에이전트는 먼저 `guidelines/goal-iteration.md`를
> 읽어 iteration 프로토콜을 확인할 것.

## Mission

Argos의 핵심 수집 파이프라인은 CLI hooks 에서 서버로 이벤트를 전송한다.
이 파이프라인이 구조적으로 완전하려면 **스키마에 선언된 모든 EventType** 이
API 이벤트 핸들러에 매핑되어 있어야 한다. 타입이 추가됐지만 핸들러가
빠지는 구조 드리프트를 gate 가 차단한다.

## Completion Conditions

1. Prisma 스키마(`packages/web/prisma/schema.prisma`)의 `enum EventType` 에
   선언된 **모든** 값이 `packages/web/src/app/api/events/route.ts` 의
   `mapHookEventNameToEventType` switch 문에 `case` 로 존재한다.
2. 공유 타입(`packages/shared/src/types/events.ts`)의 `EventType` union 에
   선언된 **모든** 문자열 리터럴이 동일 switch 문에 `case` 로 존재한다.

## Sources Of Truth

- Prisma enum: `grep -E '^\s+[A-Z_]+$' packages/web/prisma/schema.prisma` (enum EventType 블록 안)
- Shared type union: `packages/shared/src/types/events.ts` 의 `EventType` 타입 선언
- Switch 문: `packages/web/src/app/api/events/route.ts` 의 `mapHookEventNameToEventType`

## Verification

```bash
bash goals/0-event-pipeline.gates.sh
bash scripts/completion-check.sh
```
