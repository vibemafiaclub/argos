# Phase 2: API Foundation Eval

## 사전 준비

아래 문서들을 반드시 읽어라:

- `docs/data-schema.md` — Prisma 스키마, 인덱스 전략 (기준 문서)
- `docs/code-architecture.md` — packages/api 구조, 환경변수 목록

이전 phase 산출물을 반드시 확인하라:

- `packages/api/prisma/schema.prisma`
- `packages/api/src/env.ts`
- `packages/api/src/db.ts`
- `packages/api/src/app.ts`
- `packages/api/src/index.ts`
- `packages/api/src/middleware/error.ts`
- `packages/api/src/routes/health.ts`
- `packages/api/package.json`

## 작업 내용

Phase 1 산출물을 fresh eye로 검토하고 문제를 수정한다. **새 기능 추가 금지. 수정만.**

### 검토 체크리스트

#### Prisma schema (`prisma/schema.prisma`)
- [ ] 8개 모델 모두 존재: Organization, User, OrgMembership, CliToken, Project, ClaudeSession, Event, UsageRecord, Message
- [ ] `ClaudeSession.id`가 `@id`만 있고 `@default(cuid())`가 없는가 (Claude Code session_id 그대로 사용)
- [ ] `Event.toolInput Json?` (JSONB)
- [ ] `Event.isSlashCommand Boolean @default(false)` 존재
- [ ] `Event.agentDesc String?`와 `Event.agentId String?` 존재
- [ ] `datasource db`에 `directUrl = env("DIRECT_URL")` 존재
- [ ] **인덱스 모두 존재** (data-schema.md 4번 섹션과 대조):
  - `ClaudeSession`: `@@index([projectId, startedAt])`, `@@index([userId, startedAt])`
  - `Event`: `@@index([projectId, timestamp])`, `@@index([userId, timestamp])`, `@@index([sessionId])`, `@@index([projectId, isSkillCall, timestamp])`, `@@index([projectId, isAgentCall, timestamp])`
  - `UsageRecord`: `@@index([projectId, timestamp])`, `@@index([userId, timestamp])`
  - `Message`: `@@index([sessionId, sequence])`
- [ ] `OrgMembership.@@unique([userId, orgId])` 존재
- [ ] `Project.@@unique([orgId, slug])` 존재
- [ ] cascade delete 설정 (`onDelete: Cascade`) 올바름
- [ ] enum 이름 정확: `OrgRole`, `EventType`, `MessageRole`

#### `src/env.ts`
- [ ] `JWT_SECRET` 최소 32자 검증
- [ ] `PORT` 기본값 3001
- [ ] `WEB_URL`이 `.url()` 검증
- [ ] `DIRECT_URL` 포함

#### `src/app.ts`
- [ ] `cors({ origin: env.WEB_URL })` — wildcard 아님
- [ ] `app.onError(errorHandler)` 등록
- [ ] `/health` 라우트 등록

#### `src/middleware/error.ts`
- [ ] ZodError → 400
- [ ] 그 외 → 500
- [ ] 에러 스택 트레이스/내부 메시지 응답에 노출 안 함

#### 코드 품질 (tidy first)
- [ ] 불필요한 파일/import 없음
- [ ] TODO 주석이 실제로 나중 phase용인지 확인 (이 phase 범위 내 미구현 사항이면 구현)
- [ ] 타입 오류 없이 빌드되는가

### 발견된 문제 수정

위 체크리스트에서 문제가 발견되면 즉시 수정하라. 수정 후 반드시 다시 빌드해서 확인하라.

## Acceptance Criteria

```bash
cd /Users/choesumin/Desktop/dev/vmc/argos

pnpm --filter @argos/api build
# 컴파일 에러 없음

# Prisma schema 검증
pnpm --filter @argos/api exec prisma validate
# Prisma schema is valid
```

## AC 검증 방법

위 커맨드를 실행하라. 통과하면 `/tasks/1-mvp/index.json`의 phase 2 status를 `"completed"`로 변경하라.
수정 3회 이상 실패하면 `"error"`로, 에러 내용을 `"error_message"`에 기록하라.

## 주의사항

- 이 phase는 기존 코드의 **검토와 수정**이 목적이다. 새 라우트나 기능을 추가하지 마라.
- 인덱스 하나라도 누락되면 대시보드 쿼리가 느려진다. 정확히 확인하라.
- `ClaudeSession.id`에 `@default(cuid())`가 있으면 반드시 제거하라 — 이것은 핵심 설계 결정이다.
