# Phase 6: API Events Eval

## 사전 준비

아래 문서들을 반드시 읽어라:

- `docs/adr.md` — ADR-005 (hook always exits 0), ADR-006 (fire-and-forget)
- `docs/code-architecture.md` — 이벤트 처리 흐름
- `docs/data-schema.md` — ClaudeSession.id 설계 의도, Event.isSlashCommand

이전 phase 산출물을 반드시 확인하라:

- `packages/api/src/lib/cost.ts`
- `packages/api/src/lib/events.ts`
- `packages/api/src/routes/events.ts`

## 작업 내용

Phase 5 산출물을 fresh eye로 검토하고 수정한다. **새 기능 추가 금지.**

### 검토 체크리스트

#### `src/lib/cost.ts`
- [ ] 네 가지 토큰 타입을 모두 계산에 포함: input, output, cacheCreation, cacheRead
- [ ] 모델명 없으면 `'default'` pricing 사용
- [ ] 나눗셈이 `1_000_000` (백만 단위)

#### `src/lib/events.ts`
- [ ] `toolName === 'Skill'` → `skillName = toolInput?.skill as string`
- [ ] `toolName === 'Agent'` → `agentType = toolInput?.subagent_type`, `agentDesc = toolInput?.description`
- [ ] `isSlashCommand`는 payload에서 그대로 읽음 (CLI가 설정해서 보냄)
- [ ] `truncateToolResponse`: 2,000자 초과 시 slice
- [ ] `truncateMessageContent`: 50,000자 초과 시 slice

#### `src/routes/events.ts`
- [ ] **202를 먼저 반환** (`return c.json(..., 202)`)하고 setImmediate/Promise 비동기 처리
- [ ] ClaudeSession upsert가 `update: {}` (기존 세션 변경 없음)
- [ ] Zod 검증 실패 → 400 (202 아님)
- [ ] org 멤버십 없음 → 403
- [ ] `setImmediate` 내부의 에러가 무시됨 (try-catch로 잡거나 `.catch(() => {})`)
- [ ] Message.createMany에 `skipDuplicates: true`
- [ ] Event.eventType이 올바른 Prisma enum 값으로 변환됨 (`SESSION_START` 등)
- [ ] `toolInput` null 처리: payload에 없으면 null 저장
- [ ] `toolResponse` truncation 적용
- [ ] `agentId` 필드 저장 (payload.agentId)

#### 에러 처리
- [ ] 어떤 에러가 발생해도 hook이 의존하는 `POST /api/events`는 절대 5xx를 응답하지 않는가?
  - 실제로는 DB 에러 시 500이 나올 수 있다. 중요한 것은 ClaudeSession upsert + Event insert의 동기 부분이 실패하면 500을 반환해도 되지만, hook은 3초 타임아웃으로 처리하므로 허용.
  - 하지만 비동기 부분(UsageRecord, Message)의 에러는 무조건 무시해야 한다.
- [ ] Prisma unique violation (P2002) 처리 — Event PK는 cuid()이므로 충돌 없음. ClaudeSession upsert는 idempotent.

#### 코드 품질
- [ ] `src/lib/events.ts`가 DB에 직접 접근하지 않음 (순수 변환 함수)
- [ ] `src/lib/cost.ts`가 부수효과 없음
- [ ] 불필요한 import 없음

### 발견된 문제 수정

체크리스트 실패 항목을 즉시 수정하라.

## Acceptance Criteria

```bash
cd /Users/choesumin/Desktop/dev/vmc/argos
pnpm --filter @argos/api build
# 컴파일 에러 없음
```

## AC 검증 방법

빌드 성공 시 `/tasks/1-mvp/index.json`의 phase 6 status를 `"completed"`로 변경하라.
3회 이상 실패 시 `"error"`로, 에러 내용 기록.

## 주의사항

- **202 응답 순서가 가장 중요한 검증 포인트**다. setImmediate 이후에 202를 반환하면 Claude Code가 멈춘다.
- `isSlashCommand`는 CLI가 SessionStart 이벤트 처리 시 transcript를 파싱해서 설정한다. API는 payload에서 그대로 읽기만 한다.
