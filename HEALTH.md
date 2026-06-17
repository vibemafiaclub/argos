# Argos 저장소 건강 리포트

> 최초 작성: 2026-06-12 (`agent/spike-3-202606111837`).
> 최종 갱신: 2026-06-18 — 일일 건강 스캔 #9 (`agent/2026-06-17-001`).
> 모든 경로는 저장소 루트 상대 경로다.

## 0. 변경 이력 (2026-06-18 일일 스캔 #9)

- **드리프트 1건 교정**: R4가 인용하던 ingestion silent catch 위치가 `events/route.ts:197-199`→**224-226**으로 이동했다. 그 사이 B1(롤업 캐시 무효화, `94ff630`)이 `events/route.ts:160-185`에 끼어들었기 때문이다. 인용 경로를 현재 코드 기준으로 갱신했다(R4 본문 참조).
- **신규 헬퍼 반영**: 라우트 최상위 catch가 `handleRouteError`(`src/lib/server/error-helper.ts`)로 통합됐다. 단 에러 응답 shape는 여전히 3종으로 갈라져 있어 R4/부채 #6은 유효하다. 덤으로 `error-helper.ts:8` 주석이 존재하지 않는 `packages/api`를 다시 참조한다 — 부채 #1 강화.
- **상위 5 리스크는 전부 유효**: 그 사이 머지된 T1-A~T2-C 수정(접근제어 A1~A5, 게이트 G1~G3, 배포 D1~D3, 아키 R1~R5)은 본 리포트의 top-5와 다른 findings를 다뤘다. R1~R5 근거 파일(`week-range.ts`/`config.ts:62`/`cost.ts:24-28`/`dashboard-route-helper.ts:30-33`/`transcript.ts`)은 코드 재확인 결과 동작 변화 없음.
- **테스트 보강 2건**: `generateSlug`(`slug.test.ts` 7), `parsePagination`(`dashboard-pagination.test.ts` 8) — 둘 다 이미 export된 순수 함수라 **앱 코드 변경 0**. 판단 근거는 §6 부록 참조.

## 1. 개요

Argos는 **Claude Code / Codex 팀을 위한 사용 분석 대시보드**다 — 세션·토큰·스킬/서브에이전트 호출을 수집해 조직 단위로 시각화한다 (`README.md`, `docs/`). pnpm + turborepo 모노레포로 3개 패키지로 구성된다: **`packages/cli`**(npm 패키지 `argos-ai`)는 개발자 머신에서 `.claude/settings.json`/`.codex/hooks.json`에 훅을 주입하고 훅 이벤트·transcript를 파싱해 API로 전송한다. **`packages/web`**(`@argos/web`)은 Next.js 15 대시보드이자 ingestion API(`src/app/api/events/route.ts`)를 겸하는 풀스택 앱으로 Vercel(icn1)에 배포된다. **`packages/shared`**(`@argos/shared`)는 양쪽이 공유하는 zod 스키마·타입·모델 단가표(`src/constants/pricing.ts`)만 담은 런타임 의존성 없는 패키지다. 참고: `docs/code-architecture.md`는 별도 `packages/api`(Hono/Railway)를 서술하지만 실제 저장소에는 존재하지 않는다 — web이 API 역할을 직접 수행하며, 문서가 현실과 어긋나 있다(§5 부채).

## 2. 스택과 구조

- **언어/런타임**: TypeScript strict (`tsconfig.base.json`: ES2022, NodeNext), Node ≥18 (CLI `engines`).
- **web**: Next.js 15 + React 19, Prisma 6 + PostgreSQL(Supabase), next-auth 5.0.0-beta.30(고정 핀), jose JWT, Tailwind 4, recharts. 데이터 모델은 `packages/web/prisma/schema.prisma` — Organization/User/OrgMembership(RBAC 4단계)/Project/ClaudeSession/Event/UsageRecord/Message/DailyProjectStat(일별 rollup 캐시) 등 11개 모델, 조회 패턴별 복합 인덱스 구비.
- **cli**: commander 12 + @inquirer/prompts, 의존성 주입 컨테이너(`src/deps.ts` → `src/adapters.ts`) 패턴으로 커맨드가 외부 효과를 인터페이스로 받음 — 테스트 용이성의 핵심.
- **shared**: zod 3 단일 의존. `dist/`를 빌드해 web/cli가 import (turbo `^build` 의존으로 순서 보장).
- **빌드/배포 체인**: `turbo.json`(build는 `^build` 의존) → web은 Vercel(`vercel.json`: `pnpm turbo build --filter=@argos/web`, 리전 icn1), cli는 npm publish(`.claude/skills/publish-cli`), CI는 `.github/workflows/ci.yml`(postgres 서비스 → install → prisma generate → shared/cli build → typecheck/lint → cli test → migrate → web test → web build).
- **루트의 `cc-test/ cycles/ goals/ iterations/ persuasion-data/ prompts/ tasks/ scripts/`**: 제품 코드가 아니라 자율 에이전트 하네스 산출물/드라이버다. CI 파이프라인에는 연결되어 있지 않다.

## 3. 테스트 현황

실행: `pnpm -r test` (vitest 3.2.6, 전 패키지 통일).

| 패키지 | spike#3 직후 | 현재 (#9) | 비고 |
|---|---|---|---|
| `packages/shared` | **42개** (4 파일) | **42개** (4 파일) | 변동 없음 — 순수 로직 전부 커버됨 |
| `packages/cli` | **149개** (12 파일) | **149개** (12 파일) | 변동 없음 — 남은 구멍은 네트워크 통합 지점뿐(§5 #10) |
| `packages/web` | **198개** (15 파일, DB의존 13개는 로컬 Postgres 없으면 skip) | **213개** (17 파일) | +15 (`slug.test.ts` 7, `dashboard-pagination.test.ts` 8) |

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
- spike#3 추가 ②: `src/lib/format.test.ts` — 사용자에게 직접 보이는 토큰/비용/시간 포맷터 23개 (TZ 비의존 분기만; 로컬 시간 렌더링은 브라우저 TZ 의존이 의도된 동작).
- **#9 추가 ①**: `src/lib/server/slug.test.ts` — `generateSlug` 7개. org/project URL slug 생성기. 특수문자 제거(URL 안전)와 "영숫자 0개 → 빈 문자열" i18n 분기(한글 전용 이름의 `org-<random>` fallback 트리거)를 고정. 깨지면 라우팅이 어긋나거나 fallback이 안 돌아 URL이 깨진다. `slug.ts`는 `server-only` 없음 → 분리 없이 import 가능, **앱 코드 무변경**.
- **#9 추가 ②**: `src/lib/server/dashboard-pagination.test.ts` — `parsePagination` 8개. NaN/음수/0 입력이 Prisma `skip`/`take`로 새지 않게 막는 가드, pageSize `[10,100]` 클램프(무제한 조회 방지), `skip=(page-1)*pageSize` 산술을 고정. 깨지면 잘못된 페이지네이션 쿼리/과도한 row 조회. 역시 **앱 코드 무변경**.
- 남은 구멍: `lib/server/admin-auth.ts`(쿠키 서명 파싱 — `server-only`+env 의존, 분리 필요), `auth-actions.ts`/`password-reset.ts`(TTL 경계), `jwt.ts`, `events/route.ts`의 B1 날짜 버킷팅(§6 부록 — 분리 보류), `api-client.ts`, `session-files.ts`.
- **기존 테스트 수정: 없음** (전부 원형 유지).

## 4. 리스크 상위 5

### R1. 주간 리포트 날짜 로직의 서버 타임존 의존 — **높음**
`packages/web/src/lib/server/week-range.ts`의 `getWeekRangeForDate`는 date-fns `startOfISOWeek`(로컬 타임존 기준) 결과를 `toUtcMidnight`로 변환한다. 프로덕션(Vercel)·CI는 TZ=UTC라 정상이지만, **UTC가 아닌 환경에서 실행하면 주 시작일이 하루 어긋난다** (예: KST에서 월요일 00:00 UTC 입력 → 일요일 시작 범위 반환). 셀프호스트 사용자가 TZ=Asia/Seoul 서버에 올리는 순간 모든 주간 리포트가 틀어진다. 추가로 `parseWeekParam`은 52주뿐인 해에 `?week=2025-W53`을 받으면 null이 아니라 **조용히 다음 해 W01 범위를 반환**한다(입력 isoKey ≠ 반환 isoKey). 두 동작 모두 `week-range.test.ts`에 `TODO(bug)` 주석과 함께 현재 동작 기준으로 고정해 두었다.

### R2. CLI 토큰 평문 저장 + 1년 만료 JWT 조합 — **높음**
`packages/cli/src/lib/config.ts:54-63` — Bearer 토큰을 `~/.argos/config.json`에 평문 저장하며 파일 모드 제한(0600)도 없다. 한편 API 토큰은 1년 만료(`docs/findings/2026-06-10T0340-architecture-unintuitive.md` R3 — **의도적 미해결/연기** 상태)다. 시나리오: 백업·동기화 도구나 동일 계정의 다른 프로세스가 config.json을 읽으면, 탈취 토큰이 최장 1년간 유효하다. `logout`의 서버측 revoke(`CliToken.revokedAt`)가 있으나 탈취를 인지해야만 작동한다.

### R3. 비용 산술의 float 누적 — **중간**
`packages/web/src/lib/server/cost.ts:24-29`(`(tokens / 1_000_000) * pricePerM` float 곱), `daily-rollup.ts:293,308`(`Number(u.cost_usd ?? 0)` 후 일별 합산), `getDailyRollupsForProjects`의 `prev.estimatedCostUsd += r.estimatedCostUsd` 반복 가산. 시나리오: 수개월 × 다수 프로젝트 합산 시 표시 비용과 원본 레코드 합 사이에 센트 단위 불일치 → 비용 대시보드 신뢰 하락. 단가 자체는 이번에 `packages/shared/src/constants/pricing.test.ts`로 고정했지만, 누적 오차는 decimal 처리 없인 남는다.

### R4. 에러를 문자열·silent catch로 다루는 ingestion/접근제어 경로 — **중간**
이미 `docs/findings/2026-06-10T0340-code-quality-issues.md`에 Q1~Q3로 문서화되어 있고 **여전히 미해결**이다: ① API 에러 응답 형태가 3가지로 갈라져 클라이언트 파서가 메시지를 잃음(Q1) — 라우트 최상위 catch는 `handleRouteError`(`src/lib/server/error-helper.ts`, `{error:{code,message}}` 중첩 객체)로 통합됐으나, 같은 라우트 내 400 검증 응답(`events/route.ts:27-30` `{error:string, details}`)·접근제어 응답(`{error:string}`)과 shape가 여전히 불일치, ② `packages/web/src/lib/server/dashboard-route-helper.ts:30-33`이 `message === 'Project not found'` 문자열 비교로 분기하고 그 외 모든 예외(DB 타임아웃 포함)를 403으로 뭉갬(Q2 — 재확인, 동작 유지), ③ `packages/web/src/app/api/events/route.ts:224-226` ingestion silent catch(`} catch { // 무시 (fire-and-forget) }`) — 토큰/메시지 유실이 무관측(Q3). 시나리오: DB 장애가 "권한 없음"으로 위장되어 디버깅 비용 폭증 + 데이터 유실을 아무도 모름.

### R5. Claude Code transcript 포맷 가정의 조용한 드리프트 — **중간**
`packages/cli/src/lib/transcript.ts`는 transcript JSONL의 type 문자열(`'queue-operation'` 등)과 content 형태를 하드코딩으로 가정하고, 안 맞는 줄은 per-line try/catch로 **조용히 버린다**. `commands/hook.ts`의 agent 감지도 `transcript_path`에 `/.codex/` 포함 여부 휴리스틱이다. 시나리오: Claude Code/Codex가 transcript 스키마를 바꾸면 에러 없이 토큰·메시지 수집량만 줄어들고(훅은 항상 exit 0), 대시보드 수치가 무증상으로 부정확해진다. 기존 테스트(`transcript.test.ts` 24개 등)가 현재 포맷은 고정하지만 포맷 버전 감지/관측 수단이 없다.

추가로 기록 (상위 5 미만): `packages/web/src/lib/format.ts:70-77` `formatRelativeTime`은 timestamp가 base보다 빠르면 `"+-1m"` 같은 비정상 문자열을 렌더한다 — `format.test.ts`에 `TODO(bug)`로 고정. 같은 파일의 `formatTokens(999_999) → "1000.0K"`, `formatDurationMs(59_999) → "60s"` 경계 quirk도 동일하게 고정해 두었다.

## 5. 부채와 빠른 개선 기회

| # | 항목 | 크기 | 근거 |
|---|---|---|---|
| 1 | 존재하지 않는 `packages/api`(Hono/Railway)를 참조하는 위치 2곳 — `docs/code-architecture.md`(전반 서술), `src/lib/server/error-helper.ts:8`(주석) — 을 현실(web=API)로 갱신 | **S** | 신규 기여자 온보딩 오도 |
| 2 | `@argos/shared` `package.json` exports에서 `types` 조건이 `import`/`require` 뒤라 dead — vitest/esbuild가 빌드마다 경고 (`packages/shared/package.json:7-13`) | **S** | `types`를 첫 조건으로 이동만 하면 됨 |
| 3 | `parseWeekParam` W53 overflow를 null 반환으로 수정 + `formatRelativeTime` 음수 diff 처리 (테스트의 `TODO(bug)` 2건 해소) | **S** | R1, R5 보충; 테스트가 이미 있어 수정 안전 |
| 4 | CLI hook.ts 도달 불가 SubagentStop 분기 삭제 (`docs/findings/...code-quality-issues.md` Q4) | **S** | dead code |
| 5 | `~/.argos/config.json` 생성 시 `mode: 0o600` 지정 (`packages/cli/src/lib/config.ts:62`) | **S** | R2 완화 1단계 |
| 6 | API 에러 응답 형태 단일화 + 문자열 분기 제거 (Q1/Q2). **부분 진행**: 최상위 catch는 `error-helper.ts`의 `handleRouteError`로 통합됐으나 400 검증·접근제어 응답은 별도 shape로 잔존, `dashboard-route-helper.ts:30-33`의 문자열 비교도 미해소 | **M** | R4 해소 |
| 7 | `admin-auth.ts` 쿠키 파싱·`auth-actions.ts`/`password-reset.ts` TTL 경계를 순수 함수로 분리 후 단위 테스트 (이번 작업의 week-range 분리와 동일 수법) | **M** | 보안 게이트 무방비 |
| 8 | 비용 집계를 정수 마이크로달러 또는 decimal로 전환 | **M** | R3 해소; UsageRecord 스키마 변경 수반 |
| 9 | ingestion 경로 관측성: silent catch에 구조화 로그/메트릭 추가 (Q3) + transcript 포맷 버전 감지 | **M** | R4·R5 완화 |
| 10 | CLI→API 계약 테스트 (실 서버 또는 스키마 기반) — `api-client.ts`/`auth-flow.ts`의 본질적 커버리지 | **L** | 목 없이는 단위 테스트 불가한 영역 |

## 6. 부록: 판단 기록

### 2026-06-18 일일 스캔 #9

- **테스트 2개 추가 — 둘 다 "깨지면 의미 있는 것을 알게 되는" 무방비 순수 로직, 앱 코드 변경 0**: ① `generateSlug`(URL slug 생성 — 특수문자 제거/한글 전용 이름의 빈-문자열 fallback 분기), ② `parsePagination`(NaN·음수 입력이 Prisma `skip`/`take`로 새는 것을 막는 가드 + `[10,100]` 클램프 + skip 산술). 둘 다 §3 "남은 구멍"에 명시돼 있었고, `server-only`가 없어 분리 없이 import 가능해 **함수 추출/리팩토링 없이** 테스트만 추가했다.
- **보강을 보류한 곳 — 판단 근거 명시**: B1(`events/route.ts:160-185`)의 "과거 UTC 일 경계 수집" 날짜 버킷팅은 분명 위험한 로직(틀어지면 늦게 도착한 데이터의 롤업 캐시가 무효화 안 돼 대시보드가 조용히 stale)이지만, 현재 server-only 라우트 핸들러에 인라인돼 있어 테스트하려면 **앱 코드(라우트) 분리**가 필요하다. 일일 스캔은 앱 코드 변경에 보수적이어야 하므로 이번엔 보류하고 §3 "남은 구멍" + 향후 테스트 대상으로 남겼다 (week-range 분리와 동일 수법으로 다음 사이클에 처리 가능). 그 외 신규 코드(`auth-actions.ts` B2 P2002→409, `env.ts` ADMIN_COOKIE_SECRET, `admin-auth.ts` HMAC)는 전부 DB/`server-only`/env 결합이라 프로젝트 테스트 전략(통합 지점 비목킹)상 단위 테스트 부적합 — 추가 안 함.
- **상위 5 리스크 재검증**: R1~R5의 근거 파일을 현재 코드로 재확인했고 전부 동작 변화 없이 유효함을 확인했다(§0 참조). 따라서 리스크 등급·근거는 유지.
- **기존 테스트·앱 동작 변경 0**: 신규 파일 2개만 추가. lockfile·빌드 설정 변경 없음(새 devDependency 없음 — vitest는 이미 전 패키지에 존재).

### 2026-06-12 spike#3 (최초 셋업)

- **기능 코드 변경은 1건뿐**: `packages/web/src/lib/server/weekly-report.ts`의 순수 주차 함수를 `week-range.ts`로 이동(잘라내기+re-export, 로직 무수정). `server-only` import 때문에 분리 없이는 테스트가 불가능했고, 동작 동일성은 21개 테스트(golden path·경계·roundtrip)로 증명했다. 호출자 2곳(`weekly-report.ts` 내부, `reports/route.ts`)은 기존 import 경로 그대로 동작한다.
- `packages/shared`의 build 스크립트를 `tsc` → `tsc -p tsconfig.build.json`로 변경한 것은 테스트 파일이 `dist/`에 컴파일되어 패키지 산출물에 섞이는 것을 막기 위함이다. `packages/cli`가 이미 쓰는 패턴(`packages/cli/tsconfig.build.json`)을 그대로 따랐고, 테스트 제외 외 빌드 옵션 변화는 없다.
- 버그로 보이는 동작 3건(W53 overflow, TZ 의존, `"+-1m"`)은 **고치지 않고** 현재 동작 기준으로 테스트에 `TODO(bug)` 주석과 함께 고정했다 (임무 규칙 준수).
- 기존 테스트 파일은 한 글자도 수정하지 않았다.
- `pnpm-lock.yaml` diff가 커 보이는 것(±약 985줄)은 vitest 추가 외에 pnpm이 lockfile을 재작성하며 모든 resolution 항목의 중복 `tarball:` URL 필드를 제거했기 때문이다(integrity 해시는 전부 유지 — `--frozen-lockfile` 설치에 영향 없음). 의미 있는 변경은 `packages/shared` importer의 vitest 항목뿐이다.
