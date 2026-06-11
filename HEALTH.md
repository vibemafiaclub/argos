# Argos 저장소 건강 리포트

작성: 2026-06-12 · 기준 커밋: `8db3347` (branch `agent/spike-4-202606111856`)
작성 방식: 자율 에이전트가 저장소 내 증거만으로 분석. 모든 주장에 파일 경로를 인용한다.

---

## 1. 개요

Argos는 팀의 Claude Code · Codex 사용 패턴(세션, 토큰, 비용, 스킬)을 수집·분석하는
오픈소스 분석 플랫폼이다 (`README.md`). pnpm workspace 모노레포로 3개 패키지로 구성된다.
`packages/cli`(npm 패키지 `argos-ai`)는 프로젝트 초기화와 Claude Code/Codex hook 설치를
담당하고, hook이 발화될 때마다 이벤트를 서버로 전송한다(`packages/cli/src/lib/event-sender.ts`).
`packages/web`(`@argos/web`)은 Next.js 15 대시보드 + API 서버로, `/api/events`로 이벤트를
수집해 Prisma/PostgreSQL에 적재하고 조직·프로젝트 단위 분석 화면을 제공한다.
`packages/shared`(`@argos/shared`)는 CLI↔Web 계약의 단일 진실원천으로, zod 스키마
(`src/schemas/`), 타입(`src/types/`), 모델 단가표(`src/constants/pricing.ts`)를 담는다.

## 2. 스택과 구조

**핵심 의존성** (`packages/*/package.json`)

| 영역 | 기술 |
|---|---|
| CLI | TypeScript 5 (ESM, NodeNext), commander 12, @inquirer/prompts 7, chalk 5, ora 8 |
| Web | Next.js 15 + React 19, next-auth `5.0.0-beta.30`, Prisma 6, jose 5(JWT), bcryptjs 2, Tailwind 4, recharts 2 |
| Shared | zod 3 (런타임 의존성은 이것 하나) |
| 빌드 | pnpm 9.15.4 workspace + Turborepo 2.9.16 (`turbo.json`) |

**빌드/배포 체인**

- Web: Vercel 배포. `vercel.json`의 `buildCommand: "cd ../.. && pnpm turbo build --filter=@argos/web"`.
  루트와 `packages/web/vercel.json`이 바이트 단위로 동일하게 중복 존재한다(diff 결과 IDENTICAL).
- DB 마이그레이션은 빌드에서 분리되어 있다(커밋 `27da529` "D1 remove migrate from build",
  `docs/deploy-migration-separation.md`). 수동/CI에서 `prisma migrate deploy` 실행.
- CLI: `pnpm build`(tsc) 후 `scripts/add-shebang.js`가 shebang을 붙여 npm `argos-ai`로 배포
  (`packages/cli/package.json` `bin.argos`).
- Shared는 `dist/`만 노출한다(`packages/shared/package.json` `exports`). web은
  `next.config.ts:11`의 `transpilePackages: ['@argos/shared']`로 소화하고, cli는
  devDependency + `import type` 전용으로 사용하며 lint 규칙
  (`packages/cli/eslint.config.*`의 `@typescript-eslint/no-restricted-imports`)이 값 import를 차단한다.
  이 구조 때문에 `turbo.json`에서 `lint`/`typecheck`가 `^build`에 의존한다.
- CI(`.github/workflows/ci.yml`): postgres:16 서비스 → install → prisma generate →
  shared/cli 빌드 → typecheck → lint → cli 테스트 → migrate → web 테스트 → web 빌드.
  CLI 테스트와 web 테스트가 모두 실행된다. 단 `turbo.json`에는 `test` task가 없어
  테스트는 turbo 캐시/그래프 밖에서 `pnpm --filter` 직접 호출로 돈다.

**데이터 모델** (`packages/web/prisma/schema.prisma`): Organization / User / OrgMembership /
Project / ProjectMember / ClaudeSession / Event / UsageRecord / Message / DailyProjectStat(롤업 캐시) /
CliToken / CliAuthRequest / OnboardToken / PasswordResetToken — API 라우트 33개가 이 위에 서 있다.

**저장소 위생**: 루트에 에이전트 하네스 산출물 디렉토리가 다수 커밋되어 있다
(`cycles/`, `iterations/`, `tasks/`, `goals/`, `guidelines/`, `prompts/`, `persuasion-data/`, `cc-test/`).
기존 감사 결과는 `docs/findings/2026-06-10T0340-*.md` 6개 문서에 정리되어 있고,
A1~A3·A5(접근제어), B1·B2(데이터 정합성), D1~D3, G1~G3 등 상당수는 최근 커밋
(`9ce5242`~`8db3347`)에서 이미 수정됐다.

## 3. 테스트 현황

실행 명령: `pnpm -r test` (vitest 3.2.6, 세 패키지 모두 `environment: 'node'`).

| 패키지 | 이전 | 현재 (이번 작업 후) | 커버 영역 |
|---|---|---|---|
| `packages/shared` | **0개 (셋업 자체 없음)** | 3파일 27개 | 단가 정규화(`pricing.test.ts`), 이벤트 스키마(`events.test.ts`), 인증/프로젝트 스키마(`auth-project.test.ts`) |
| `packages/cli` | 11파일 142개 | 12파일 154개 (+`src/lib/config.test.ts` 12개) | transcript 파싱(Claude/Codex), event-sender, project 설정 탐색, 커맨드 5종, hooks 주입, **(신규)** config I/O·URL 정규화 |
| `packages/web` | 13파일 141개(+13 skip) | 15파일 163개(+13 skip) (+`admin-auth.test.ts` 12개, `slug.test.ts` 10개) | rbac, cost, daily-rollup, weekly-report, events 라우트, slash-command 등, **(신규)** admin HMAC 쿠키/impersonation 토큰, slug 생성·충돌 처리 |

**남은 구멍** (현 시점 무테스트):

- web 인증 경로 대부분: `src/lib/server/auth-actions.ts`(로그인/가입/토큰 교환),
  `auth-helper.ts`(토큰 검증+캐시), `jwt.ts`, `password-reset.ts`, `api/auth/*` 7개 라우트.
- web 표시 로직: `src/lib/format.ts`(날짜/비용/상대시간 — locale 의존), `session-files.ts`.
- cli: `src/lib/api-client.ts`(에러 메시지 파싱·타임아웃), `auth-flow.ts`(폴링 로직).
- DB 의존 테스트 13개(`skill-aggregation.test.ts` 7, `dashboard/skills/route.test.ts` 5,
  `daily-rollup.test.ts` 1)는 `DATABASE_URL` 없으면 조용히 skip된다 — 아래 리스크 5.
- 커버리지 리포터 미설정(어느 패키지에도 `coverage` 설정 없음). 숫자 채우기 목적이 아니라면
  당장 문제는 아니다.

**기존 테스트 수정 여부**: 없음. 기존 테스트는 한 글자도 건드리지 않았다.

## 4. 리스크 상위 5

1. **[높음] 이벤트 적재 후처리의 무관측 실패** — `packages/web/src/app/api/events/route.ts:224`
   `catch { // 에러 발생해도 무시 (fire-and-forget) }`. STOP 이벤트의 UsageRecord 일괄 삽입,
   transcript 메시지 적재가 이 블록 안에 있다. DB 제약 위반·타임아웃이 나면 사용량/대화
   데이터가 **로그 한 줄 없이** 유실되고, 대시보드 수치만 조용히 빈다. 터지는 시나리오:
   스키마 변경 후 일부 페이로드가 insert에 실패 → 수주간 비용 통계 과소집계 → 원인 추적 불가.

2. **[높음] 브라우저에 1년 만료 JWT** — `packages/web/src/lib/server/jwt.ts:4`
   `JWT_EXPIRATION = 365 * 24 * 60 * 60`. 대시보드 전 페이지가 `'use client'` SPA이고
   세션의 `argosToken`(CLI용과 동일 포맷의 1년 JWT)을 Bearer로 들고 API를 호출한다.
   XSS 한 번이면 1년짜리 자격증명이 탈취된다. CliToken revocation 체크는 있으나
   (`auth-helper.ts`) 탈취를 *감지*할 수단이 없다. 터지는 시나리오: react-markdown 등
   렌더링 경로에 XSS 1건 → 토큰 유출 → 1년간 조직 전체 세션 transcript 열람.

3. **[중간] MEMBER의 프로젝트 이름 변경 허용 (기존 findings A4, 미수정)** —
   `packages/web/src/lib/server/project-actions.ts:179-181`은
   `!isAdmin && existing.members.length === 0`일 때만 거부한다. 즉 프로젝트 멤버이기만 하면
   OWNER/MANAGER가 아니어도 rename이 가능하다. `docs/findings/2026-06-10T0340-access-control-bugs.md`의
   A4로 기록돼 있고 A1~A3·A5와 달리 아직 안 고쳐졌다.

4. **[중간] 모델 단가 하드코딩 + prefix fallback의 오계산 경로** —
   `packages/shared/src/constants/pricing.ts:46-95`. 미등록 모델은 Sonnet 단가로
   fallback(`:68`)하고, `gpt-5.3`(비-codex)은 prefix 검사에서 `gpt-5` base 단가로 흡수된다
   (이번에 `pricing.test.ts`의 `TODO(bug)` 테스트로 현재 동작을 고정함). 신모델 출시 때마다
   수동 갱신이 필요하며 누락 시 비용 대시보드가 틀린 숫자를 *확신 있게* 보여준다.
   같은 계열로, `IngestEventSchema`가 non-strict라 오타 필드가 조용히 strip되는 것도
   `events.test.ts`의 `TODO(bug)`로 고정했다(`packages/shared/src/schemas/events.ts:29`).

5. **[중간] 로컬에서 DB 의존 테스트 13개 silent skip** — `packages/web/vitest.config.ts`는
   원격 DB만 차단할 뿐, `DATABASE_URL`이 아예 없으면 `skill-aggregation.test.ts`(7),
   `dashboard/skills/route.test.ts`(5), `daily-rollup.test.ts`(1)가 skip으로 통과한다.
   로컬 `pnpm -r test` green ≠ CI green. 터지는 시나리오: 집계 SQL(CTE/window function)을
   건드린 개발자가 로컬 green만 보고 push → CI에서야 실패하거나, CI migrate 누락 시 그대로 머지.

**이번 테스트 작성 중 발견해 `// TODO(bug):`로 고정한 동작** (코드는 수정하지 않음):

- `packages/cli/src/lib/config.ts:23-32` — `normalizeApiUrl('localhost:3000')`은
  `new URL()`이 `localhost:`를 프로토콜로 파싱해 예외가 안 나므로 커스텀 URL로 통과한다.
  http(s) 스킴 검증이 없어 이후 fetch 단계에서야 깨진다 (`config.test.ts`).
- `packages/web/src/lib/server/admin-auth.ts:100-119` — impersonation 토큰 payload가
  `.` join이라 userId에 `.`이 들어가면 발급은 되지만 검증이 항상 실패한다(조용한 round-trip
  실패). 현재 cuid라 실해 없음 (`admin-auth.test.ts`).
- 위 리스크 4의 pricing/스키마 2건 (`pricing.test.ts`, `events.test.ts`).

## 5. 부채와 빠른 개선 기회

| 항목 | 근거 | 크기 |
|---|---|---|
| events 후처리 catch에 구조화 로깅 추가 (리스크 1 완화) | `api/events/route.ts:224` | **S** |
| A4 수정: rename에 OWNER/MANAGER 체크 | `project-actions.ts:179-181`, rbac 헬퍼 기존재 | **S** |
| `vercel.json` 중복 제거 (루트 vs `packages/web/` 동일 파일 2벌) | diff 결과 IDENTICAL | **S** |
| `packages/web/package.json`의 중복 `packageManager` 필드 제거 (루트와 이중 선언) | `packages/web/package.json:5` | **S** |
| shared `exports`에서 `types` 조건을 맨 앞으로 (현재 `import`/`require` 뒤라 빌드 도구 경고 발생) | `packages/shared/package.json:7-13`, vitest 실행 시 esbuild 경고 재현 | **S** |
| `turbo.json`에 `test` task 추가해 CI의 개별 `--filter` 호출을 그래프로 통합 | `turbo.json`(test 부재), `ci.yml` | **S** |
| cli 중복 테스트 정리: `src/__tests__/transcript.test.ts`(28 케이스)와 `src/lib/transcript.test.ts`(27 케이스)가 같은 모듈을 두 벌로 검증 | 두 파일 공존 | **M** |
| 미등록 모델 관측: `normalizeModelName`이 `default` 반환 시 서버에서 모델명 로깅/메트릭 | `pricing.ts:114` | **M** |
| `IngestEventSchema` strict화 + CLI 버전 협상 (리스크 4 계열) | `shared/src/schemas/events.ts` | **M** |
| auth 경로 단위 테스트 (auth-actions, jwt, password-reset) | §3 구멍 목록 | **M** |
| `daily-rollup.ts` 분해(707줄, userStats 병합 로직 중복) + deprecated overload 제거(`:582`의 `@deprecated`를 `weekly-report.ts`가 아직 호출) | `lib/server/daily-rollup.ts` | **L** |
| next-auth beta 탈출(`5.0.0-beta.30`), `eslint-config-next ^16` vs `next 15` 메이저 불일치 해소, bcryptjs 2→3 | `packages/web/package.json` | **L** |
| 웹 토큰 수명 분리: 브라우저 세션용 short-lived 토큰 도입 (리스크 2 해소) | `jwt.ts`, `auth.config.ts` | **L** |

## 부록 — 이번 작업에서 변경한 것

- `packages/shared`: vitest 셋업 신규 (`vitest.config.ts`, `package.json`에 `test` 스크립트 +
  `vitest` devDep, `tsconfig.build.json` 신설 — cli와 동일한 "typecheck는 테스트 포함,
  빌드는 테스트 제외" 패턴. build 스크립트가 `tsc` → `tsc -p tsconfig.build.json`으로 바뀌었고
  dist 산출물은 테스트 파일 제외 외에 동일함을 빌드로 확인). 테스트 27개 신규.
- `packages/cli`: `src/lib/config.test.ts` 신규 12개 (homedir mock, 실제 홈 디렉토리 비접촉).
- `packages/web`: `src/lib/server/admin-auth.test.ts` 12개, `src/lib/server/slug.test.ts` 10개 신규.
  기존 컨벤션(`vi.mock('server-only')`, `@/lib/server/db` mock)을 따름.
- 앱 기능 코드는 수정하지 않았다. 기존 테스트도 수정하지 않았다.
- 검증: `pnpm install --frozen-lockfile` ✓ · `pnpm --filter @argos/shared build` ✓ ·
  `pnpm -r test` 전체 통과(shared 27 / cli 154 / web 163 + 13 skip) ✓ ·
  `pnpm typecheck --force` 4/4 ✓ · `pnpm lint` 4/4 ✓
