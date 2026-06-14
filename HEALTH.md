# Argos 저장소 건강 리포트

> 최초 작성: 2026-06-12 (`agent/spike-3-202606111837`).
> 최종 갱신: **2026-06-14 일일 건강 스캔** (`agent/2026-06-14-380`).
> 모든 경로는 저장소 루트 상대 경로다.
>
> **이번 스캔 요약**: 직전 리포트 이후 T2-A/B/C 수정 커밋(`94ff630`/`27da509`/`8db3347`)이
> 먼저 트리에 있었고 spike#3 리포트가 그 위에 머지되어, 리포트가 **수정 이전 상태**를 서술하던
> 부분(특히 R4의 라인 번호, B1/B2 해소 여부)을 현실에 맞춰 정정했다. 테스트는 가장 무방비였던
> 순수 함수 1곳(`generateSlug`)에만 9개 추가했다 — 판단 근거는 §3·부록 참고 (결정 018: 가치 있는
> 곳에만, 0개도 완주). `pnpm -r test` 전체 통과 유지.

## 1. 개요

Argos는 **Claude Code / Codex 팀을 위한 사용 분석 대시보드**다 — 세션·토큰·스킬/서브에이전트 호출을 수집해 조직 단위로 시각화한다 (`README.md`, `docs/`). pnpm + turborepo 모노레포로 3개 패키지로 구성된다: **`packages/cli`**(npm 패키지 `argos-ai`)는 개발자 머신에서 `.claude/settings.json`/`.codex/hooks.json`에 훅을 주입하고 훅 이벤트·transcript를 파싱해 API로 전송한다. **`packages/web`**(`@argos/web`)은 Next.js 15 대시보드이자 ingestion API(`src/app/api/events/route.ts`)를 겸하는 풀스택 앱으로 Vercel(icn1)에 배포된다. **`packages/shared`**(`@argos/shared`)는 양쪽이 공유하는 zod 스키마·타입·모델 단가표(`src/constants/pricing.ts`)만 담은 런타임 의존성 없는 패키지다. 참고: `docs/code-architecture.md`는 별도 `packages/api`(Hono/Railway)를 서술하지만 실제 저장소에는 존재하지 않는다 — web이 API 역할을 직접 수행하며, 문서가 현실과 어긋나 있다(§5 부채).

## 2. 스택과 구조

- **언어/런타임**: TypeScript strict (`tsconfig.base.json`: ES2022, NodeNext), Node ≥18 (CLI `engines`).
- **web**: Next.js 15 + React 19, Prisma 6 + PostgreSQL(Supabase), next-auth 5.0.0-beta.30(정확 핀, `packages/web/package.json:30` — T2-B D2), jose JWT, Tailwind 4, recharts. shadcn는 devDependency(`package.json:51` — T2-B D3, 런타임 의존 아님). 데이터 모델은 `packages/web/prisma/schema.prisma` — Organization/User/OrgMembership(RBAC 4단계)/Project/ClaudeSession/Event/UsageRecord/Message/DailyProjectStat(일별 rollup 캐시) 등 11개 모델, 조회 패턴별 복합 인덱스 구비.
- **cli**: commander 12 + @inquirer/prompts, 의존성 주입 컨테이너(`src/deps.ts` → `src/adapters.ts`) 패턴으로 커맨드가 외부 효과를 인터페이스로 받음 — 테스트 용이성의 핵심.
- **shared**: zod 3 단일 의존. `dist/`를 빌드해 web/cli가 import (turbo `^build` 의존으로 순서 보장).
- **빌드/배포 체인**: `turbo.json`(build는 `^build` 의존) → web은 Vercel(`vercel.json`: `pnpm turbo build --filter=@argos/web`, 리전 icn1). **Vercel 빌드 커맨드에서 `prisma migrate deploy`가 제거됨**(T2-B D1 — 빌드와 마이그레이션 분리, `docs/deploy-migration-separation.md`). migrate는 여전히 CI(`.github/workflows/ci.yml:46`)에서만 실행된다. cli는 npm publish(`.claude/skills/publish-cli`). CI 순서(`ci.yml`): postgres 서비스 → install → prisma generate → shared build → cli build → typecheck → lint → cli test → migrate deploy → web test → web build. (현재 트리 기준 재확인 완료.)
- **루트의 `cc-test/ cycles/ goals/ iterations/ persuasion-data/ prompts/ tasks/ scripts/`**: 제품 코드가 아니라 자율 에이전트 하네스 산출물/드라이버다. CI 파이프라인에는 연결되어 있지 않다.

## 3. 테스트 현황

실행: `pnpm -r test` (vitest 3.2.6, 전 패키지 통일). 아래는 **2026-06-14 스캔 종료 시점** 실측.

| 패키지 | 테스트 | 파일 | 이번 스캔 변화 |
|---|---|---|---|
| `packages/shared` | **42개** | 4 | 변화 없음 |
| `packages/cli` | **149개** | 12 | 변화 없음 |
| `packages/web` | **207개** (194 pass + 13 skip) | 16 | **+9** (`slug.test.ts`) |

> web의 skip 13개(`skill-aggregation.test.ts` 7 + `dashboard/skills/route.test.ts` 5 + `daily-rollup.test.ts` 1)는
> `DATABASE_URL` 미설정 시 자동 skip되는 DB 의존 테스트다 — 로컬 Postgres/CI postgres에서만 풀 실행.
> 이전 리포트의 "이번 작업 후" 컬럼(shared 42 / cli 149 / web 198)은 그대로 유효하며, 이번 스캔은 web에 9개만 더했다.

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
- 직전 추가 ②(spike#3): `src/lib/format.test.ts` — 사용자에게 직접 보이는 토큰/비용/시간 포맷터 23개 (TZ 비의존 분기만; 로컬 시간 렌더링은 브라우저 TZ 의존이 의도된 동작).
- **이번 스캔 추가**: `src/lib/server/slug.test.ts` (9개) — `generateSlug` 순수 정규화 함수. 이 함수의 **빈 문자열 반환 계약**이 `generateUniqueOrgSlug`/`generateUniqueProjectSlug`의 `org-<random>`/`project-<random>` fallback 트리거다(`slug.ts:42,60`). 한글/기호 전용 이름(Argos는 한국 팀 대상 — README/docs 한국어)이 빈 slug로 떨어지는 경로를 고정했다. 분리·목 불필요한 순수 함수였고, 산출 slug는 라우트 키(`/[orgSlug]`)로 직접 노출되므로 깨지면 slug 정책 변경을 즉시 알 수 있다. 모듈이 `./db`(lazy PrismaClient)를 import하지만 `generateSlug`는 쿼리하지 않아 import만으로 안전(기존 `events/route.test.ts` 등과 동일).
- 남은 구멍: `slug.ts`의 `generateUniqueOrgSlug`/`generateUniqueProjectSlug`(DB 충돌 루프 — 통합 테스트 영역), `lib/server/admin-auth.ts`(쿠키 서명 파싱 — `server-only`+env 의존, 분리 필요), `auth-actions.ts`/`password-reset.ts`(TTL·onboard-token 상태 전이), `jwt.ts`, `dashboard.ts`의 `parsePagination`, `api-client.ts`, `session-files.ts`, 그리고 **이번에 추가된 B1 캐시 무효화 날짜 로직**(`api/events/route.ts:160-185` — UTC 일자 버킷팅+과거 필터+dedup, 미테스트. 부록·§5 참고).
- **기존 테스트 수정: 없음** (이번 스캔 포함 전부 원형 유지).

## 4. 리스크 상위 5

### R1. 주간 리포트 날짜 로직의 서버 타임존 의존 — **높음**
`packages/web/src/lib/server/week-range.ts`의 `getWeekRangeForDate`는 date-fns `startOfISOWeek`(로컬 타임존 기준) 결과를 `toUtcMidnight`로 변환한다. 프로덕션(Vercel)·CI는 TZ=UTC라 정상이지만, **UTC가 아닌 환경에서 실행하면 주 시작일이 하루 어긋난다** (예: KST에서 월요일 00:00 UTC 입력 → 일요일 시작 범위 반환). 셀프호스트 사용자가 TZ=Asia/Seoul 서버에 올리는 순간 모든 주간 리포트가 틀어진다. 추가로 `parseWeekParam`은 52주뿐인 해에 `?week=2025-W53`을 받으면 null이 아니라 **조용히 다음 해 W01 범위를 반환**한다(입력 isoKey ≠ 반환 isoKey). 두 동작 모두 `week-range.test.ts`에 `TODO(bug)` 주석과 함께 현재 동작 기준으로 고정해 두었다.

### R2. CLI 토큰 평문 저장 + 1년 만료 JWT 조합 — **높음** (변화 없음, 재확인)
`packages/cli/src/lib/config.ts:62` — Bearer 토큰을 `~/.argos/config.json`에 평문 저장하며(`writeFileSync(... JSON.stringify ...)`) 파일 모드 제한(0600)도 없다. 한편 API 토큰은 1년 만료(`packages/web/src/lib/server/jwt.ts:4` `JWT_EXPIRATION = 365 * 24 * 60 * 60`; `docs/findings/2026-06-10T0340-architecture-unintuitive.md` R3 — `status: deferred`, CLI breakage 리스크로 연기)다. 시나리오: 백업·동기화 도구나 동일 계정의 다른 프로세스가 config.json을 읽으면, 탈취 토큰이 최장 1년간 유효하다. `logout`의 서버측 revoke(`CliToken.revokedAt`)가 있으나 탈취를 인지해야만 작동한다.
> 주의: T2-C(`8db3347`)의 `ADMIN_COOKIE_SECRET` 분리(`env.ts:10-22`, `admin-auth.ts`)는 **관리자 HMAC 쿠키 서명용** 별도 시크릿이며 이 CLI Bearer 토큰과는 무관하다 — R2는 그 수정으로 완화되지 않는다.

### R3. 비용 산술의 float 누적 — **중간**
`packages/web/src/lib/server/cost.ts:24-29`(`(tokens / 1_000_000) * pricePerM` float 곱), `daily-rollup.ts:293,308`(`Number(u.cost_usd ?? 0)` 후 일별 합산), `getDailyRollupsForProjects`의 `prev.estimatedCostUsd += r.estimatedCostUsd` 반복 가산. 시나리오: 수개월 × 다수 프로젝트 합산 시 표시 비용과 원본 레코드 합 사이에 센트 단위 불일치 → 비용 대시보드 신뢰 하락. 단가 자체는 이번에 `packages/shared/src/constants/pricing.test.ts`로 고정했지만, 누적 오차는 decimal 처리 없인 남는다.

### R4. 에러를 문자열·silent catch로 다루는 ingestion/접근제어 경로 — **중간** (라인 정정)
`docs/findings/2026-06-10T0340-code-quality-issues.md`의 Q1~Q3는 **여전히 미해결**이다(현재 트리 재확인): ① API 에러 응답 형태가 갈라져 있음 — `error-helper.ts:18-39`의 `handleRouteError`는 `{ error: { code, message, details } }` 중첩 객체를 반환하지만, `api/events/route.ts:27-30,53,57`과 `dashboard-route-helper.ts:31,33`은 `{ error: '문자열' }` 평면 형태를 반환한다. 두 shape가 공존해 클라이언트 파서가 메시지를 잃는다(Q1). ② `packages/web/src/lib/server/dashboard-route-helper.ts:29-33`이 `message === 'Project not found'` 문자열 비교로 404를 가르고 **그 외 모든 예외(DB 타임아웃 포함)를 403으로 뭉갬**(Q2). ③ `packages/web/src/app/api/events/route.ts:224-226` ingestion `after()` silent catch — 토큰/메시지/usage 유실이 무관측(Q3, **B1 삽입으로 라인이 197-199→224-226로 이동**). 시나리오: DB 장애가 "권한 없음"으로 위장되어 디버깅 비용 폭증 + 데이터 유실을 아무도 모름.
> 참고(해소된 인접 항목): 데이터 정합성 finding의 B1(과거 일자 rollup 캐시 무효화)·B2(회원가입 `P2002`→`EMAIL_IN_USE`/409)는 `94ff630`에서 **코드상 해결**됐다(`route.ts:160-185`, `auth-actions.ts:138-154`; finding `resolved: true`). 다만 finding이 명시한 수용 테스트는 **추가되지 않았다** — B1 날짜 로직은 미테스트 상태(§5 신규 항목 11).

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
| 6 | API 에러 응답 형태 단일화(`jsonError` 헬퍼) + 문자열 분기 제거 (Q1/Q2) | **M** | R4 해소 |
| 7 | `admin-auth.ts` 쿠키 파싱·`auth-actions.ts`/`password-reset.ts` TTL 경계를 순수 함수로 분리 후 단위 테스트 (week-range 분리와 동일 수법). T2-C가 `ADMIN_COOKIE_SECRET`을 `env.ts`로 분리했으나 `admin-auth.ts`의 HMAC 파싱 자체는 여전히 `server-only`+env 의존이라 무방비 | **M** | 보안 게이트 무방비 |
| 8 | 비용 집계를 정수 마이크로달러 또는 decimal로 전환 | **M** | R3 해소; UsageRecord 스키마 변경 수반 |
| 9 | ingestion 경로 관측성: silent catch(`route.ts:224-226`)에 구조화 로그/메트릭 추가 (Q3) + transcript 포맷 버전 감지 | **M** | R4·R5 완화 |
| 10 | CLI→API 계약 테스트 (실 서버 또는 스키마 기반) — `api-client.ts`/`auth-flow.ts`의 본질적 커버리지 | **L** | 목 없이는 단위 테스트 불가한 영역 |
| 11 | **B1 캐시 무효화 날짜 로직을 순수 함수로 분리 후 테스트** — `api/events/route.ts:160-185`의 `pastDates` 계산(UTC 일자 버킷팅·`< todayMs` 과거 필터·dedup)을 `(timestamps, now) => Date[]` 순수 함수로 추출하고 경계(오늘 UTC 자정 = 과거 아님, 어제 = 과거, 중복 일자 dedup)를 고정. 현재 ingestion `after()` 핫패스 인라인이라 이번 스캔에서는 추출하지 않음(아래 부록 판단) | **S** | 신규 코드인데 미테스트; finding이 요구한 수용 테스트 누락 |

## 부록 A: 2026-06-14 일일 스캔 판단 기록 (결정 018)

- **기능 코드 변경 0건**. 추가 파일은 테스트 1개(`packages/web/src/lib/server/slug.test.ts`, 9개)뿐이다. 기존 테스트·기능 코드는 한 글자도 건드리지 않았다.
- **추가한 1곳의 근거**(`generateSlug`): 순수 함수 + 분리/목 불필요 + 산출물이 라우트 키로 직접 노출 + 빈 문자열 반환 계약이 fallback 분기의 단일 진실원. "깨지면 slug 정책이 바뀐 것"이라 deletion-worthy 기준을 통과한다.
- **고려했으나 추가하지 않은 곳, 사유**:
  - **B1 캐시 무효화 날짜 로직**(`route.ts:160-185`): 신규·미테스트·로직 충분(UTC 버킷팅+과거 필터+dedup)이라 가치는 명확하나, 테스트하려면 ingestion `after()` **핫 라이트 패스에서 순수 함수 추출**이 선행돼야 한다. 일일 증분 스캔에서 가장 중요한 쓰기 경로를 리팩토링하는 것은 비용/리스크가 가치를 초과 → §5 항목 11로 등록하고 보류.
  - **`parsePagination`**(`dashboard.ts:180`): 순수하지만 page/pageSize clamp라 스테이크가 낮고, 동결이 리팩토링 세금에 가까움 → 제외.
  - **B2 register `P2002`→409**(`auth-actions.ts:149-154`): 1줄 에러코드 remap이라 로직 함량이 낮고, 검증엔 db/Prisma 에러 목이 필요(테스트 전략상 통합 지점) → 제외.
  - `admin-auth.ts`/`auth-actions.ts` TTL 등 §3 "남은 구멍": `server-only`+env+db 의존이라 분리 선행 필요 — 일일 스캔 범위 밖, §5 항목 7로 유지.
- 결론: **가치 있는 1곳만 추가**가 결정 018("추가할 가치가 있는 곳이 없으면 0개도 완주, 가치 있는 곳에만")에 부합한다고 판단했다.

## 부록 B: 직전(spike#3) 작업의 판단 기록

- **기능 코드 변경은 1건뿐**: `packages/web/src/lib/server/weekly-report.ts`의 순수 주차 함수를 `week-range.ts`로 이동(잘라내기+re-export, 로직 무수정). `server-only` import 때문에 분리 없이는 테스트가 불가능했고, 동작 동일성은 21개 테스트(golden path·경계·roundtrip)로 증명했다. 호출자 2곳(`weekly-report.ts` 내부, `reports/route.ts`)은 기존 import 경로 그대로 동작한다.
- `packages/shared`의 build 스크립트를 `tsc` → `tsc -p tsconfig.build.json`로 변경한 것은 테스트 파일이 `dist/`에 컴파일되어 패키지 산출물에 섞이는 것을 막기 위함이다. `packages/cli`가 이미 쓰는 패턴(`packages/cli/tsconfig.build.json`)을 그대로 따랐고, 테스트 제외 외 빌드 옵션 변화는 없다.
- 버그로 보이는 동작 3건(W53 overflow, TZ 의존, `"+-1m"`)은 **고치지 않고** 현재 동작 기준으로 테스트에 `TODO(bug)` 주석과 함께 고정했다 (임무 규칙 준수).
- 기존 테스트 파일은 한 글자도 수정하지 않았다.
- `pnpm-lock.yaml` diff가 커 보이는 것(±약 985줄)은 vitest 추가 외에 pnpm이 lockfile을 재작성하며 모든 resolution 항목의 중복 `tarball:` URL 필드를 제거했기 때문이다(integrity 해시는 전부 유지 — `--frozen-lockfile` 설치에 영향 없음). 의미 있는 변경은 `packages/shared` importer의 vitest 항목뿐이다.
