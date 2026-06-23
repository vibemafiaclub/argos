# Argos 저장소 건강 리포트

> 최초 작성: 2026-06-12 (`agent/spike-3`). **최종 갱신: 2026-06-24 (일일 건강 스캔 #15, `agent/2026-06-23-001`).**
> 모든 경로는 저장소 루트 상대 경로다.
>
> **이번 스캔 요약**: spike#3 이후 변경분(7커밋)을 반영해 §3·§4·§5를 갱신했다. 신규 테스트는 **`jwt.ts` 1개 파일(+7개)** 만 추가했다 — 판단 근거는 §6.

## 1. 개요

Argos는 **Claude Code / Codex 팀을 위한 사용 분석 대시보드**다 — 세션·토큰·스킬/서브에이전트 호출을 수집해 조직 단위로 시각화한다 (`README.md`, `docs/`). pnpm + turborepo 모노레포로 3개 패키지로 구성된다: **`packages/cli`**(npm 패키지 `argos-ai`)는 개발자 머신에서 `.claude/settings.json`/`.codex/hooks.json`에 훅을 주입하고 훅 이벤트·transcript를 파싱해 API로 전송한다. **`packages/web`**(`@argos/web`)은 Next.js 15 대시보드이자 ingestion API(`src/app/api/events/route.ts`)를 겸하는 풀스택 앱으로 Vercel(icn1)에 배포된다. **`packages/shared`**(`@argos/shared`)는 양쪽이 공유하는 zod 스키마·타입·모델 단가표(`src/constants/pricing.ts`)만 담은 런타임 의존성 없는 패키지다. 참고: `docs/code-architecture.md`는 별도 `packages/api`(Hono/Railway)를 서술하지만 실제 저장소에는 존재하지 않는다 — web이 API 역할을 직접 수행하며, 문서가 현실과 어긋나 있다(§5 부채).

## 2. 스택과 구조

- **언어/런타임**: TypeScript strict (`tsconfig.base.json`: ES2022, NodeNext), Node ≥18 (CLI `engines`).
- **web**: Next.js 15 + React 19, Prisma 6 + PostgreSQL(Supabase), next-auth 5.0.0-beta.30(고정 핀), jose JWT, Tailwind 4, recharts. 데이터 모델은 `packages/web/prisma/schema.prisma` — Organization/User/OrgMembership(RBAC 4단계)/Project/ClaudeSession/Event/UsageRecord/Message/DailyProjectStat(일별 rollup 캐시) 등 11개 모델, 조회 패턴별 복합 인덱스 구비.
- **cli**: commander 12 + @inquirer/prompts, 의존성 주입 컨테이너(`src/deps.ts` → `src/adapters.ts`) 패턴으로 커맨드가 외부 효과를 인터페이스로 받음 — 테스트 용이성의 핵심.
- **shared**: zod 3 단일 의존. `dist/`를 빌드해 web/cli가 import (turbo `^build` 의존으로 순서 보장).
- **빌드/배포 체인**: `turbo.json`(build는 `^build` 의존) → web은 Vercel(`vercel.json`: `pnpm turbo build --filter=@argos/web`, 리전 icn1), cli는 npm publish(`.claude/skills/publish-cli`). CI(`.github/workflows/ci.yml`)는 postgres 서비스 → install → prisma generate → shared/cli build → typecheck/lint → cli test → migrate → web test → web build. **이번 갱신분**: 32e35c0이 `prisma migrate diff --exit-code`로 `schema.prisma`↔migration 파일 드리프트를 CI에서 잡는 step을 추가했다(마이그레이션 파일 누락 방지).
- **루트의 `cc-test/ cycles/ goals/ iterations/ persuasion-data/ prompts/ tasks/ scripts/`**: 제품 코드가 아니라 자율 에이전트 하네스 산출물/드라이버다. CI 파이프라인에는 연결되어 있지 않다.

## 3. 테스트 현황

실행: `pnpm -r test` (vitest 3.2.6, 전 패키지 통일). 아래 수치는 2026-06-24 기준.

| 패키지 | spike#3 직후 | 현재 (#15) | 비고 |
|---|---|---|---|
| `packages/shared` | 42개 (4 파일) | **42개** (4 파일) | 변동 없음 |
| `packages/cli` | 149개 (12 파일) | **149개** (12 파일) | 변동 없음 |
| `packages/web` | 198개 (15 파일, DB의존 13개 skip) | **205개** (16 파일, DB의존 13개 skip) | **+7 (`jwt.test.ts`)** |

> 로컬 기본 실행(Postgres 없음)에서는 web의 DB 의존 13개(`skill-aggregation.test.ts` 7, `dashboard/skills/route.test.ts` 5, `daily-rollup` 1)가 `DATABASE_URL` 미설정으로 skip된다 — CI postgres 서비스에서만 풀 실행. 현재 전 패키지 green.

### packages/shared — 변동 없음
- 커버: `constants/pricing.test.ts`(19), `schemas/events.test.ts`(10), `schemas/auth.test.ts`(6), `schemas/project.test.ts`(7).
- 남은 구멍: `src/types/*`는 타입 선언만이라 테스트 대상 없음. 구멍 아님.

### packages/cli — 변동 없음
- 기존: 커맨드 4종 플로우, transcript JSONL 파싱(claude/codex), event-sender self-heal 락/race, hooks-inject 멱등성, `lib/config.test.ts`(`normalizeApiUrl`).
- 남은 구멍: `src/lib/api-client.ts`(에러 JSON 파싱), `src/lib/auth-flow.ts`(OAuth 폴링 루프) — 네트워크 통합 지점. 프로젝트 테스트 전략(`.claude/skills/test-strategy`: 통합 지점은 목으로 대체하지 않음)상 단위 목 테스트 부적합. 계약 테스트/E2E 필요(§5).

### packages/web — 이번 스캔에서 `jwt.ts` 신규 커버
- 기존: cost 계산, RBAC, rollup 집계, 이벤트 derive, week-range(주차 계산), format(토큰/비용/시간 포맷), API 응답 계약 등 198개.
- **이번 추가: `src/lib/server/jwt.test.ts` (+7)** — `signJwt`/`verifyJwt`의 핵심 계약을 현재 동작 기준으로 고정. ① roundtrip(서명→verify가 동일 sub 반환), ② **jti 유일성**(같은 userId라도 매 발급마다 다른 토큰 — commit `9d2221e`의 프로덕션 500 수정을 회귀 가드로 동결: `setJti`가 사라지면 `token_hash` UNIQUE 충돌이 재발하고 이 테스트가 깨진다), ③ 위조(다른 secret)·④ 만료·⑤ sub 없음·⑥ sub 비문자열·⑦ malformed 입력을 전부 `null`로 거부. jwt.ts는 인증 토큰 경계인데 **테스트가 0개**였고 방금 프로덕션 장애를 겪은 곳이라, 이번 스캔에서 유일하게 "깨지면 의미 있는 것을 알게 되는" 신규 대상이었다.
  - 테스트 메커니즘 메모: `jwt.ts → env.ts`가 모듈 로드 시 `process.env` 전체를 zod parse해 import만으로 throw하므로, jwt가 쓰는 `env.JWT_SECRET`만 담은 가벼운 `vi.mock('./env', …)`으로 import 부작용을 차단했다. `process.env`를 건드리지 않아 다른 test 파일의 DB-skip 판정으로 새지 않는다. 앱 코드·vitest 설정 변경 없음.
- 남은 구멍(우선순위순): `lib/server/error-helper.ts`의 `handleRouteError`(ZodError duck-typing 분기 — `import 'server-only'`로 vitest 직접 import 불가, §5-7), `admin-auth.ts`(쿠키 서명 파싱), `auth-actions.ts`/`password-reset.ts`(TTL 경계), `slug.ts`, `dashboard.ts`의 `parsePagination`.
- **기존 테스트 수정: 없음** (전부 원형 유지).

## 4. 리스크 상위 5

### R1. 주간 리포트 날짜 로직의 서버 타임존 의존 — **높음** (변동 없음)
`packages/web/src/lib/server/week-range.ts`의 `getWeekRangeForDate`는 date-fns `startOfISOWeek`(로컬 타임존 기준) 결과를 `toUtcMidnight`로 변환한다. 프로덕션(Vercel)·CI는 TZ=UTC라 정상이지만, **UTC가 아닌 환경에서 실행하면 주 시작일이 하루 어긋난다** (예: KST에서 월요일 00:00 UTC 입력 → 일요일 시작 범위 반환). 셀프호스트 사용자가 TZ=Asia/Seoul 서버에 올리는 순간 모든 주간 리포트가 틀어진다. 추가로 `parseWeekParam`은 52주뿐인 해에 `?week=2025-W53`을 받으면 null이 아니라 **조용히 다음 해 W01 범위를 반환**한다(입력 isoKey ≠ 반환 isoKey). 두 동작 모두 `week-range.test.ts`에 `TODO(bug)` 주석과 함께 현재 동작 기준으로 고정돼 있다. (해당 파일은 spike#3 이후 변경 없음.)

### R2. CLI 토큰 평문 저장 + 1년 만료 JWT 조합 — **높음** (변동 없음)
`packages/cli/src/lib/config.ts:54-63` — Bearer 토큰을 `~/.argos/config.json`에 평문 저장하며 파일 모드 제한(0600)도 없다. 한편 API 토큰은 1년 만료(`packages/web/src/lib/server/jwt.ts:5` `JWT_EXPIRATION = 365일`, `docs/findings/2026-06-10T0340-architecture-unintuitive.md` R3 — **의도적 미해결/연기**)다. 시나리오: 백업·동기화 도구나 동일 계정의 다른 프로세스가 config.json을 읽으면, 탈취 토큰이 최장 1년간 유효하다. `logout`의 서버측 revoke(`CliToken.revokedAt`)가 있으나 탈취를 인지해야만 작동한다. (config.ts·jwt.ts의 만료값 모두 변경 없음.)

### R3. 비용 산술의 float 누적 — **중간** (변동 없음)
`packages/web/src/lib/server/cost.ts:24-29`(`(tokens / 1_000_000) * pricePerM` float 곱), `daily-rollup.ts:293,308`(`Number(u.cost_usd ?? 0)` 후 일별 합산), `getDailyRollupsForProjects`의 `prev.estimatedCostUsd += r.estimatedCostUsd` 반복 가산. 시나리오: 수개월 × 다수 프로젝트 합산 시 표시 비용과 원본 레코드 합 사이에 센트 단위 불일치 → 비용 대시보드 신뢰 하락. 단가 자체는 `packages/shared/src/constants/pricing.test.ts`로 고정돼 있지만, 누적 오차는 decimal 처리 없인 남는다. (cost.ts·daily-rollup.ts 변경 없음.)

### R4. API 에러 응답이 "표준 shape 통일" 정책을 선언만 하고 코드가 따르지 않음 — **중간(상향)**
spike#3 당시 "에러 응답 형태가 3가지로 갈라짐"으로 기록됐는데, 그 사이 `0aece9f`이 표준 헬퍼 `jsonError(code,message,status)`/`handleRouteError`를 도입(`error-helper.ts`)하고 **CLAUDE.md가 `{ error: { code, message } }`를 규격으로 못 박았다**(`직접 { error: 'string' } 패턴 사용 금지`). 문제는 **실제 마이그레이션이 register 라우트 1곳에 그쳤다는 점**: `grep`상 web에는 구형 `{ error: '<문자열>' }` 호출이 **여전히 53곳**(`auth-helper.ts`, `dashboard-route-helper.ts`, `events/route.ts`, `cli-callback`/`cli-poll`/`exchange` 등 ~15개 파일)에 남아 있다. CLAUDE.md가 권장하는 클라이언트 추출자 `data.error?.message`는 이 53곳 응답에서 전부 **`undefined`** 를 받아 메시지를 잃는다 — 즉 "규격은 문서화됐으나 코드가 위반"하는 상태라 오히려 디버깅을 더 헷갈리게 한다. 더해 R4의 다른 두 갈래가 그대로 살아 있다: ① `dashboard-route-helper.ts:30`이 `err.message === 'Project not found'` 문자열 비교로 분기하고 그 외 모든 예외(DB 타임아웃 포함)를 403으로 뭉갬, ② `api/events/route.ts:224`의 ingestion `catch {}` silent(주석: "에러 발생해도 무시")로 토큰/메시지 유실이 무관측. 시나리오: DB 장애가 "권한 없음"으로 위장 + 수집 데이터 유실을 아무도 모름 + 표준화 약속을 믿은 클라이언트가 빈 메시지를 받음.

### R5. Claude Code transcript 포맷 가정의 조용한 드리프트 — **중간** (변동 없음)
`packages/cli/src/lib/transcript.ts`는 transcript JSONL의 type 문자열(`'queue-operation'` 등)과 content 형태를 하드코딩으로 가정하고, 안 맞는 줄은 per-line try/catch로 **조용히 버린다**. `commands/hook.ts`의 agent 감지도 `transcript_path`에 `/.codex/` 포함 여부 휴리스틱이다. 시나리오: Claude Code/Codex가 transcript 스키마를 바꾸면 에러 없이 토큰·메시지 수집량만 줄어들고(훅은 항상 exit 0), 대시보드 수치가 무증상으로 부정확해진다. 기존 테스트(`transcript.test.ts` 등)가 현재 포맷은 고정하지만 포맷 버전 감지/관측 수단이 없다. (transcript.ts 변경 없음.)

**이번 갱신분 — 닫힌/완화된 항목**:
- **(완화) 회원가입 JWT 충돌 500**: `9d2221e`이 `signJwt`에 `setJti(randomBytes)`를 추가해 같은 초 발급 시 `token_hash` UNIQUE 충돌을 제거. 이번 스캔에서 `jwt.test.ts`로 회귀 가드 추가.
- **(완화) orphan user**: `e809975`이 `registerUser`의 user+cliToken 생성을 `$transaction`으로 묶어, cliToken 실패 시 인증 불가 user가 남는 문제를 제거(`auth-actions.ts`).

추가 기록 (상위 5 미만, 변동 없음): `packages/web/src/lib/format.ts:70-77` `formatRelativeTime`은 timestamp가 base보다 빠르면 `"+-1m"` 같은 비정상 문자열을 렌더한다 — `format.test.ts`에 `TODO(bug)`로 고정. `formatTokens(999_999) → "1000.0K"`, `formatDurationMs(59_999) → "60s"` 경계 quirk도 동일하게 고정돼 있다.

## 5. 부채와 빠른 개선 기회

| # | 항목 | 크기 | 근거 |
|---|---|---|---|
| 1 | `docs/code-architecture.md`가 존재하지 않는 `packages/api`(Hono/Railway)를 서술 — 문서를 현실(web=API)로 갱신 | **S** | 신규 기여자 온보딩 오도 |
| 2 | `@argos/shared` `package.json` exports에서 `types` 조건이 `import`/`require` 뒤라 dead — vitest/esbuild가 빌드마다 경고 (`packages/shared/package.json:7-13`) | **S** | `types`를 첫 조건으로 이동만 하면 됨 |
| 3 | `parseWeekParam` W53 overflow를 null 반환으로 수정 + `formatRelativeTime` 음수 diff 처리 (테스트의 `TODO(bug)` 2건 해소) | **S** | R1, R5 보충; 테스트가 이미 있어 수정 안전 |
| 4 | CLI hook.ts 도달 불가 SubagentStop 분기 삭제 (`docs/findings/...code-quality-issues.md` Q4) | **S** | dead code |
| 5 | `~/.argos/config.json` 생성 시 `mode: 0o600` 지정 (`packages/cli/src/lib/config.ts:62`) | **S** | R2 완화 1단계 |
| 6 | **에러 응답 shape 마이그레이션 완수** — 헬퍼·정책은 도입됐으나 구형 `{ error: '문자열' }` 호출 53곳이 미전환(§4 R4). `jsonError`로 일괄 치환 + `dashboard-route-helper.ts:30` 문자열 분기 제거 | **M** | R4 핵심; CLAUDE.md 규격과 코드 불일치 |
| 7 | `error-helper.ts handleRouteError`(ZodError duck-typing 분기) 단위 테스트 — 현재 `import 'server-only'`로 vitest 직접 import 불가. 순수 분류 로직 분리(week-range 수법) 또는 vitest에 `server-only` stub 추가 후 커버 | **M** | duck-typing이 깨지면 검증 에러가 조용히 500으로 바뀜 |
| 8 | `admin-auth.ts` 쿠키 파싱·`auth-actions.ts`/`password-reset.ts` TTL 경계를 순수 함수로 분리 후 단위 테스트 | **M** | 보안 게이트 무방비 |
| 9 | 비용 집계를 정수 마이크로달러 또는 decimal로 전환 | **M** | R3 해소; UsageRecord 스키마 변경 수반 |
| 10 | ingestion 경로 관측성: silent catch(`events/route.ts:224`)에 구조화 로그/메트릭 추가 + transcript 포맷 버전 감지 | **M** | R4·R5 완화 |
| 11 | CLI→API 계약 테스트 (실 서버 또는 스키마 기반) — `api-client.ts`/`auth-flow.ts`의 본질적 커버리지 | **L** | 목 없이는 단위 테스트 불가한 영역 |

## 6. 부록: 이번 스캔(#15)의 판단 기록

- **테스트 보강 범위 판단(결정 018)**: spike#3 이후 변경분(`error-helper.ts`, `auth-actions.ts`, `jwt.ts`, register 페이지/라우트, CI) 중 "깨지면 의미 있는 것을 알게 되는" 신규 단위-테스트 대상은 **`jwt.ts` 하나뿐**이라 거기에만 7개를 추가했다 — `error-helper.ts`·`auth-actions.ts`는 `import 'server-only'`/DB 통합 지점이라 인프라(또는 앱 코드) 변경 없이는 무가치한 동결이 되므로 부채(§5-7, §5-10)로만 기록하고 테스트는 만들지 않았다.
- **기능 코드 변경: 0건.** 이번 스캔은 `jwt.test.ts` 신규 파일과 본 리포트 갱신만 포함한다 (앱 코드·vitest 설정·CI 설정 무변경).
- **기존 테스트 수정: 0건.**
- 버그로 보이는 동작은 이번에 새로 발견된 것이 없으며(기존 `TODO(bug)` 3건은 §4·§3에 유지), 발견 시 규칙대로 현재 동작 고정 + `TODO(bug)` 주석 + 본 §4 기록 절차를 따른다.

---
### 변경 이력
- **2026-06-24 (#15)**: spike#3 이후 7커밋 반영. R4 상향(shape 정책 선언 vs 53 미전환 callsite). JWT/orphan-user 완화 기록. `jwt.test.ts`(+7) 추가. web 198→205.
- **2026-06-12 (spike#3)**: 최초 작성. shared vitest 신규 셋업(+42), cli +7, web +44(week-range 분리·format). `pnpm-lock.yaml`은 vitest 추가 외에 pnpm이 중복 `tarball:` 필드를 정리하며 재작성됐다(integrity 해시 유지, `--frozen-lockfile` 영향 없음).
