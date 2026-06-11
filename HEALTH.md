# Argos 저장소 건강 리포트

작성일: 2026-06-12 · 기준 브랜치: `agent/spike-2-202606111822` (main 분기점 8db3347)
모든 수치는 이 worktree에서 `pnpm install` → `pnpm --filter @argos/shared build` → `pnpm -r test` → `pnpm typecheck` 실제 실행으로 검증했다.

---

## 1. 개요

Argos는 팀의 Claude Code(및 OpenAI Codex) 사용 패턴을 수집·분석하는 애널리틱스 서비스다 (`README.md`). pnpm + turborepo 모노레포로 3개 패키지로 구성된다. **`packages/cli`** (npm 패키지 `argos-ai`)는 Claude Code/Codex의 hook에 주입되어 세션 이벤트·transcript 사용량을 파싱해 서버로 전송하는 수집기다 (`src/commands/hook.ts`, `src/lib/transcript.ts`). **`packages/web`** (`@argos/web`)은 Next.js 15 대시보드 + 인제스트 API로, Prisma/PostgreSQL에 이벤트를 적재하고 조직/프로젝트 단위 사용량·스킬·비용 집계를 제공한다 (`src/app/api/events/route.ts`, `prisma/schema.prisma`의 14개 모델). **`packages/shared`** (`@argos/shared`)는 두 패키지가 공유하는 타입·zod 스키마·모델 단가표(`src/constants/pricing.ts`)이며, web/cli가 `dist/`를 import하므로 빌드 선행이 필수다.

## 2. 스택과 구조

**핵심 의존성** (각 `package.json` 기준)

- web: Next.js 15 + React 19, Prisma 6 (PostgreSQL), next-auth 5.0.0-beta.30(고정 핀), jose(JWT HS256), zod 3, Tailwind 4, recharts
- cli: commander 12, @inquirer/prompts, chalk, ora — 런타임 의존성 4개로 의도적으로 가볍게 유지 (npm 배포물)
- shared: zod 3 단일 의존성

**빌드/배포 체인**

- 빌드 오케스트레이션: `turbo.json` — `build`는 `^build` 의존(= shared 먼저), 산출물 `dist/**`, `.next/**`
- 배포: Vercel (`vercel.json` — `pnpm turbo build --filter=@argos/web`, region `icn1`). DB 마이그레이션은 빌드에서 분리됨 (`docs/deploy-migration-separation.md`, 커밋 27da509 "D1 remove migrate from build")
- CI: `.github/workflows/ci.yml` — postgres 서비스 컨테이너를 띄우고 `prisma generate → shared build → cli build → typecheck → lint → cli test → prisma migrate deploy → web test → web build` 순서로 실행. **shared의 test는 CI에 없다** (이번에 신설되어서 — §5 참고)
- 로컬 DB: `docker-compose.yml` (postgres:16-alpine)
- shared는 `main: ./dist/index.js`만 노출하므로 (`packages/shared/package.json`) **shared 빌드 없이 web/cli 테스트·typecheck를 돌리면 import 단계에서 깨진다**

## 3. 테스트 현황

프레임워크는 전 패키지 vitest 3.2.6, 환경 `node`. 이번 작업으로 shared에 vitest를 신규 셋업했고 (`packages/shared/vitest.config.ts`), cli/web에 무방비 로직 테스트를 추가했다. 아래는 추가 **후** 수치.

| 패키지 | 테스트 파일 | 테스트 수 | 커버 영역 | 주요 구멍 |
|---|---|---|---|---|
| shared | 4 (신규) | 42 (신규) | 모델 단가 정규화(`pricing.test.ts`), 인제스트/인증/프로젝트 zod 스키마(`schemas/*.test.ts`) | 타입 정의는 테스트 불요. CI에 미포함 (§5) |
| cli | 12 (+1) | 151 (+9) | 명령 4종 플로우(`__tests__/*`), transcript 파서 Claude/Codex(`lib/transcript*.test.ts`), hook 주입 멱등성, 이벤트 전송 self-heal 스크립트, **신규: `lib/config.test.ts`(normalizeApiUrl 신뢰 경계)** | `lib/auth-flow.ts`(브라우저 로그인 폴링), `lib/api-client.ts`, `lib/adapters.ts` — 전부 I/O 글루지만 폴링 타임아웃 분기는 무방비 |
| web | 14 (+1) | 169 (156 통과 + 13 skip, +15) | 순수 로직 11모듈(cost, rbac 35개, weekly-report, slash-command 등), API 라우트 2개(events, dashboard/skills), **신규: `lib/server/dashboard.test.ts`(parseDateRange/parsePagination)** | **API 라우트 35개 중 2개만 테스트** (아래 리스크 1). 인증 코어 4모듈 무테스트 (리스크 2) |

- DB 의존 테스트 13개(`skill-aggregation.test.ts` 7, `dashboard/skills/route.test.ts` 5, `daily-rollup.test.ts` 1)는 `DATABASE_URL` 미설정 시 silent skip된다 (`const describeWithDb = HAS_DB ? describe : describe.skip`, daily-rollup.test.ts:136-137). CI는 postgres 컨테이너가 있어 실제로 실행되지만, 로컬에서 13개가 조용히 빠진 채 "전체 그린"으로 보일 수 있다.
- `packages/web/vitest.config.ts`에 원격 `DATABASE_URL` 차단 가드가 있다 (공유 Supabase 오염 방지) — 좋은 패턴.
- **기존 테스트는 한 건도 수정하지 않았다.** 베이스라인(cli 142, web 141+13skip)이 전부 통과 상태였다.

## 4. 리스크 상위 5

**R1 (높음) — API 라우트 35개 중 33개가 무테스트, 특히 인증·권한 라우트.**
근거: `packages/web/src/app/api/` 전체에서 `route.test.ts`는 `events/`와 `orgs/[orgSlug]/dashboard/skills/` 2개뿐. `auth/cli-callback`, `auth/cli-poll`, `admin/impersonation`, `orgs/[orgSlug]/members/[memberUserId]` 등 권한 분기가 많은 라우트가 전부 무방비다. 직전 커밋 이력(9ce5242 "T1-B access control bugs — A2 session IDOR, A5 cli-poll 1-use token")이 보여주듯 **이 영역에서 실제 접근제어 버그가 반복 발견**됐는데, 그 수정들을 고정하는 회귀 테스트가 없다. 터지는 시나리오: 멤버 관리 라우트 리팩터링 시 IDOR류 버그가 소리 없이 재발.

**R2 (높음) — 인증 코어 4모듈(`jwt.ts`, `admin-auth.ts`, `auth-actions.ts`, `auth-helper.ts`) 단위 테스트 0.**
근거: `packages/web/src/lib/server/admin-auth.ts`의 HMAC 쿠키 파싱(`username.expiresAt.nonce.sig` 4분할)·60초 impersonation 토큰 검증, `auth-actions.ts:96-120`의 onboard 토큰 1회용 race guard(`updateMany().count === 0` 판정), `jwt.ts`의 catch-all → null. 전부 분기 많은 결정적 로직인데 안전망이 없다. 터지는 시나리오: 쿠키 포맷 필드 추가 등 사소한 수정에서 만료/서명 검증 분기가 어긋나도 테스트가 잡지 못함.

**R3 (중간) — `requireAuth` 토큰 캐시의 revocation 지연 + FIFO eviction.**
근거: `packages/web/src/lib/server/auth-helper.ts:8-38` — 검증 결과를 60초 캐시하므로 **revoke된 CLI 토큰이 최대 60초간 계속 통과**한다(주석으로 인지된 tradeoff). 또한 500개 초과 시 insertion-order로 가장 오래된 엔트리를 제거하는 FIFO라, 동시 활성 토큰이 500을 넘으면 캐시가 계속 밀려나 매 요청 DB 조회로 회귀한다. 터지는 시나리오: 유출 토큰 강제 revoke 후 60초 창구, 또는 대규모 팀 도입 시 인증 경로 DB 부하 급증.

**R4 (중간) — `parseDateRange`의 조용한 보정·swap 동작 (이번에 테스트로 고정).**
근거: `packages/web/src/lib/server/dashboard.ts:127-160`. (a) 시각이 포함된 `to`(`2026-04-16T10:00:00Z`)도 무조건 그 날의 끝 23:59:59.999로 덮어써 시각 정보가 유실되고, (b) `from > to`면 에러 대신 둘을 맞바꾼다 — `from` 생략 + 31일 전 `to`를 주면 호출자가 의도한 "~4/16까지"가 "4/16~now-30d"로 둔갑한다. 모든 대시보드 라우트가 이 함수를 쓴다. 현재 동작을 `dashboard.test.ts`에 `// TODO(bug):` 2건으로 고정해 두었다.

**R5 (중간/낮음) — 입력 정규화 2건의 경계 누락 (이번에 테스트로 고정).**
(a) `packages/cli/src/lib/config.ts:23-32` `normalizeApiUrl`: 스킴 없는 `localhost:3000`을 URL 파서가 `localhost:`라는 scheme으로 오파싱해 hostname이 빈 문자열이 되고, 기본 서비스 판정을 비껴가 **커스텀 URL로 그대로 저장**된다 → 이후 fetch가 런타임에서 실패. `config.test.ts`에 TODO(bug)로 고정. (b) `packages/shared/src/constants/pricing.ts`의 `PREFIX_FALLBACKS`는 토큰 경계 없는 `startsWith` 매칭이라 가상의 신모델 `gpt-5-40`이 `gpt-5-4` 단가로 조용히 계산된다 → 신모델 출시 시 비용 추정 전체가 어긋나도 경고가 없다. `pricing.test.ts`에 TODO(bug)로 고정.

## 5. 부채와 빠른 개선 기회

| 항목 | 크기 | 내용 |
|---|---|---|
| CI에 shared 테스트 추가 | S | `ci.yml`에 `pnpm --filter @argos/shared test` 한 줄. 이번 작업은 CI 수정 금지 제약으로 보류 — 현재 신규 42개 테스트가 CI에서 돌지 않는다 |
| shared exports 조건 순서 | S | `packages/shared/package.json:8-11` — `types`가 `import`/`require` 뒤에 있어 esbuild가 "types 조건 도달 불가" 경고. `types`를 첫 번째로 |
| 비원자적 설정 파일 쓰기 | S–M | `hooks-inject.ts:101`, `project.ts:84`가 `writeFileSync` 직접 호출 — 동시 실행 시 파일 깨짐 가능. 같은 패키지 `event-sender.ts`에 이미 tmpfile+rename 원자적 쓰기 패턴이 있으니 재사용 |
| `normalizeApiUrl` 스킴 검증 | S | `http(s):` 프로토콜만 허용하면 R5(a) 해소. 고정 테스트가 있으니 안전하게 수정 가능 |
| pricing prefix 경계 | S | `startsWith(prefix)` → `normalized === prefix \|\| normalized.startsWith(prefix + '-')`로 R5(b) 해소 |
| 인증 라우트 테스트 하네스 | M | `events/route.test.ts`에 mock 패턴이 이미 확립돼 있어 그대로 확장 가능. R1/R2 해소 경로 |
| auth-helper 캐시 LRU/TTL 정리 | M | R3. revocation 시 캐시 즉시 무효화(revoke 경로에서 `tokenCache.delete`) 추가가 최소 수정 |
| dotenv v17 stdout 광고 | S | 테스트 출력에 `tip: ⌁ auth for agents [www.vestauth.com]` 등 dotenv 홍보 문구가 섞임 (`skill-aggregation.test.ts:17`의 직접 로드 경로). `DOTENV_CONFIG_QUIET=true` 또는 vitest env 주입으로 일원화 |
| web 컴포넌트·페이지 레이어 | L | `src/` 170개 파일 중 테스트는 lib 중심. UI는 스크린샷/브라우저 검증 전략이 문서화돼 있으나 (`docs/testing.md`) 자동화는 없음 |

---

## 부록 — 이번 작업의 변경 사항과 판단 근거

- **shared vitest 셋업**: `vitest.config.ts`(cli와 동일 패턴), `package.json`에 `test`/`test:watch` 스크립트와 `vitest ^3.2.6` devDep 추가. 빌드 산출물(`dist/`)에 테스트가 섞이지 않도록 cli의 기존 관례(`packages/cli/tsconfig.build.json`)를 그대로 미러링해 `tsconfig.build.json`을 신설하고 build 스크립트를 `tsc` → `tsc -p tsconfig.build.json`으로 변경했다. 산출물은 테스트 파일 제외만 다르고 동일함을 빌드 후 `dist/` 비교로 확인.
- **앱 기능 코드는 한 줄도 변경하지 않았다** (export 추가도 불필요했음 — 대상 함수들이 모두 이미 export됨).
- **기존 테스트 수정 0건.**
- 신규 테스트 66개: shared 42, cli 9 (`lib/config.test.ts`), web 15 (`lib/server/dashboard.test.ts`). 버그로 보이는 동작 4건은 고치지 않고 현재 동작으로 고정 + `// TODO(bug):` 주석 + 위 R4/R5에 기록했다.
