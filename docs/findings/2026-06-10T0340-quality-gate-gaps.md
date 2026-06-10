---
title: 품질 게이트 3중 누수 — CI 미실행, 원격 DB 테스트, shallow 성공 선언
created_at: 2026-06-10T03:40:00Z
resolved: partial
resolved_by: pending-push
priority: P0
status_notes: |
  G2 (vitest.config.ts allowlist guard) — done
  G1 (ci.yml: web test + lint + typecheck + postgres service) — done, CI verification pending push
  G3 (completion-check.sh shallow-pass exit 1) — done
  G4–G9: out-of-scope for this cycle or lower priority
related:
  - .github/workflows/ci.yml
  - scripts/completion-check.sh
  - docs/testing.md
  - goals/_meta.md
---

# 품질 게이트 3중 누수 — CI 미실행, 원격 DB 테스트, shallow 성공 선언

## TL;DR

게이트 체계가 세 겹으로 새고 있다: (1) CI는 web 테스트·lint·typecheck를
전혀 돌리지 않고, (2) 로컬 테스트는 원격 공유 Supabase DB에 직접
write/delete하며, (3) `completion-check.sh`는 기본값으로 test/build를
건너뛰고도 "ALL GOALS ACHIEVED"를 선언한다. 테스트 자체 품질은 평균
이상이나 게이트 신호를 신뢰할 수 없는 상태.

## 현황 요약 (2026-06-10 실측)

| package | test files | source files | coverage 측정 | suite 실행 시간 |
|---|---|---|---|---|
| packages/cli | 11 | 17 | 없음 | 1.99s (142 tests pass) |
| packages/shared | 0 | 9 | 없음 | test script 자체 없음 |
| packages/web | 13 | 170 | 없음 | 5.9s (154 tests pass) |

## Body

### G1 — CI가 web 테스트를 전혀 실행하지 않음 (P0)

`.github/workflows/ci.yml:22` — `pnpm --filter argos-ai test`(CLI만).
web은 build만 수행(`:23`). web의 154개 테스트(RBAC, 비용 계산, ingest
응답 shape)가 CI에서 한 번도 돌지 않아 회귀가 main에 그대로 머지된다.
lint/typecheck 스텝도 전무 — `goals/_meta.gates.sh:36-41`에는 정의돼
있으나 ci.yml은 completion-check를 호출하지 않는다.

### G2 — 로컬 테스트가 원격 공유 Supabase DB에 write/delete (P0)

`packages/web/vitest.config.ts:14-40` — `.env.local`의 `DATABASE_URL`
(`aws-1-ap-northeast-2.pooler.supabase.com`)을 테스트에 주입.
`packages/web/src/lib/server/skill-aggregation.test.ts:120-132`와
`packages/web/src/lib/server/__fixtures__/skill-call-fixture.ts:224-247`가
`db.project.deleteMany` / `db.user.deleteMany` / `db.organization.deleteMany`
실행. 고정 ID(`wu6-test-project` 등)라 병렬 실행 충돌 위험, afterAll 실패
시 잔여물, 원격 왕복으로 felt-slow(아래 G8). DB 의존 테스트는
`DATABASE_URL` 부재 시 무음 skip(`skill-aggregation.test.ts:35`)이라 CI에
올려도 조용히 통과해버린다.

### G3 — completion-check.sh가 test/build를 skip하고 성공 선언 (P0)

`scripts/completion-check.sh:44` — `GATES_SKIP_DEEP="${GATES_SKIP_DEEP:-1}"`
기본값 1. 실측: `[M.3 test] ⊘ skipped`, `[M.4 build] ⊘ skipped` 후
`🎉 ALL GOALS ACHIEVED` 출력, exit 0. 에이전트가 이 신호를 완료 판정에
쓰면 깨진 테스트로 "완료"가 가능하다.

### G4 — 인증·보안 critical path 전체 미테스트 (P1)

테스트 0인 모듈: `packages/web/src/lib/server/{auth-actions,auth-helper,jwt,admin-auth,password-reset}.ts`,
`packages/web/src/middleware.ts`, `api/auth/` 하위 10개 route,
`api/admin/` 하위 5개 route(35개 API route 중 테스트 존재는 2개),
`packages/cli/src/lib/{auth-flow,api-client,config,inject-agent-hooks}.ts`.
토큰 발급·디바이스 인증 플로우·관리자 인증은 회귀 시 보안 사고로 직결.

### G5 — coverage 주장과 게이트 실체 불일치 (P1)

`goals/_meta.md` claim 3은 "coverage thresholds are met"라 주장하나
coverage 설정·패키지는 어디에도 없다(vitest config 2곳 grep 0건,
`@vitest/coverage-*` 미설치). `docs/testing.md:11`은 "커버리지 숫자는
지표가 아니다"라 선언 — 문서와 게이트 중 한쪽으로 일치시켜야 한다.

### G6 — @argos/shared 테스트 0 + test script 부재로 무음 통과 (P1)

`packages/shared/package.json` — scripts에 `test` 없음 →
`pnpm -r run test`가 조용히 건너뜀. CLI↔web 계약인 zod 스키마가 무보호.

### G7 — grep 기반 게이트의 과적합+미검증 양면 결함 (P2)

`goals/0-event-pipeline.gates.sh:53,80` — `grep -qE "case '${t}'"`로 소스
텍스트를 검사. switch→lookup map 리팩토링이면 동작 동일해도 fail(과적합),
`case 'TOOL_USE':`가 존재하기만 하면 매핑이 틀려도 pass(미검증).
`scripts/check-gate-rigor.sh:32,51`의 메타게이트도 반복 구문의 존재만
확인하는 형식적 검사. 또한 `packages/cli/src/lib/event-sender.test.ts:33-50`은
생성 스크립트의 정확한 문자열·indexOf 순서에 과적합 — 공백 하나로 깨진다.

### G8 — DB 연동 테스트 3종이 suite 시간 지배 (P2)

실측: `skills/route.test.ts` 3349ms, `daily-rollup.test.ts` 3514ms,
`skill-aggregation.test.ts` 4028ms (web vitest 4.94s 중; 나머지 10개 파일
합계 <200ms). 원인은 ap-northeast-2 Supabase 왕복 — G2 해결(로컬
Postgres)이 속도 문제도 함께 해결한다.

### G9 — CI 보강 항목 (P2)

- Prisma schema drift 검사 부재: `.github/workflows/ci.yml:17`은
  `prisma generate`만 실행. `prisma migrate diff --exit-code` 추가 필요.
- turbo 캐시 미활용: `ci.yml:18-23`이 turbo 대신 `pnpm --filter` 직접 호출.
- `dependency-review.yml:19` `continue-on-error: true`(사유 명시돼 있고
  OSV-Scanner가 blocking이라 위험 제한적이나, Dependency Graph 활성화 후
  제거 권장).
- `api/events/route.test.ts:35-58`은 DB 레이어 전체를 vi.mock —
  `docs/testing.md` 원칙 3("mock 대신 실물 또는 skip")과 모순. G2 해결 후
  ingest 통합 테스트 1~2개로 보완.

## Options / Recommendation

처리 순서 권장: **G2(테스트 DB 격리) → G1(CI에 test/lint/typecheck 추가,
postgres service container) → G3(shallow run의 성공 메시지/기록 구분)**.
G2 없이 G1을 먼저 하면 DB 테스트가 CI에서 무음 skip되어 가짜 안심만 는다.
vitest config에 `DATABASE_URL` localhost-allowlist 가드를 넣으면 원격 DB
오염을 구조적으로 차단할 수 있다(루트 `docker-compose.yml` 활용).

## Acceptance signal

- CI 로그에 `@argos/web test` 154개 테스트 실행 기록 + DB 테스트가 skip이
  아닌 pass로 표시.
- `grep "pooler.supabase.com" packages/web/vitest.config.ts` 경로로 원격
  접속이 불가능함(allowlist 가드 존재).
- `GATES_SKIP_DEEP=1 bash scripts/completion-check.sh` 출력에 "ALL GOALS
  ACHIEVED" 대신 shallow-pass 구분 문구.

## Resolution

**G2** (`packages/web/vitest.config.ts`): DATABASE_URL allowlist 가드 추가. localhost/127.0.0.1 이외의 호스트를 가리키면 프로세스를 exit(1)로 종료해 원격 Supabase DB에 대한 테스트 실행을 구조적으로 차단.

**G1** (`.github/workflows/ci.yml`): postgres:16-alpine service container 추가, `DATABASE_URL=postgresql://argos:argos@localhost:5432/argos` 환경변수 설정. `pnpm -r run typecheck`, `pnpm -r run lint`, `prisma migrate deploy`, `pnpm --filter @argos/web test` 스텝 추가.

**G3** (`scripts/completion-check.sh`): `GATES_SKIP_DEEP=1` 시 "ALL GOALS ACHIEVED" 대신 "[SHALLOW PASS — deep gates skipped]" + exit 1 반환으로 수정. 에이전트가 shallow pass를 완료 신호로 오인하는 경로 차단.
