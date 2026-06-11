# Argos 저장소 건강 리포트

작성: 2026-06-12, 기준 브랜치: `agent/spike-1-202606111805` (main 분기점 8db3347)

## 1. 개요

Argos는 팀 단위 Claude Code/Codex 사용량 분석 플랫폼이다. 개발자 머신의 에이전트 hook 이벤트를 수집해 토큰 소비·비용·스킬/에이전트 호출·세션 타임라인을 조직 대시보드로 보여준다. `packages/cli`(npm 패키지 `argos-ai`)는 Claude Code의 `.claude/settings.json`과 Codex의 `.codex/hooks.json`에 hook을 주입하고(`packages/cli/src/lib/inject-agent-hooks.ts`), hook 발화 시 transcript를 파싱해 `POST /api/events`로 전송한다(`packages/cli/src/commands/hook.ts`). `packages/web`은 Next.js 15 대시보드 + API로, 별도 API 서버 없이 33개 Route Handler(`packages/web/src/app/api/**/route.ts`)가 수집·인증·집계를 전부 담당하며 Prisma로 PostgreSQL(Supabase)에 적재한다. `packages/shared`는 둘 사이의 와이어 계약 — zod 스키마(`src/schemas/`), 타입(`src/types/`), 모델 단가표(`src/constants/pricing.ts`) — 를 담는 순수 라이브러리다.

## 2. 스택과 구조

- **모노레포**: pnpm 9.15.4 workspace + turbo 2 (`pnpm-workspace.yaml`, `turbo.json`). 패키지 3개: `shared`(zod만 의존), `cli`(commander/inquirer/chalk/ora, `@argos/shared`는 **devDependency** — 배포 번들에 없으므로 type-import만 허용, `packages/cli/eslint.config.mjs`의 `no-restricted-imports`로 강제), `web`(Next 15, React 19, Prisma 6, next-auth 5.0.0-beta.30 고정, jose, recharts, tailwind 4).
- **데이터 흐름**: hook stdin → CLI가 transcript JSONL 파싱(`cli/src/lib/transcript.ts`, `transcript-codex.ts`) → `IngestEventSchema`(`shared/src/schemas/events.ts`) 검증 → `web/src/app/api/events/route.ts`(311줄)에서 세션 upsert + 사용량 적재 → `daily-rollup.ts`(707줄)가 일 단위 캐시 집계(`DailyProjectStat`) → 대시보드 라우트가 조회.
- **인증 3계층**: 웹 세션(next-auth Credentials, `web/src/auth.ts`) / CLI 토큰(1년 JWT HS256 + `CliToken` 테이블 SHA-256 해시 revocation, `web/src/lib/server/jwt.ts`·`auth-helper.ts`, ADR-004) / admin(HMAC 서명 쿠키, `web/src/lib/server/admin-auth.ts`). 환경변수는 `web/src/lib/server/env.ts`에서 zod로 기동 시 검증(JWT_SECRET ≥32자 등).
- **빌드/배포**: CLI는 npm publish(`tsc -p tsconfig.build.json` + shebang 주입). web은 Vercel(`vercel.json`: `pnpm turbo build --filter=@argos/web`, region icn1) — 마이그레이션은 빌드에서 분리(`docs/deploy-migration-separation.md`). CI(`.github/workflows/ci.yml`)는 postgres:16 서비스 컨테이너 위에서 install → prisma generate → shared/cli 빌드 → typecheck → lint → cli test → migrate → web test → web build 순.
- **DB**: `web/prisma/schema.prisma` 14개 모델(Organization/User/OrgMembership/Project/ProjectMember/ClaudeSession/Event/Message/UsageRecord/DailyProjectStat/CliAuthRequest/OnboardToken/PasswordResetToken/CliToken).

## 3. 테스트 현황

테스트 러너는 전 패키지 vitest 3.2.6, node 환경, `src/**/*.test.ts` 콜로케이션(`docs/testing.md` 정책: 순수 로직 단위 테스트 우선, DB는 mock 대신 실물-또는-skip).

| 패키지 | 이번 작업 전 | 이번 작업 후 | 비고 |
|---|---|---|---|
| `packages/shared` | **0 파일 / 0개** (vitest 미설치, `pnpm -r test`에서 통째로 누락) | 4 파일 / 34개 | vitest 신규 셋업 |
| `packages/cli` | 11 파일 / 142개 | 12 파일 / 149개 | `config.test.ts` 추가 |
| `packages/web` | 13 파일 / 154개 | 15 파일 / 177개 (DB 없으면 13개 skip) | `jwt.test.ts`, `admin-auth.test.ts` 추가 |

**커버 영역**
- cli: transcript 파싱(Claude/Codex), event-sender, project config 탐색, 커맨드 5종(`src/__tests__/`), API URL override 정규화(신규).
- web: 비용 계산(`cost.test.ts`), RBAC(`rbac.test.ts`), 프로젝트 이관(`project-actions.test.ts`), 주간 리포트·일별 롤업 순수부, 이벤트 파생(`events.test.ts`), 슬래시 커맨드/타임라인 파싱, CLI JWT 서명·검증(신규), admin HMAC 쿠키·임퍼스네이션 토큰(신규).
- shared(전부 신규): 모델명 정규화 규칙·단가표 불변식(`pricing.test.ts`), CLI↔web 와이어 계약(`schemas/events.test.ts` — hookEventName enum, usage 필드, title 500자/summary 10000자 경계, unknown-key strip), 인증/프로젝트 요청 스키마 경계.

**남은 구멍 (큰 것부터)**
- 33개 API 라우트 중 라우트 레벨 테스트는 2곳뿐(`api/events/route.test.ts` — DB 전층 mock, `dashboard/skills/route.test.ts` — DB 없으면 skip). admin 5종, `auth/cli-request·cli-poll·cli-callback·exchange`, `middleware.ts`는 0.
- `auth-helper.ts`의 requireAuth 토큰 캐시(60초 TTL, 500개 LRU-ish eviction, `auth-helper.ts:10-38`)는 무테스트.
- `dashboard/agents·sessions/route.ts`의 `$queryRaw` CTE 무테스트.
- web의 `format.ts`, `slug.ts`, `session-files.ts`, `password-reset.ts`, cli의 `api-client.ts`(10초 타임아웃 fetch 래퍼), `auth-flow.ts` 무테스트.
- 컴포넌트/UI 테스트는 전무(환경이 node 고정, 정책상 수동 확인 영역).

**기존 테스트 수정 없음.** 실행이 깨져 있는 기존 테스트도 없었다(전 스위트 통과 확인).

## 4. 리스크 상위 5

1. **높음 — 인증·관리자 라우트가 사실상 무방비.** `api/admin/{login,logout,impersonation,users,password-reset-links}`와 CLI 로그인 플로우 라우트(`auth/cli-request → cli-poll → cli-callback`, `auth/exchange`)에 테스트가 없다. 특히 `auth-helper.ts:9-12`의 in-memory 토큰 캐시는 "revoke 후 최대 60초 유효"라는 의도된 트레이드오프를 코드 주석으로만 들고 있어, 캐시 키/eviction 로직 회귀 시 폐기된 토큰이 무기한 통과해도 잡을 그물이 없다. 터지는 시나리오: 유출 토큰을 admin이 revoke했는데 캐시 버그로 이벤트 적재가 계속 허용됨. (이번 작업으로 하위 계층인 `jwt.ts`·`admin-auth.ts`는 고정했으나 라우트 통합 레벨은 여전히 빈칸.)
2. **높음 — `$queryRaw` 대시보드 집계의 스키마 드리프트.** `dashboard/agents/route.ts`, `dashboard/sessions/route.ts`가 window-function CTE 원시 SQL을 쓴다(ADR-025 의도적 선택). Prisma 마이그레이션으로 컬럼명이 바뀌어도 typecheck가 못 잡고 런타임 500으로만 드러난다. `skills/route.ts`는 테스트가 있지만 로컬 DB가 없으면 skip이라 동일 노출.
3. **중간 — DB 의존 테스트의 조용한 skip.** `daily-rollup.test.ts`·`skill-aggregation.test.ts`·`skills/route.test.ts` 13개 케이스는 `DATABASE_URL` 미설정 시 skip된다(이 워크트리에서도 skip 확인). 로컬에서 전부 녹색으로 보여도 핵심 집계(UTC 자정 경계 캐시 무효화 — 94ff630에서 고친 B1 회귀 포함)는 CI postgres에서만 검증된다. 개발자가 로컬 녹색을 믿고 push하면 CI에서야 터지거나, CI 환경 차이로 영영 안 잡힌다.
4. **중간 — 만료 시크릿 영구 잔존 + 무한 성장 테이블.** `CliAuthRequest`/`OnboardToken`/`PasswordResetToken`/`CliToken`(revoked)은 `expiresAt`/`revokedAt`만 있고 삭제 경로가 없다 — `vercel.json`에 cron 없음, `web/scripts/`에도 정리 스크립트 없음. 시나리오: 토큰 해시가 수년치 쌓이며 테이블 스캔 비용 증가 + 시크릿 유출 면적 확대 (`docs/findings/` D6).
5. **중간 — 빌드·배포 설정 드리프트 3종.** (a) 루트 `vercel.json`과 `packages/web/vercel.json`이 byte-identical 복제라(diff로 확인) 한쪽만 고치면 어느 쪽이 적용되는지에 따라 조용히 갈라진다. (b) `turbo.json:8-17`의 build env 목록에 미사용 `AUTH_GITHUB_ID/SECRET`이 있고 `.env.example`의 공개 URL 계열은 빠져 있어 환경변수 변경이 캐시 미스/스테일 빌드로 이어질 수 있다. (c) `eslint-config-next@^16.2.3` vs `next@15` 메이저 불일치(`web/package.json`)로 v16 기준 규칙이 v15 앱에 적용된다.

**테스트 작성 중 발견한 버그성 동작 (수정하지 않고 테스트로 고정):**
- `admin-auth.ts:104-121` — 임퍼스네이션 토큰의 userId에 `.`이 들어가면 토큰이 6분절이 되어 `createAdminImpersonationToken`은 성공하는데 `verifyAdminImpersonationToken`이 항상 null을 돌려준다(라운드트립 파괴). 현재 userId는 cuid라 실해는 없지만, `env.ts:11-14`가 `ADMIN_USERNAME`의 `.`을 막아둔 것과 달리 이쪽은 생성 시점 가드가 없다. ID 포맷 변경 시 임퍼스네이션 전체가 조용히 실패한다. → `web/src/lib/server/admin-auth.test.ts`의 `// TODO(bug):` 케이스로 고정. 심각도 낮음.

## 5. 부채와 빠른 개선 기회

| 항목 | 크기 | 근거 |
|---|---|---|
| 만료 토큰 정리 cron 1개 추가 (`vercel.json` crons + 삭제 route) | S | 리스크 4. `expiresAt < now` deleteMany 4줄 |
| `vercel.json` 중복 제거 (한쪽을 단일 소스로) | S | 리스크 5a |
| `turbo.json` build env 목록 실사용 기준으로 정리 | S | 리스크 5b, `web/src/lib/server/env.ts`의 실제 키와 대조 |
| `eslint-config-next`를 next 15 라인으로 다운핀 | S | 리스크 5c |
| `weekly-report.ts:383-384`의 deprecated `aggregateSummary(rollups, 10)` 호출을 options 객체로 | S | `daily-rollup.ts`의 `@deprecated` 오버로드가 호출부 2곳 때문에 못 죽음 |
| `shared/package.json:7-13` exports 조건 순서(`require`가 `import`보다 앞) — vitest/esbuild가 매 실행 경고 | S | 이번 테스트 실행 로그에서 확인. `import`를 앞으로 |
| `docs/code-architecture.md`의 존재하지 않는 `packages/api` 서술 갱신 | S | 신규 기여자 온보딩 오도 |
| `dashboard/agents·sessions` `$queryRaw`에 skip-가능 통합 테스트 추가 | M | 리스크 2. `skills/route.test.ts` 패턴 재사용 |
| `api/events/route.test.ts`를 DB 전층 mock에서 실물-DB(skip 가능) 패턴으로 | M | `docs/testing.md` 원칙 3("목 대신 실물 또는 skip")과 정면 충돌 중 |
| `shared/src/schemas/events.ts` ↔ `src/types/events.ts` 수동 중복을 `z.infer`로 단일화 | M | 두 정의가 갈라지면 컴파일은 통과하고 런타임 계약만 깨짐 |
| `daily-rollup.ts`(707줄) 순수 집계부/DB부 분리 | L | 최대 단일 파일, UTC 경계·캐시 무효화·집계가 한 파일에 |

## 부록 — 이번 작업의 판단 기록

- **shared vitest 셋업은 cli 패턴을 복제**: `vitest.config.ts`(cli와 동일 최소 구성), `tsconfig.build.json`으로 테스트를 빌드에서 제외하고 build 스크립트를 `tsc` → `tsc -p tsconfig.build.json`으로 변경. dist 산출물에 테스트가 포함되지 않음을 빌드 후 확인했고(0개), `pnpm --filter argos-ai build`로 하류 소비자 빌드도 검증. 앱 동작 변경 없음 — 기능 코드는 한 줄도 수정하지 않았다(테스트·설정 파일 신규 추가 + `shared/package.json` 스크립트/devDep만).
- **cli 추가 1곳 = `normalizeApiUrl`**: config override 유지/폐기 판단이 이벤트 송신 목적지를 결정하는 유일한 순수 로직 무방비 지점이라 선정. 나머지 미테스트 파일(api-client, auth-flow)은 네트워크/대화형 I/O라 정책상 단위 테스트 부적합.
- **web 추가 2곳 = `jwt.ts` + `admin-auth.ts`**: 보안 코어이면서 순수(crypto only)라 정책 적합. `auth-helper.ts`도 후보였으나 DB mock이 필요해 정책(원칙 3)과 충돌, 라우트 통합 테스트 몫으로 남김(리스크 1에 기록).
- **기존 테스트 무수정**, 전 스위트 통과: shared 34 / cli 149 / web 164(+13 DB-skip), `pnpm typecheck`·`pnpm lint` 4/4 성공.
