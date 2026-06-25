# Argos 저장소 건강 리포트

> 최초 작성: 2026-06-12 (`agent/spike-3-202606111837`).
> 최종 갱신: 2026-06-26 일일 스캔 (`agent/2026-06-25-001`, 백로그 #17) — spike#3 이후
> 7개 커밋(`7241f61..HEAD`, 인증/회원가입/에러처리 중심)을 반영해 R4·§2·§3·§5를 갱신했다.
> 모든 경로는 저장소 루트 상대 경로다.

## 1. 개요

Argos는 **Claude Code / Codex 팀을 위한 사용 분석 대시보드**다 — 세션·토큰·스킬/서브에이전트 호출을 수집해 조직 단위로 시각화한다 (`README.md`, `docs/`). pnpm + turborepo 모노레포로 3개 패키지로 구성된다: **`packages/cli`**(npm 패키지 `argos-ai`)는 개발자 머신에서 `.claude/settings.json`/`.codex/hooks.json`에 훅을 주입하고 훅 이벤트·transcript를 파싱해 API로 전송한다. **`packages/web`**(`@argos/web`)은 Next.js 15 대시보드이자 ingestion API(`src/app/api/events/route.ts`)를 겸하는 풀스택 앱으로 Vercel(icn1)에 배포된다. **`packages/shared`**(`@argos/shared`)는 양쪽이 공유하는 zod 스키마·타입·모델 단가표(`src/constants/pricing.ts`)만 담은 런타임 의존성 없는 패키지다. 참고: `docs/code-architecture.md`는 별도 `packages/api`(Hono/Railway)를 서술하지만 실제 저장소에는 존재하지 않는다 — web이 API 역할을 직접 수행하며, 문서가 현실과 어긋나 있다(§5 부채).

## 2. 스택과 구조

- **언어/런타임**: TypeScript strict (`tsconfig.base.json`: ES2022, NodeNext), Node ≥18 (CLI `engines`).
- **web**: Next.js 15 + React 19, Prisma 6 + PostgreSQL(Supabase), next-auth 5.0.0-beta.30(고정 핀), jose JWT, Tailwind 4, recharts. 데이터 모델은 `packages/web/prisma/schema.prisma` — Organization/User/OrgMembership(RBAC 4단계)/Project/ClaudeSession/Event/UsageRecord/Message/DailyProjectStat(일별 rollup 캐시) 등 11개 모델, 조회 패턴별 복합 인덱스 구비.
- **cli**: commander 12 + @inquirer/prompts, 의존성 주입 컨테이너(`src/deps.ts` → `src/adapters.ts`) 패턴으로 커맨드가 외부 효과를 인터페이스로 받음 — 테스트 용이성의 핵심.
- **shared**: zod 3 단일 의존. `dist/`를 빌드해 web/cli가 import (turbo `^build` 의존으로 순서 보장).
- **빌드/배포 체인**: `turbo.json`(build는 `^build` 의존) → web은 Vercel(`vercel.json`: `pnpm turbo build --filter=@argos/web`, 리전 icn1), cli는 npm publish(`.claude/skills/publish-cli`), CI는 `.github/workflows/ci.yml`(postgres 서비스 → install → prisma generate → shared/cli build → typecheck/lint → cli test → **schema/migration drift 감지** → migrate → web test → web build).
- **2026-06-26 갱신 — 최근 변경점**: ① CI에 `prisma migrate diff --from-migrations --to-schema-datamodel --exit-code` step 추가(`ci.yml`, commit 32e35c0) — schema.prisma만 고치고 migration 파일을 빼면 CI가 실패한다(CLAUDE.md "DB 스키마 변경 절차" 강제). ② `signJwt`가 `setJti(randomBytes(16))`로 토큰마다 고유 jti를 넣어, 같은 초에 동일 user로 두 번 발급 시 sha256 hash가 충돌해 `CliToken.tokenHash` UNIQUE 위반(500)이 나던 버그를 해소(`packages/web/src/lib/server/jwt.ts`, commit 9d2221e). ③ `registerUser`가 user+cliToken 생성을 `db.$transaction`으로 묶어 orphan user를 방지(`auth-actions.ts`, commit e809975).
- **루트의 `cc-test/ cycles/ goals/ iterations/ persuasion-data/ prompts/ tasks/ scripts/`**: 제품 코드가 아니라 자율 에이전트 하네스 산출물/드라이버다. CI 파이프라인에는 연결되어 있지 않다.

## 3. 테스트 현황

실행: `pnpm -r test` (vitest 3.2.6, 전 패키지 통일). 2026-06-26 스캔 시점 실측: **shared 42 / cli 149 / web 193 pass + 13 skip(206)** 전부 green.

| 패키지 | spike#3 후 | 2026-06-26 스캔 후 | 비고 |
|---|---|---|---|
| `packages/shared` | 42개 (4 파일) | **42개** (4 파일) | 변경 없음 (해당 패키지 소스 무변경) |
| `packages/cli` | 149개 (12 파일) | **149개** (12 파일) | 변경 없음 |
| `packages/web` | 198개 (15 파일, DB의존 13개는 로컬 Postgres 없으면 skip) | **206개** (16 파일) | +8 (`error-helper.test.ts`) |

> **2026-06-26 스캔의 테스트 보강 판단 (결정 018)**: spike#3 이후 변경은 인증/회원가입/에러처리에 집중됐다. 그중 순수 단위 테스트가 가능하고 *깨지면 의미 있는* 곳은 단 한 곳 — `error-helper.ts`(commit 0aece9f에서 도입/변경, 무방비)였다. `registerUser`(`$transaction`)·`signJwt`(jti)·`register/route.ts`는 모두 DB/`server-only`/네트워크 통합 지점이라 단위 목 테스트가 프로젝트 테스트 전략상 부적합하다. 따라서 이번 스캔은 `error-helper.test.ts` 1파일(8개)만 추가했고, 그 외 영역은 의도적으로 0개 추가했다.

### packages/shared — 신규 셋업
- 추가: `vitest.config.ts`, `package.json`에 `test` 스크립트 + vitest devDep, `tsconfig.build.json`(테스트 파일을 dist 빌드에서 제외 — cli의 기존 패턴 동일 적용, build 스크립트가 `tsc` → `tsc -p tsconfig.build.json`로 변경됨. dist 산출물은 동일).
- 커버: `constants/pricing.test.ts`(19 — `normalizeModelName` 날짜 suffix/구분자 정규화·prefix fallback 우선순위·default fallback, `getModelPricing` 단가 매핑), `schemas/events.test.ts`(10 — `IngestEventSchema` 필수 필드·enum·길이 경계·unknown key strip), `schemas/auth.test.ts`(6), `schemas/project.test.ts`(7 — `TransferProjectSchema` trim+regex).
- 남은 구멍: `src/types/*`는 타입 선언만이라 테스트 대상 없음. 구멍 아님.

### packages/cli — 기존 충실, 핵심 플로우 커버
- 기존: 커맨드 4종 플로우(`__tests__/default-command` 등), transcript JSONL 파싱(claude/codex), event-sender self-heal 락/race, hooks-inject 멱등성 — 잘 짜여 있음.
- 이번 추가: `src/lib/config.test.ts` — `normalizeApiUrl`(셀프호스트 override 판정: 기본 호스트 억제, 유사 도메인 통과, malformed URL fallback). 이 함수는 모든 API 호출의 목적지를 결정하는데 무방비였다.
- 남은 구멍: `src/lib/api-client.ts`(에러 JSON 파싱), `src/lib/auth-flow.ts`(OAuth 폴링 루프) — 네트워크 통합 지점이라 단위 목 테스트는 프로젝트 테스트 전략(`.claude/skills/test-strategy`: 통합 지점은 목으로 대체하지 않음)상 부적합. 계약 테스트 또는 E2E가 필요(§5).

### packages/web — 집계 로직 커버, 날짜·포맷팅이 무방비였음
- 기존: cost 계산, RBAC, rollup 집계(`daily-rollup.test.ts`), 이벤트 derive, API 응답 계약 등 154개. DB 의존 13개(`skill-aggregation.test.ts` 등)는 `DATABASE_URL` 미설정 시 skip — 로컬 기본 실행/CI postgres에서만 풀 실행.
- 이번 추가 ①: `src/lib/server/week-range.ts` **신규 분리** — `weekly-report.ts`는 `import 'server-only'`라 vitest에서 import 불가(기존 `weekly-report.test.ts` 주석에 명시된 제약). 순수 주차 계산(`getWeekRangeForDate`/`parseWeekParam`/`formatWeekLabel`)만 분리하고 `weekly-report.ts`가 re-export하여 호출자(`api/orgs/[orgSlug]/reports/route.ts`) 무변경. 동작 동일성은 golden/경계/roundtrip 21개 테스트로 고정.
- 이번 추가 ②(spike#3): `src/lib/format.test.ts` — 사용자에게 직접 보이는 토큰/비용/시간 포맷터 23개 (TZ 비의존 분기만; 로컬 시간 렌더링은 브라우저 TZ 의존이 의도된 동작).
- **2026-06-26 추가**: `src/lib/server/error-helper.test.ts`(8개) — `jsonError`(문서화된 `{ error: { code, message } }` 계약)와 `handleRouteError`. 핵심은 **zod duck-typing fallback**(번들에서 zod 인스턴스가 갈려 `instanceof`가 실패할 때 `name==='ZodError'`로 잡는 load-bearing 분기 — 깨지면 모든 검증 에러가 조용히 400→500으로 바뀐다)과 **500 응답의 원본 메시지 비누설**을 고정. `server-only`는 `events.test.ts`와 동일하게 `vi.mock`. `handleRouteError(null)`이 throw하는 회귀(R4 참조)는 `TODO(bug)`로 현재 동작을 고정했다.
- 남은 구멍: `lib/server/admin-auth.ts`(쿠키 서명 파싱 — `server-only`+env 의존, 분리 필요), `auth-actions.ts`/`password-reset.ts`(TTL 경계), `jwt.ts`, `slug.ts`, `dashboard.ts`의 `parsePagination`, `api-client.ts`, `session-files.ts`.
- **기존 테스트 수정: 없음** (전부 원형 유지).

## 4. 리스크 상위 5

### R1. 주간 리포트 날짜 로직의 서버 타임존 의존 — **높음**
`packages/web/src/lib/server/week-range.ts`의 `getWeekRangeForDate`는 date-fns `startOfISOWeek`(로컬 타임존 기준) 결과를 `toUtcMidnight`로 변환한다. 프로덕션(Vercel)·CI는 TZ=UTC라 정상이지만, **UTC가 아닌 환경에서 실행하면 주 시작일이 하루 어긋난다** (예: KST에서 월요일 00:00 UTC 입력 → 일요일 시작 범위 반환). 셀프호스트 사용자가 TZ=Asia/Seoul 서버에 올리는 순간 모든 주간 리포트가 틀어진다. 추가로 `parseWeekParam`은 52주뿐인 해에 `?week=2025-W53`을 받으면 null이 아니라 **조용히 다음 해 W01 범위를 반환**한다(입력 isoKey ≠ 반환 isoKey). 두 동작 모두 `week-range.test.ts`에 `TODO(bug)` 주석과 함께 현재 동작 기준으로 고정해 두었다.

### R2. CLI 토큰 평문 저장 + 1년 만료 JWT 조합 — **높음**
`packages/cli/src/lib/config.ts:54-63` — Bearer 토큰을 `~/.argos/config.json`에 평문 저장하며 파일 모드 제한(0600)도 없다. 한편 API 토큰은 1년 만료(`docs/findings/2026-06-10T0340-architecture-unintuitive.md` R3 — **의도적 미해결/연기** 상태)다. 시나리오: 백업·동기화 도구나 동일 계정의 다른 프로세스가 config.json을 읽으면, 탈취 토큰이 최장 1년간 유효하다. `logout`의 서버측 revoke(`CliToken.revokedAt`)가 있으나 탈취를 인지해야만 작동한다.

### R3. 비용 산술의 float 누적 — **중간**
`packages/web/src/lib/server/cost.ts:24-29`(`(tokens / 1_000_000) * pricePerM` float 곱), `daily-rollup.ts:293,308`(`Number(u.cost_usd ?? 0)` 후 일별 합산), `getDailyRollupsForProjects`의 `prev.estimatedCostUsd += r.estimatedCostUsd` 반복 가산. 시나리오: 수개월 × 다수 프로젝트 합산 시 표시 비용과 원본 레코드 합 사이에 센트 단위 불일치 → 비용 대시보드 신뢰 하락. 단가 자체는 이번에 `packages/shared/src/constants/pricing.test.ts`로 고정했지만, 누적 오차는 decimal 처리 없인 남는다.

### R4. 에러 응답 규격이 절반만 통일됨 + 에러 핸들러 자체의 null-deref 회귀 — **중간**
2026-06-26 갱신: commit 0aece9f가 `jsonError(code, message, status)` 헬퍼를 추가하고 CLAUDE.md에 `{ error: { code, message } }`를 **표준으로 문서화**했지만, **실제로 마이그레이션된 라우트는 회원가입(`api/auth/register/route.ts`) 하나뿐이다.** `exchange`·`cli-poll`·`cli-callback`·`me`·`projects/*`·`admin/*`·`orgs/*`·`dashboard/sessions/*`·`members/*`·`reports`·`password-reset/*`·`events`·`auth-helper.ts`·`dashboard-route-helper.ts`·`rbac.ts`·`admin-auth.ts` 등 **30곳 이상이 여전히 `{ error: '문자열' }`(일부는 `{ error, message }`, 일부 한국어 메시지)을 그대로 반환**한다(grep: `NextResponse.json({ error:`). 즉 클라이언트는 두 가지 shape을 모두 처리해야 하는데, `register/page.tsx`만 새 shape(`data.error?.message`)을 읽도록 바뀌었다 — **문서화됐지만 강제되지 않는 규약**이 됐다(린트/CI 가드 없음).

추가로 **신규 회귀**: `handleRouteError`의 구조화 로깅이 `(err as Record<string, unknown>).code`로 prismaCode를 읽는데(`error-helper.ts:20`), `err`가 `null`/`undefined`면 이 줄에서 `TypeError`를 던진다 — 500 핸들러 자신이 터진다. 이전 구현 `console.error('Error:', err)`은 null-safe였다. `throw null`이나 값 없는 `Promise.reject()`가 라우트에서 발생하면 구조화된 500 대신 미처리 예외가 된다. `error-helper.test.ts`에 `TODO(bug)`로 현재(throw) 동작을 고정해 두었다. 문자열/객체 throw는 안전하므로 발생 빈도는 낮으나 핸들러 자체의 견고성 결함이다.

기존 Q1~Q3(`docs/findings/2026-06-10T0340-code-quality-issues.md`)도 **여전히 미해결**: ② `dashboard-route-helper.ts:29-33`이 `message === 'Project not found'` 문자열 비교로 분기하고 그 외 모든 예외(DB 타임아웃 포함)를 403으로 뭉갬(Q2, 코드 확인됨), ③ `api/events/route.ts` ingestion silent catch — 토큰/메시지 유실 무관측(Q3). 시나리오: DB 장애가 "권한 없음"으로 위장되어 디버깅 비용 폭증 + 데이터 유실을 아무도 모름.

### R5. Claude Code transcript 포맷 가정의 조용한 드리프트 — **중간**
`packages/cli/src/lib/transcript.ts`는 transcript JSONL의 type 문자열(`'queue-operation'` 등)과 content 형태를 하드코딩으로 가정하고, 안 맞는 줄은 per-line try/catch로 **조용히 버린다**. `commands/hook.ts`의 agent 감지도 `transcript_path`에 `/.codex/` 포함 여부 휴리스틱이다. 시나리오: Claude Code/Codex가 transcript 스키마를 바꾸면 에러 없이 토큰·메시지 수집량만 줄어들고(훅은 항상 exit 0), 대시보드 수치가 무증상으로 부정확해진다. 기존 테스트(`transcript.test.ts` 24개 등)가 현재 포맷은 고정하지만 포맷 버전 감지/관측 수단이 없다.

추가로 기록 (상위 5 미만): `packages/web/src/lib/format.ts:70-77` `formatRelativeTime`은 timestamp가 base보다 빠르면 `"+-1m"` 같은 비정상 문자열을 렌더한다 — `format.test.ts`에 `TODO(bug)`로 고정. 같은 파일의 `formatTokens(999_999) → "1000.0K"`, `formatDurationMs(59_999) → "60s"` 경계 quirk도 동일하게 고정해 두었다.

## 5. 부채와 빠른 개선 기회

| # | 항목 | 크기 | 근거 |
|---|---|---|---|
| 1 | `docs/code-architecture.md`가 존재하지 않는 `packages/api`(Hono/Railway)를 서술 — 문서를 현실(web=API)로 갱신 | **S** | 신규 기여자 온보딩 오도 |
| 2 | `@argos/shared` `package.json` exports에서 `types` 조건이 `import`/`require` 뒤라 dead — vitest/esbuild가 빌드마다 경고 (`packages/shared/package.json:7-13`) | **S** | `types`를 첫 조건으로 이동만 하면 됨 |
| 3 | `parseWeekParam` W53 overflow를 null 반환으로 수정 + `formatRelativeTime` 음수 diff 처리 (테스트의 `TODO(bug)` 2건 해소) | **S** | R1, R5 보충; 테스트가 이미 있어 수정 안전 |
| 4 | CLI hook.ts 도달 불가 SubagentStop 분기 삭제 (`docs/findings/...code-quality-issues.md` Q4) | **S** | dead code |
| 5 | `~/.argos/config.json` 생성 시 `mode: 0o600` 지정 (`packages/cli/src/lib/config.ts:62`) | **S** | R2 완화 1단계 |
| 6 | **남은 30+곳을 `jsonError`로 마이그레이션** + 문자열 분기 제거(Q1/Q2). 헬퍼·문서는 이미 있으니 잔여 호출부 치환 + `{ error: '문자열' }` 금지 린트 규칙 추가가 핵심 | **M** | R4 해소 (절반 완료) |
| 6b | `handleRouteError`의 `(err).code` 접근을 null-safe로(`err && typeof err === 'object' ? err.code : undefined`). `error-helper.test.ts`의 `TODO(bug)` 1건 해소 | **S** | R4 null-deref 회귀 |
| 6c | `registerUser`(인라인 토큰 발급)와 `issueAuthResultForUser`의 중복 제거 — `$transaction`을 받도록 `issueAuthResultForUser(tx, ...)` 시그니처 통일. 현재 토큰 발급 로직이 두 군데로 갈려 한쪽만 바뀌면 회원가입 경로가 누락된다 | **S** | `auth-actions.ts` 유지보수 함정 |
| 7 | `admin-auth.ts` 쿠키 파싱·`auth-actions.ts`/`password-reset.ts` TTL 경계를 순수 함수로 분리 후 단위 테스트 (week-range 분리와 동일 수법) | **M** | 보안 게이트 무방비 |
| 8 | 비용 집계를 정수 마이크로달러 또는 decimal로 전환 | **M** | R3 해소; UsageRecord 스키마 변경 수반 |
| 9 | ingestion 경로 관측성: silent catch에 구조화 로그/메트릭 추가 (Q3) + transcript 포맷 버전 감지 | **M** | R4·R5 완화 |
| 10 | CLI→API 계약 테스트 (실 서버 또는 스키마 기반) — `api-client.ts`/`auth-flow.ts`의 본질적 커버리지 | **L** | 목 없이는 단위 테스트 불가한 영역 |

## 부록: 2026-06-26 일일 스캔 (백로그 #17) 판단 기록

- **기능 코드 변경 0건.** 이번 스캔은 리포트 갱신 + 테스트 1파일 추가만 했다. 앱 동작은 건드리지 않았다.
- **테스트는 8개만 추가** (`error-helper.test.ts`). 결정 018("깨지면 의미 있는 곳에만, 없으면 0개도 완주")에 따라 spike#3 이후 변경분(`7241f61..HEAD`)을 전수 검토한 결과, 단위 테스트로 *깨질 가치*가 있고 무방비였던 곳은 `error-helper.ts` 한 곳뿐이었다. 이유: (a) `handleRouteError`의 zod duck-typing fallback은 깨지면 모든 검증 에러가 조용히 500이 되는 load-bearing 로직, (b) 500 비누설은 보안 계약, (c) `{ error: { code, message } }`는 클라이언트가 파싱하는 문서화된 계약. 나머지 변경(`registerUser` `$transaction`, `signJwt` jti, `register` 라우트/페이지)은 DB·`server-only`·네트워크 통합 지점이라 프로젝트 테스트 전략상 단위 목 테스트가 부적합 — 0개 추가가 정답이었다.
- **새로 발견해 고치지 않고 고정/기록한 버그 1건**: `handleRouteError(null)` null-deref(R4). 임무 규칙대로 고치지 않고 현재 동작(throw)을 `TODO(bug)`로 고정 + R4·debt 6b에 기록.
- **자가 검증 통과**: `pnpm install`(lockfile 무변경 — 신규 의존 없음, `vi.mock`만 사용), `pnpm --filter @argos/shared build`, `pnpm -r test`(shared 42 / cli 149 / web 193+13skip 전부 green), `pnpm typecheck`(4/4, 신규 타입 에러 0).
- 기존 테스트 파일은 한 글자도 수정하지 않았다.

## 부록: spike#3(2026-06-12) 작업 판단 기록

- **기능 코드 변경은 1건뿐**: `packages/web/src/lib/server/weekly-report.ts`의 순수 주차 함수를 `week-range.ts`로 이동(잘라내기+re-export, 로직 무수정). `server-only` import 때문에 분리 없이는 테스트가 불가능했고, 동작 동일성은 21개 테스트(golden path·경계·roundtrip)로 증명했다. 호출자 2곳(`weekly-report.ts` 내부, `reports/route.ts`)은 기존 import 경로 그대로 동작한다.
- `packages/shared`의 build 스크립트를 `tsc` → `tsc -p tsconfig.build.json`로 변경한 것은 테스트 파일이 `dist/`에 컴파일되어 패키지 산출물에 섞이는 것을 막기 위함이다. `packages/cli`가 이미 쓰는 패턴(`packages/cli/tsconfig.build.json`)을 그대로 따랐고, 테스트 제외 외 빌드 옵션 변화는 없다.
- 버그로 보이는 동작 3건(W53 overflow, TZ 의존, `"+-1m"`)은 **고치지 않고** 현재 동작 기준으로 테스트에 `TODO(bug)` 주석과 함께 고정했다 (임무 규칙 준수).
- 기존 테스트 파일은 한 글자도 수정하지 않았다.
- `pnpm-lock.yaml` diff가 커 보이는 것(±약 985줄)은 vitest 추가 외에 pnpm이 lockfile을 재작성하며 모든 resolution 항목의 중복 `tarball:` URL 필드를 제거했기 때문이다(integrity 해시는 전부 유지 — `--frozen-lockfile` 설치에 영향 없음). 의미 있는 변경은 `packages/shared` importer의 vitest 항목뿐이다.
