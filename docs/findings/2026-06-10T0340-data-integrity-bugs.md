---
title: 데이터 정합성 버그 — rollup 캐시 영구 누락, 회원가입 레이스
created_at: 2026-06-10T03:40:00Z
resolved: true
resolved_by: pending-push
priority: P1
related:
  - packages/web/src/lib/server/daily-rollup.ts
  - docs/findings/2026-06-10T0340-code-quality-issues.md
---

# 데이터 정합성 버그 — rollup 캐시 영구 누락, 회원가입 레이스

## TL;DR

UTC 자정을 가로지른 세션의 사용량이 일일 rollup 캐시에서 **영구 누락**될
수 있고, 회원가입 동시 요청이 409 대신 500을 반환한다. 보안 이슈는 아니나
대시보드 수치 신뢰도와 UX를 깎는 실제 결함.

## Body

### B1 — 과거 일자 rollup 캐시가 늦게 도착한 사용량을 영구 누락 (P1)

`packages/web/src/lib/server/daily-rollup.ts:479-534` — `to`가 오늘 이전이면
해당 일자 rollup을 캐시하고, 이후 재계산 트리거는
`row.computedAt < SKILL_COUNTS_INVALIDATION_AT`(고정 상수) 하나뿐이다.

시나리오: 세션이 UTC 23:00~01:00에 걸쳐 실행됨 → 자정 직후, Stop 이벤트
도착 전에 누군가 대시보드를 열어 "어제" rollup이 계산·캐시됨 → 이후 Stop이
어제 timestamp의 `UsageRecord`를 insert해도 어제 rollup은 다시 계산되지
않음 → 해당 토큰/비용이 대시보드에서 영구 누락.

수정 방향: 미종료 세션이 걸친 일자는 캐시를 보류하거나, ingest 시점에
이벤트 timestamp가 과거 일자면 해당 일자 캐시 행을 무효화(delete)한다.
후자가 구현이 단순하고 누락 창이 0이 된다. **권장: ingest-시점 무효화.**

### B2 — 회원가입 check-then-create 레이스 → 409 대신 500 (P2)

`packages/web/src/lib/server/auth-actions.ts:120-134` —
`findUnique`로 이메일 존재 검사 후 `create`. 동일 이메일 동시 요청 시 둘 다
검사를 통과하고 두 번째 `create`가 P2002로 throw → `handleRouteError`가
500 반환(의도된 409 "Email already in use" 아님).

수정 방향: `create`를 try/catch로 감싸 Prisma P2002 → `EMAIL_IN_USE` 매핑.

## Acceptance signal

- B1: "과거 일자 UsageRecord insert 후 같은 일자 rollup 재조회 시 반영"을
  단언하는 통합 테스트(예: `daily-rollup.test.ts`에 late-arrival 케이스)가
  red→green.
- B2: 동일 이메일 2회 등록 시뮬레이션(두 번째는 P2002 mock)에서 409 응답을
  단언하는 테스트가 red→green.

## Resolution

**B1** (`api/events/route.ts`): `usagePerTurn` bulk insert 직후, 과거 UTC 날짜에 해당하는 `DailyProjectStat` 행을 `deleteMany`로 삭제. 다음 대시보드 조회 시 `getDailyRollups`가 missing days로 인식해 재계산. 오늘 날짜는 원래 live 계산이므로 불필요.

**B2** (`lib/server/auth-actions.ts`): `registerUser`의 `db.user.create` 호출을 try/catch로 감싸 Prisma error code `P2002` → `'EMAIL_IN_USE'` 매핑 추가. 동시 요청 레이스 시 500 대신 409 반환.
