# Argos 저장소 건강 리포트

> 작성: 2026-06-12, 자율 에이전트 (worktree `agent/spike-5-202606111911`).
> 모든 수치는 이 시점의 `pnpm -r test` / `turbo typecheck --force` 실측 기준.

## 1. 개요

Argos는 팀 단위 Claude Code·Codex 사용량 애널리틱스다. 에이전트 훅이 발사될 때마다
세션 메타·토큰·툴 호출·전사를 수집해 대시보드로 보여준다 (`README.md`).
pnpm 워크스페이스 모노레포로 3개 패키지로 구성된다:
**`packages/cli`** (npm 패키지 `argos-ai`) 는 훅 설치(`src/lib/hooks-inject.ts`)와
transcript 파싱(`src/lib/transcript.ts` 278줄, `transcript-codex.ts` 211줄), fire-and-forget
이벤트 전송(`src/lib/event-sender.ts`)을 담당한다. **`packages/shared`** 는 zod 입력 계약
(`src/schemas/`)과 모델 단가표(`src/constants/pricing.ts`)를 cli·web 양쪽에 공급한다.
**`packages/web`** 은 Next.js 15 대시보드 + 수집 API(`src/app/api/events/route.ts`)로,
Prisma 6 / PostgreSQL (모델 15개, `prisma/schema.prisma` 372줄)에 적재한다.

## 2. 스택과 구조

- **빌드 체인**: pnpm 9 워크스페이스 + turbo 2 (`turbo.json` — build는 `^build` 의존,
  `dist/**`·`.next/**` 캐시). shared/cli는 `tsc`(NodeNext, strict), web은 `next build`.
  web·cli가 shared의 **`dist/`를 import** 하므로 shared 빌드가 선행돼야 한다
  (CI도 `pnpm --filter @argos/shared build`를 typecheck 전에 실행, `.github/workflows/ci.yml`).
- **핵심 의존성**: Next 15 / React 19 / Tailwind 4 / Prisma 6 / `next-auth@5.0.0-beta.30`(베타 핀)
  / zod 3 / vitest 3.2.6. CLI는 commander 12 + @inquirer/prompts.
- **배포**: Vercel (`vercel.json` — region `icn1`, `@argos/web`만 빌드). 로컬 DB는
  `docker-compose.yml`의 postgres:16-alpine. 마이그레이션은 빌드와 분리
  (`docs/deploy-migration-separation.md`).
- **CI** (`.github/workflows/ci.yml`): postgres 서비스 → install → prisma generate →
  shared/cli 빌드 → typecheck/lint → **cli 테스트** → migrate deploy → **web 테스트** → web 빌드.
  보조로 dependency-review, OSV-Scanner 워크플로우가 있다.
- **인증**: next-auth(JWT) + CLI 토큰(JWT를 SHA-256 해시로 `CliToken`에 저장해 폐기 추적)
  + 관리자 HMAC 서명 쿠키(`src/lib/server/admin-auth.ts`, timing-safe 비교).

## 3. 테스트 현황 (이번 작업 반영 후)

| 패키지 | 파일 | 테스트 | 커버 영역 | 주요 구멍 |
|---|---|---|---|---|
| `packages/cli` | 12 | **152** (기존 142 + 신규 10) | 커맨드 오케스트레이션(DI 기반, `src/__tests__/`), transcript 양쪽 파서, event-sender, project 설정 I/O. 신규: `src/lib/config.test.ts` — `normalizeApiUrl` 셀프호스트 URL 게이트 | `auth-flow.ts`(브라우저 폴링 로그인), `api-client.ts`(fetch 래퍼) — 네트워크 의존이라 정책상 단위 테스트 제외 영역 |
| `packages/shared` | 4 | **38** (기존 0 → 신규 38) | **이번에 vitest 신규 셋업.** zod 계약 3종(`schemas/*.test.ts`) + 단가표 invariant(`constants/pricing.test.ts`) | 없음 (전 모듈 커버; 단가 골든패스는 web의 `cost.test.ts`가 기존 커버) |
| `packages/web` | 15 | **174 + 13 skip** (기존 141 + 신규 33) | 비용 계산, 롤업/주간 리포트, RBAC, 스킬 집계, events 라우트(mock). 신규: `src/lib/format.test.ts`(24), `src/lib/session-files.test.ts`(9) | UI 컴포넌트(정책상 수동 검증), `lib/server/dashboard.ts`·`auth-actions.ts` 등 Prisma 직결 모듈. **DB 의존 suite 13개는 `DATABASE_URL` 없으면 silent skip** |

- 신규 테스트 합계 **81개**. 기존 테스트는 한 줄도 수정하지 않았다 (실행도 깨져 있지 않았음).
- shared 셋업 내역: `vitest` devDep + `test` 스크립트 + `vitest.config.ts` 추가,
  빌드를 `tsc` → `tsc -p tsconfig.build.json`으로 변경해 테스트 파일이 `dist/`에 들어가지 않게 함
  (cli의 기존 패턴과 동일, `packages/cli/tsconfig.build.json` 참조). 변경 후 `dist/` 산출물에
  test 파일 0개임을 확인했고 `pnpm -r test`·`turbo typecheck --force`·`pnpm lint` 전부 통과.
- **주의: CI는 shared 테스트를 실행하지 않는다.** `ci.yml`이 `pnpm --filter argos-ai test`와
  `pnpm --filter @argos/web test`만 명시 호출한다. CI 설정 수정은 이번 작업 제약상 금지라
  반영하지 못했다 — 아래 5장 첫 항목 참조.

## 4. 리스크 상위 5

1. **[높음] 수집 API가 음수·소수 토큰을 그대로 받는다.**
   `packages/shared/src/schemas/events.ts:6-12`의 `UsagePayloadSchema`가 `z.number()`만 쓰고
   `.int().nonnegative()`가 없다. 버그 있는(또는 악의적인) 클라이언트가 음수 usage를 보내면
   `UsageRecord` → `DailyProjectStat` 롤업까지 비용·토큰 집계가 음수로 오염되고, 늦게 도착한
   이벤트의 캐시 무효화 경로(커밋 94ff630의 B1)로도 정정되지 않는다. 현재 동작은
   `packages/shared/src/schemas/events.test.ts`의 `TODO(bug)` 테스트로 고정해 두었다.

2. **[높음] 신모델 단가가 조용히 틀린다.**
   `packages/shared/src/constants/pricing.ts:110-114`는 prefix 매칭 실패 시 무조건 Sonnet
   단가(`default`)로 떨어지고, `gpt-5-6` 같은 미래 마이너는 `gpt-5` prefix에 흡수된다
   (`pricing.test.ts`의 `TODO(bug)` 테스트로 고정). 경고는
   `packages/web/src/lib/server/cost.ts:14-19`에서 **프로세스당 1회** `console.warn`뿐이라
   서버리스(Vercel) 환경에선 사실상 관측 불가. 터지는 시나리오: opus-5 출시 → 전 조직의
   비용 대시보드가 수 주간 과소 표시 → 예산 의사결정 오염.

3. **[중간] 테스트 그린이 실제 커버리지를 과대 표현한다.**
   (a) CI(`.github/workflows/ci.yml`)가 패키지를 명시 필터링해서 **shared 테스트 38개가 CI에서
   안 돈다.** (b) web의 DB 의존 suite 13개는 `DATABASE_URL` 미설정 시 silent skip
   (`src/lib/server/skill-aggregation.test.ts:178`, `daily-rollup.test.ts:136`) — 로컬·worktree에선
   항상 "그린"으로 보인다. (c) turbo 캐시가 worktree 간 공유되어 typecheck가 다른 worktree의
   로그를 재생하는 것을 이번 검증 중 실측 관찰 — `--force` 없이는 검증 신호가 신선하지 않다.

4. **[중간] CLI 인증 deny 경로의 에러 무시.**
   `packages/web/src/app/api/auth/cli-callback/route.ts:39-41`에서 사용자가 CLI 로그인 요청을
   거부할 때 `db.cliAuthRequest.update(...).catch(() => {})`로 실패를 삼킨다. update가 실패하면
   요청이 deny되지 않은 채 남아 만료 전까지 승인 가능 상태가 유지될 수 있다(거부 의사가
   무시되는 창). 같은 계열로 `packages/cli/src/lib/event-sender.ts`는 전 구간 fire-and-forget
   (72, 77, 92, 103-106행 — ADR-006의 의도된 설계)이라 텔레메트리 유실이 어디서도 보이지 않는다.

5. **[중간] 대시보드 포맷터 엣지 버그 3건 (사용자 가시).**
   `packages/web/src/lib/format.ts` — (a) 73-76행: base보다 이른 timestamp가 `"+-1m"`로 렌더
   (out-of-order 이벤트에서 발생), (b) `formatTokens(999_999)` → `"1000.0K"` (M 경계 반올림),
   (c) `formatDurationMs(59_999)` → `"60s"` (min 경계). 셋 다 `src/lib/format.test.ts`에
   `TODO(bug)` 주석과 함께 현재 동작으로 고정해 두었다 — 고치면 해당 테스트를 기대값만 바꾸면 된다.

## 5. 부채와 빠른 개선 기회

| 항목 | 크기 | 내용 |
|---|---|---|
| CI에 shared 테스트 추가 | **S** | `ci.yml`에 `pnpm --filter @argos/shared test` 한 줄 (이번 작업은 CI 수정 금지 제약으로 미반영). 또는 필터 나열 대신 `pnpm -r test`로 통일 |
| `IngestEventSchema` 수치 강화 | **S** | 토큰 필드에 `.int().nonnegative()` — 리스크 #1 해소. 기존 정상 클라이언트는 영향 없음 (음수를 보낼 일이 없으므로), 배포 시 `events.test.ts`의 TODO(bug) 테스트 기대값 반전 |
| `format.ts` 엣지 3건 수정 | **S** | 리스크 #5. 음수 diff 클램프 + 경계 반올림 처리. 테스트가 이미 깔려 있어 기대값 수정만으로 검증 가능 |
| unknown 모델 관측성 | **M** | `cost.ts`의 warn-once를 DB 기록(예: unknown 모델명 테이블) 또는 구조화 로그로 교체 — 리스크 #2의 탐지 시간을 수 주 → 즉시로 단축 |
| `formatLastUsed`/`formatRelativeTime`(단일 인자)의 `Date.now()` 직접 호출 | **S** | `format.ts:91,64` — 시간 주입이 불가능해 테스트에서 제외했다. `now` 파라미터(기본값 `Date.now()`) 주입으로 테스트 가능하게 |
| `next-auth@5.0.0-beta.30` 베타 핀 | **M** | `packages/web/package.json` — 의도된 핀(커밋 27da509)이지만 GA 추적 계획 필요 |
| web `vitest.config.ts`의 수동 `.env.local` 파서 | **S** | 30줄 수제 파서 — 이미 devDep인 `dotenv`로 교체 가능 (skill-aggregation.test.ts는 이미 dotenv 사용) |
| API 라우트 통합 테스트 하네스 | **L** | `docker-compose.yml` postgres가 이미 있으므로 DB 의존 suite를 로컬에서도 기본 실행하게 만드는 것(테스트 전용 DB 컨테이너 + 시드)이 다음 단계. 현재는 mock(`events/route.test.ts`) 또는 skip 양자택일 |
| `slug.ts` 충돌 루프 상한 없음 | **S** | `packages/web/src/lib/server/slug.ts:43-48` — 이론상 무한 루프. suffix 상한 + random fallback |

---

### 이번 작업에서 추가된 파일 (요약)

- `packages/shared`: `vitest.config.ts`, `tsconfig.build.json`,
  `src/constants/pricing.test.ts`(12), `src/schemas/events.test.ts`(12),
  `src/schemas/project.test.ts`(8), `src/schemas/auth.test.ts`(6) + `package.json` 스크립트/devDep
- `packages/web`: `src/lib/format.test.ts`(24), `src/lib/session-files.test.ts`(9)
- `packages/cli`: `src/lib/config.test.ts`(10)
- 앱 기능 코드는 수정하지 않았다. 검증: `pnpm install` → `pnpm --filter @argos/shared build`
  (dist에 테스트 0개) → `pnpm -r test` 전체 통과 (shared 38 / cli 152 / web 174+13skip) →
  `turbo typecheck --force` 4/4 성공 → `pnpm lint` 4/4 성공.
