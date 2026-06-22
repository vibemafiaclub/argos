# Argos 저장소 건강 리포트

> 최초 작성: 2026-06-12 (`agent/spike-3-202606111837`).
> **최종 갱신: 2026-06-23 — 일일 건강 스캔 (백로그 #14, `agent/2026-06-22-001`).**
> 모든 경로는 저장소 루트 상대 경로다.
>
> 이번 스캔 범위: 직전 리포트 커밋(`7241f61`) 이후 6개 커밋의 델타를 반영하고,
> "깨지면 의미 있는 것을 알게 되는" 한 곳(`jwt.ts`)에만 회귀 테스트를 추가했다 (§3, 부록).

## 1. 개요

Argos는 **Claude Code / Codex 팀을 위한 사용 분석 대시보드**다 — 세션·토큰·스킬/서브에이전트 호출을 수집해 조직 단위로 시각화한다 (`README.md`, `docs/`). pnpm + turborepo 모노레포로 3개 패키지로 구성된다: **`packages/cli`**(npm 패키지 `argos-ai`)는 개발자 머신에서 `.claude/settings.json`/`.codex/hooks.json`에 훅을 주입하고 훅 이벤트·transcript를 파싱해 API로 전송한다. **`packages/web`**(`@argos/web`)은 Next.js 15 대시보드이자 ingestion API(`src/app/api/events/route.ts`)를 겸하는 풀스택 앱으로 Vercel(icn1)에 배포된다. **`packages/shared`**(`@argos/shared`)는 양쪽이 공유하는 zod 스키마·타입·모델 단가표(`src/constants/pricing.ts`)만 담은 런타임 의존성 없는 패키지다. 참고: `docs/code-architecture.md`는 별도 `packages/api`(Hono/Railway)를 서술하지만 실제 저장소에는 존재하지 않는다 — web이 API 역할을 직접 수행하며, 문서가 현실과 어긋나 있다(§5 부채).

## 2. 스택과 구조

- **언어/런타임**: TypeScript strict (`tsconfig.base.json`: ES2022, **NodeNext** — 상대 import는 확장자 규칙 적용, `@/*` 경로 매핑은 예외), Node ≥18 (CLI `engines`).
- **web**: Next.js 15 + React 19, Prisma 6 + PostgreSQL(Supabase), next-auth 5.0.0-beta.30(고정 핀), jose JWT, Tailwind 4, recharts. 데이터 모델은 `packages/web/prisma/schema.prisma` — Organization/User/OrgMembership(RBAC 4단계)/Project/ClaudeSession/Event/UsageRecord/Message/DailyProjectStat(일별 rollup 캐시) 등 11개 모델, 조회 패턴별 복합 인덱스 구비.
- **cli**: commander 12 + @inquirer/prompts, 의존성 주입 컨테이너(`src/deps.ts` → `src/adapters.ts`) 패턴으로 커맨드가 외부 효과를 인터페이스로 받음 — 테스트 용이성의 핵심.
- **shared**: zod 3 단일 의존. `dist/`를 빌드해 web/cli가 import (turbo `^build` 의존으로 순서 보장).
- **빌드/배포 체인**: `turbo.json`(build는 `^build` 의존) → web은 Vercel(`vercel.json`: `pnpm turbo build --filter=@argos/web`, 리전 icn1), cli는 npm publish(`.claude/skills/publish-cli`), CI는 `.github/workflows/ci.yml`(postgres 서비스 → install → prisma generate → shared/cli build → typecheck/lint → cli test → **schema/migration drift 감지(`prisma migrate diff --exit-code`, 신규)** → migrate → web test → web build).
- **운영 가이드**: 루트 `CLAUDE.md`(신규)가 프로덕션 500 대응 프로토콜(`vercel logs --status-code 500`)·API 에러 응답 규격·DB 마이그레이션 절차를 문서화. **주의**: 여기 명시된 표준 에러 shape(`{ error: { code, message } }`)을 코드가 거의 따르지 않는다 — §4 R4 참조.
- **루트의 `cc-test/ cycles/ goals/ iterations/ persuasion-data/ prompts/ tasks/ scripts/`**: 제품 코드가 아니라 자율 에이전트 하네스 산출물/드라이버다. CI 파이프라인에는 연결되어 있지 않다.

## 3. 테스트 현황

실행: `pnpm -r test` (vitest 3.2.6, 전 패키지 통일). 현재 전부 그린.

| 패키지 | 테스트 수 | 파일 | 비고 |
|---|---|---|---|
| `packages/shared` | **42** | 4 | pricing 정규화·zod 스키마 경계 |
| `packages/cli` | **149** | 12 | 커맨드 플로우·transcript 파싱·event-sender 락 |
| `packages/web` | **202** (189 pass + 13 skip) | 16 | DB 의존 13개는 `DATABASE_URL` 미설정 시 skip |

**이번 스캔 추가: `packages/web` +4** (`src/lib/server/jwt.test.ts`, 신규). 그 외 패키지는 추가 없음 — 델타 커밋이 건드린 나머지 코드에 "깨지면 의미 있는" 무방비 단위가 없다고 판단(부록 결정 기록).

### packages/web — 이번 추가: `jwt.ts` 회귀 가드
직전 리포트가 `jwt.ts`를 "남은 구멍"으로 명시했고, 그 사이 실제 프로덕션 500 수정(`.setJti`, commit `9d2221e`)이 **테스트 없이** 들어왔다. auth 경계이자 막 변경된 보안 코드라 회귀 가치가 높아 4개 테스트를 추가했다:
- **round-trip**: `verifyJwt(signJwt(id)).sub === id`.
- **위조 거부**: 다른 시크릿으로 서명된 토큰을 `verifyJwt`가 null 처리 — `jwtVerify`(서명검증)를 `decodeJwt`(검증없음)로 바꾸는 흔한 인증 우회 회귀를 잡는다.
- **malformed → null**: `verifyJwt`가 throw 하지 않고 null 반환하는 계약 고정.
- **`.setJti` 회귀 가드**: 같은 user로 `Promise.all` 동시 발급 시 토큰·sha256 해시가 달라야 한다. `.setJti` 제거 시 같은 초 서명이 byte-identical → `CliToken.tokenHash` UNIQUE 500이 재현된다. **mutation 으로 검증**: `.setJti` 줄을 제거하면 정확히 이 테스트만 실패함을 확인했다(나머지 3개는 통과).
- 구현 메모: `jwt.ts`는 `server-only`가 아니나 `env.ts`가 import 시점에 `process.env`를 zod parse 한다. `vi.mock('./env', …)`(hoist되어 import보다 먼저 적용)로 고정 시크릿만 주입했다 — DB·네트워크 mock 아님(설정값 대체).

### 기존 커버리지 (변경 없음)
- `shared`: `normalizeModelName`/`getModelPricing`(pricing.test.ts), `IngestEventSchema`/auth/project 스키마 경계.
- `cli`: 커맨드 4종 플로우, transcript JSONL 파싱(claude/codex), event-sender self-heal 락/race, hooks-inject 멱등성, `normalizeApiUrl`(config.test.ts).
- `web`: cost 계산, RBAC, rollup 집계(`daily-rollup.test.ts`), 이벤트 derive, API 응답 계약, 주차 계산(`week-range.test.ts`), 포맷터(`format.test.ts`).

### 남은 구멍 (우선순위 순)
- `auth-actions.ts`의 `registerUser` **트랜잭션 원자성**(이번에 `$transaction`으로 변경됨, e809975) — orphan user 방지가 핵심인데 의미 있는 테스트는 트랜잭션 중간 실패 주입 + 롤백 확인이 필요해 **DB 통합 테스트** 영역(단위 불가). `server-only`라 직접 import도 불가. CI postgres 백드 통합 테스트로 별도 다뤄야 함.
- `error-helper.ts`의 `jsonError`/`handleRouteError`(`server-only`, 사실상 한 줄 래퍼/로깅 — 단독 동결 가치 낮음), `admin-auth.ts`(쿠키 서명 파싱, `server-only`+env 의존 → 분리 필요), `password-reset.ts` TTL 경계, `slug.ts`, `dashboard.ts`의 `parsePagination`.
- `api-client.ts`/`auth-flow.ts`(cli, 네트워크 통합 지점 — 프로젝트 테스트 전략상 목 대체 부적합, 계약/E2E 필요).
- **기존 테스트 수정: 없음** (전부 원형 유지).

## 4. 리스크 상위 5

### R1. 주간 리포트 날짜 로직의 서버 타임존 의존 — **높음** (변동 없음)
`packages/web/src/lib/server/week-range.ts`의 `getWeekRangeForDate`는 date-fns `startOfISOWeek`(로컬 타임존 기준) 결과를 `toUtcMidnight`로 변환한다. 프로덕션(Vercel)·CI는 TZ=UTC라 정상이지만, **UTC가 아닌 환경에서 실행하면 주 시작일이 하루 어긋난다**. 셀프호스트 사용자가 TZ=Asia/Seoul 서버에 올리는 순간 모든 주간 리포트가 틀어진다. 추가로 `parseWeekParam`은 52주뿐인 해에 `?week=2025-W53`을 받으면 null이 아니라 **조용히 다음 해 W01 범위를 반환**한다. 두 동작 모두 `week-range.test.ts`에 `TODO(bug)`로 현재 동작 기준 고정.

### R2. CLI 토큰 평문 저장 + 1년 만료 JWT 조합 — **높음** (변동 없음)
`packages/cli/src/lib/config.ts` — Bearer 토큰을 `~/.argos/config.json`에 평문 저장하며 파일 모드 제한(0600)도 없다. API 토큰은 1년 만료(`docs/findings/2026-06-10T0340-architecture-unintuitive.md` R3, 의도적 연기)다. 이번 `jwt.ts` 변경(`.setJti`)은 **수명에 영향 없음** — `JWT_EXPIRATION = 365d` 그대로. 시나리오: 백업/동기화 도구가 config.json을 읽으면 탈취 토큰이 최장 1년 유효.

### R3. 비용 산술의 float 누적 — **중간** (변동 없음)
`packages/web/src/lib/server/cost.ts`(`(tokens / 1_000_000) * pricePerM` float 곱), `daily-rollup.ts`(일별 합산·반복 가산). 수개월 × 다수 프로젝트 합산 시 표시 비용과 원본 합 사이 센트 단위 불일치. 단가 자체는 `shared/constants/pricing.test.ts`로 고정했으나 누적 오차는 decimal 처리 없인 남는다.

### R4. API 에러 응답 shape의 문서-코드 괴리 + silent catch — **중간** (이번 스캔에서 부분 개선 + 재평가)
직전 리포트의 Q1(에러 shape 분기)이 부분적으로만 해소됐고, **CLAUDE.md가 표준 shape `{ error: { code, message } }`을 명문화하면서 오히려 문서-코드 괴리가 드러났다**:
- **신규(0aece9f)**: `error-helper.ts`에 `jsonError(code, message, status)` 헬퍼 추가 + `handleRouteError`가 `{ prismaCode, message }` 구조화 로깅으로 개선(500 디버깅 관측성↑). register 라우트/페이지가 새 shape로 마이그레이션됨(`register/route.ts`, `register/page.tsx`의 `data.error?.message`).
- **그러나 적용률이 ~5%**: `jsonError`를 쓰는 라우트는 **1개**뿐인데, 비표준 `{ error: '문자열' }` 패턴이 **19개 라우트 파일에 53곳** 남아 있다(`grep "{ error: '" src/app/api`). 게다가 `members/[memberUserId]/route.ts`는 **제3의 shape** `{ error: 'forbidden', message: '…' }`을, `events/route.ts:28`은 `{ error: 'Validation failed', details }`를 쓴다 — 클라이언트 파서가 메시지를 잃거나 케이스별로 분기해야 한다. 이를 강제하는 lint/테스트 규칙이 없어 드리프트가 계속된다.
- **Q2 미해결**: `dashboard-route-helper.ts:30`이 `message === 'Project not found'` 문자열 비교로 분기하고 그 외 모든 예외(DB 타임아웃 포함)를 403으로 뭉갠다.
- **Q3 미해결**: `events/route.ts:224`의 bare `} catch {` ingestion silent catch — 레코드 단위 유실이 무관측.
- 시나리오: DB 장애가 "권한 없음"으로 위장되고, ingestion 유실을 아무도 모르며, 클라이언트는 라우트마다 다른 에러 shape를 만난다.

### R5. Claude Code transcript 포맷 가정의 조용한 드리프트 — **중간** (변동 없음)
`packages/cli/src/lib/transcript.ts`는 transcript JSONL의 type 문자열과 content 형태를 하드코딩 가정하고, 안 맞는 줄은 per-line try/catch로 조용히 버린다. `commands/hook.ts`의 agent 감지도 `transcript_path`의 `/.codex/` 포함 휴리스틱이다. Claude Code/Codex가 스키마를 바꾸면 에러 없이 수집량만 줄고(훅은 항상 exit 0) 대시보드 수치가 무증상으로 부정확해진다. 기존 테스트가 현재 포맷은 고정하나 포맷 버전 감지/관측 수단이 없다.

추가로 기록 (상위 5 미만): `format.ts`의 `formatRelativeTime`은 timestamp가 base보다 빠르면 `"+-1m"` 같은 비정상 문자열을 렌더한다 — `format.test.ts`에 `TODO(bug)`로 고정. `formatTokens(999_999) → "1000.0K"`, `formatDurationMs(59_999) → "60s"` 경계 quirk도 동일하게 고정.

### 이번 스캔에서 개선/해소된 항목 (긍정 델타)
- **JWT 해시 충돌 500 수정**(`9d2221e`, `.setJti`) — 이번 스캔에서 회귀 테스트로 고정(§3).
- **registerUser 트랜잭션화**(`e809975`) — user + cliToken 생성을 `$transaction`으로 묶어 orphan user 방지. (단위 테스트는 DB 통합 영역, §3 구멍.)
- **CI schema/migration drift 게이트**(`32e35c0`) — `prisma migrate diff --exit-code`로 schema.prisma와 마이그레이션 불일치를 CI에서 차단. CLAUDE.md가 경고한 "column does not exist"류 프로덕션 500의 사전 차단.

## 5. 부채와 빠른 개선 기회

| # | 항목 | 크기 | 근거 |
|---|---|---|---|
| 1 | `docs/code-architecture.md`가 존재하지 않는 `packages/api`(Hono/Railway)를 서술 — 문서를 현실(web=API)로 갱신 | **S** | 신규 기여자 온보딩 오도 |
| 2 | `@argos/shared` `package.json` exports에서 `types` 조건이 `import`/`require` 뒤라 dead (`packages/shared/package.json`) | **S** | `types`를 첫 조건으로 이동만 하면 됨 |
| 3 | `parseWeekParam` W53 overflow를 null 반환으로 수정 + `formatRelativeTime` 음수 diff 처리 (`TODO(bug)` 2건 해소) | **S** | R1, 추가quirk 보충; 테스트가 이미 있어 수정 안전 |
| 4 | CLI hook.ts 도달 불가 SubagentStop 분기 삭제 (`docs/findings/...code-quality-issues.md` Q4) | **S** | dead code |
| 5 | `~/.argos/config.json` 생성 시 `mode: 0o600` 지정 (`packages/cli/src/lib/config.ts`) | **S** | R2 완화 1단계 |
| 6 | **에러 응답 shape 단일화 잔여 작업**: `jsonError` 헬퍼는 있으나 19개 라우트·53곳이 미적용 + 제3 shape 잔존. 일괄 마이그레이션 + ESLint 규칙으로 `{ error: '문자열' }` 금지 강제 | **M** | R4 해소 + 드리프트 차단 |
| 7 | `admin-auth.ts` 쿠키 파싱·`password-reset.ts` TTL 경계를 순수 함수로 분리 후 단위 테스트 (week-range 분리와 동일 수법) | **M** | 보안 게이트 무방비 |
| 8 | 비용 집계를 정수 마이크로달러 또는 decimal로 전환 | **M** | R3 해소; UsageRecord 스키마 변경 수반 |
| 9 | ingestion 경로 관측성: silent catch(`events/route.ts:224`)에 구조화 로그/메트릭 추가 (Q3) + transcript 포맷 버전 감지 | **M** | R4·R5 완화 |
| 10 | `registerUser` 트랜잭션 원자성 + `loginUser`/`exchangeOnboardToken`의 DB 백드 통합 테스트 (CI postgres) | **M** | §3 구멍; orphan/중복 토큰 회귀 가드 |
| 11 | CLI→API 계약 테스트 (실 서버 또는 스키마 기반) — `api-client.ts`/`auth-flow.ts`의 본질적 커버리지 | **L** | 목 없이는 단위 테스트 불가한 영역 |

## 부록: 작업 판단 기록

### 2026-06-23 일일 스캔 (백로그 #14)
- **추가한 테스트: `jwt.test.ts` 4개 (web)**. 판단 근거: `jwt.ts`는 (a) 직전 리포트가 명시한 "남은 구멍"이고, (b) 그 사이 실제 프로덕션 500 수정(`.setJti`)이 테스트 없이 들어왔으며, (c) auth 경계라 회귀 가치가 높고, (d) DB·네트워크 통합 없이 결정적으로 검증 가능했다. mutation 테스트(`.setJti` 제거 → 정확히 회귀 가드만 실패)로 "깨지면 의미 있는 것을 알게 되는가" 기준을 실증했다.
- **추가하지 않은 곳과 이유** (결정 018 — 0개도 완주):
  - `registerUser` `$transaction`(e809975): orphan 방지의 핵심은 "트랜잭션 중간 실패 시 롤백"인데 이를 의미 있게 검증하려면 DB + 실패 주입이 필요하다. `server-only`+DB 통합 영역이라 단위 테스트로는 동결할 수 없다 → §5 #10 부채로 등록.
  - `jsonError`/`handleRouteError`(error-helper.ts): `server-only`이고 사실상 한 줄 NextResponse 래퍼/로깅 포맷이다. shape 동결 테스트는 거의 동어반복이고 `server-only`라 import도 불가 → 리팩토링 세금, 추가 안 함.
  - `register/page.tsx`, `ci.yml`: 각각 클라이언트 UI 배선/CI 설정 — 순수 로직 아님, 변경 금지 대상.
- **기능 코드 변경: 없음** (이번 스캔은 테스트 추가만). `jwt.ts`는 이미 `signJwt`/`verifyJwt`를 export하고 있어 분리/리팩토링 불필요.
- **기존 테스트 파일: 한 글자도 수정 안 함.**
- **lockfile/의존성: 변경 없음** — vitest·jose·crypto는 web에 이미 존재. `pnpm install`은 no-op(Prisma client generate만 실행).
- 자가 검증: `pnpm install`(no-op) → `pnpm --filter @argos/shared build` → `pnpm -r test`(shared 42 / cli 149 / web 202, 전부 통과) → `pnpm typecheck`(4/4, 신규 에러 0). 모두 그린.

### 2026-06-12 최초 스파이크 (요약, 원문 보존)
- 기능 코드 변경 1건: `weekly-report.ts`의 순수 주차 함수를 `week-range.ts`로 이동(잘라내기+re-export, 로직 무수정). `server-only` 때문에 분리 없이는 테스트 불가했고, 동작 동일성을 21개 테스트(golden·경계·roundtrip)로 증명. 호출자 무변경.
- `packages/shared` vitest 신규 셋업(42개) + build 스크립트를 `tsc -p tsconfig.build.json`로 변경(테스트 파일을 dist에서 제외, cli 패턴 동일). `cli` +7(`config.test.ts`), `web` +44(`week-range.test.ts` 21, `format.test.ts` 23).
- 버그로 보이는 동작 3건(W53 overflow, TZ 의존, `"+-1m"`)은 고치지 않고 현재 동작 기준 `TODO(bug)`로 고정.
