---
title: 아키텍처 비직관성 — 3중 인증, 타입-전용-import 불변식, SPA화된 App Router
created_at: 2026-06-10T03:40:00Z
resolved: partial
resolved_by: pending-push
priority: P1
status_notes: |
  R1 (CLI eslint consistent-type-imports + no-restricted-imports) — done
  R2 (JWT_SECRET → ADMIN_COOKIE_SECRET 분리) — done
  R3 (WEB_TOKEN_EXPIRATION 분리, 단기만) — deferred; no clear acceptance signal, CLI breakage risk
  R4 (login/route.ts 삭제) — done
  R5 (CliToken source column + migration) — done
  R6–R9: Tier 3
related:
  - docs/findings/2026-06-10T0340-tech-debt-inventory.md
  - docs/findings/2026-06-10T0340-access-control-bugs.md
  - docs/code-architecture.md
---

# 아키텍처 비직관성 — 3중 인증, 타입-전용-import 불변식, SPA화된 App Router

## TL;DR

신규 합류자(사람/에이전트)가 코드 전수 조사 없이는 파악할 수 없는 구조가
누적돼 있다. 핵심 축 4개: 배포 npm 패키지가 문서화 안 된 "타입 전용
import" 불변식 위에 서 있고, 인증 메커니즘이 3중이며, 대시보드가 App
Router 안의 클라이언트 SPA로 1년 토큰을 브라우저에 노출하고, 공식
아키텍처 문서가 존재하지 않는 패키지를 기술한다.

## Body

### R1 — argos-ai(배포 패키지)가 @argos/shared를 devDependency로만 가짐 (P1)

`packages/cli/package.json` — `@argos/shared`가 devDependencies에만 존재.
`packages/cli/src`의 9개 파일(`deps.ts:4`, `adapters.ts:12`,
`lib/event-sender.ts:5`, `lib/auth-flow.ts:4`, `lib/transcript.ts:2`,
`commands/hook.ts:4` 등)이 `import type`으로만 참조해 현재는 동작하지만:
(a) 누군가 zod 스키마를 **값으로** 한 줄 import하면 로컬 빌드·테스트는
전부 통과하고 **배포된 CLI만 런타임 즉사** — 막는 lint 규칙·주석이 없다.
(b) `declaration: true` + `"files": ["dist"]`라 배포물 `dist/deps.d.ts`가
존재하지 않는 private 패키지를 참조 → TS 소비자 타입 해석 불가.

방향: `@typescript-eslint/consistent-type-imports` + `no-restricted-imports`
로 불변식을 기계화하거나, 빌드 시 shared를 인라인(tsup `noExternal`).

### R2 — 인증 메커니즘 3중 구조 + JWT_SECRET 공용 (P1)

한 앱에 ① next-auth v5 beta 세션(`packages/web/src/auth.ts`),
② jose 기반 1년 JWT(`packages/web/src/lib/server/jwt.ts:4` —
`JWT_EXPIRATION = 365일`, 검증은 `auth-helper.ts:40`),
③ 어드민용 수제 HMAC 쿠키(`admin-auth.ts:34-36`)가 공존. ③의 위장
(impersonation) 토큰이 ①의 Credentials provider로 들어가 세션이 됨
(`auth.ts:18-28`). `JWT_SECRET` 하나가 ②서명과 ③HMAC에 공용
(`jwt.ts:6` vs `admin-auth.ts:35`)이라 키 회전 영향 범위 추적이 어렵다.

방향: 인증 매트릭스(주체×토큰×검증기) 문서화, `ADMIN_COOKIE_SECRET` 분리.

### R3 — 대시보드 전체가 클라이언트 SPA + 1년 토큰 브라우저 노출 (P1)

대시보드 13개 page.tsx 전부 `'use client'`
(예: `packages/web/src/app/dashboard/[orgSlug]/overview/page.tsx:1`).
데이터는 react-query → `apiGet(path, token)`(`src/lib/api-client.ts:5`)으로
자기 자신의 `/api/orgs/...`를 Bearer 호출하고, 그 토큰은
`session?.argosToken` — `auth.config.ts:10-16`에서 세션에 실리는 **1년
만료 CLI용 JWT**(`auth-actions.ts:23-35`)다. RSC/서버 페칭이 전혀 없어
App Router 선택이 무의미하고, XSS 시 1년 토큰이 통째로 탈취된다.

방향: 내부 대시보드 API는 next-auth 세션(쿠키) 인가로 전환, Bearer JWT는
CLI 전용으로 한정. 최소한 웹용 토큰 만료를 세션 수준으로 단축.

### R4 — 호출자 없는 공개 엔드포인트 POST /api/auth/login (P1)

`packages/web/src/app/api/auth/login/route.ts:10-24` — 이메일/비밀번호로
1년 JWT를 JSON 반환하는데 CLI(브라우저 플로우 `cli-request`/`cli-poll`/
`exchange` 사용, `packages/cli/src/adapters.ts:29-34`)도 웹(next-auth
`signIn`)도 호출하지 않는다. rate-limit 없는 크리덴셜 스터핑 표면이자
죽은 코드. 또한 next-auth basePath인 `/api/auth/*` 아래에 커스텀 라우트
(login/logout/me/register/cli-*)와 `[...nextauth]`가 섞여 소관 구분 불가.

방향: 미사용 라우트 삭제, 커스텀 인증 라우트는 `/api/cli-auth/*`로 격리.

### R5 — CliToken 테이블이 웹 로그인 세션까지 저장 (P1, 이름-실체 불일치)

`packages/web/src/lib/server/auth-actions.ts:23-35`
(`issueAuthResultForUser`)가 `db.cliToken.create`를 수행하는데, 이 함수는
웹 next-auth authorize(`auth.ts:37`)·register·어드민 위장 모두에서 호출됨
→ **모든 웹 로그인이 cliToken 행을 생성**. "CLI 토큰 일괄 폐기" 같은 운영
판단을 그르치게 한다.

방향: `ApiToken`으로 리네이밍 + `source: CLI|WEB|IMPERSONATION` 컬럼.

### R6 — /admin 보호가 페이지 단위 자율 방어 (P2)

`packages/web/src/middleware.ts:17` — `pathname.startsWith('/dashboard')`만
보호. `/admin`은 `src/app/admin/page.tsx:8`의 `hasAdminSession()` 개별
호출에 의존 — 새 admin 페이지에서 호출을 빠뜨리면 조용히 무방비.

방향: `app/admin/layout.tsx` 일괄 가드 또는 middleware 보호 경로 추가.

### R7 — 서비스 레이어 비일관 (P2)

`src/app/api/**` 중 23개 route가 `@/lib/server/db`를 직접 import.
`api/events/route.ts`는 284줄 인제스트 파이프라인을 핸들러에 인라인한
반면 projects/auth는 `*-actions.ts` 서비스 경유.
`dashboard/sessions/route.ts:34-66`의 매핑 로직은 라우트 안에 있는데
`lib/server/dashboard-row-mapping.ts`라는 매핑 전용 모듈이 따로 존재.
계약 타입 위치도 비일관 — 대부분 `packages/shared/src/types/dashboard.ts`,
`WeeklyReport`만 `packages/web/src/types/reports.ts`.

방향: "라우트는 인증·파싱·HTTP 매핑만, 도메인 로직은 lib/server/*-actions",
"계약 타입의 shared 수록 기준" 두 규칙을 명문화.

### R8 — 에이전트 워크플로 메타와 제품 코드의 무경계 혼재 (P2)

루트에 `goals/`, `cycles/`, `iterations/`, `tasks/`, `prompts/`,
`guidelines/`, `persuasion-data/`, `cc-test/`, `scripts/`(제품 스크립트가
아닌 하네스 오케스트레이션 `run-phases.py`, `next-task.sh`)가 `packages/`와
나란히 존재. `tasks/`(하네스 산출물)와 `docs/tasks/`(작업 로그)로 "tasks"가
두 곳. goal↔cycle↔iteration 관계는 각 디렉터리 AGENTS.md를 읽어야만 파악
가능하고 루트 README는 이들을 언급하지 않는다.

방향: 메타 일체를 `.harness/` 하위로 이동하거나 루트 README에 디렉터리 맵
한 단락 추가.

### R9 — lint/typecheck가 의존 패키지 빌드 산출물을 요구 (P2)

`turbo.json` — `lint`/`typecheck` 모두 `dependsOn: ["^build"]`. 원인은
`packages/shared/package.json`이 `dist/`만 export하기 때문. shared 수정 후
재빌드를 잊으면 web/cli가 낡은 타입으로 통과/실패하는 헛 디버깅 유발,
에디터 점프도 dist의 d.ts로 떨어진다.

방향: 내부 전용이므로 exports를 `./src/index.ts` 직접 참조(JIT 패키지
패턴) 또는 tsconfig paths로 src 매핑.

## Acceptance signal

- R1: `pnpm --filter argos-ai exec eslint src`가 값-import 시 fail하는 규칙
  존재 + `dist/*.d.ts`에 `@argos/shared` 참조 0건.
- R2: 인증 매트릭스 문서(docs/) 존재 + `grep JWT_SECRET packages/web/src/lib/server/admin-auth.ts` 0건.
- R4: `src/app/api/auth/login/route.ts` 삭제됨.
- R6: admin layout 가드 또는 middleware에 `/admin` 포함.

## Resolution (P1)

**R1** (`packages/cli/eslint.config.mjs`): `@typescript-eslint/consistent-type-imports` + `@typescript-eslint/no-restricted-imports` (allowTypeImports: true) 추가. 값-import 시 fail, `import type`은 통과.

**R2** (`lib/server/admin-auth.ts` + `env.ts` + `.env.example`): `admin-auth.ts`에서 `JWT_SECRET` 참조 제거. `env.ts`에서 `ADMIN_COOKIE_SECRET`을 해결(fallback: JWT_SECRET)해 `admin-auth.ts`는 `ADMIN_COOKIE_SECRET`만 사용. `.env.example`에 `ADMIN_COOKIE_SECRET` 추가.

**R4** (`packages/web/src/app/api/auth/login/route.ts`): 호출자 0건 확인 후 삭제. rate-limit 없는 크리덴셜 스터핑 표면 제거.

**R5** (`prisma/schema.prisma`, migration, `auth-actions.ts`, `auth.ts`): `TokenSource` enum + `CliToken.source` 컬럼 추가. `issueAuthResultForUser`, `issueUserAuthResult`, `loginUser`에 `source` 파라미터 추가. impersonation → `'IMPERSONATION'`, web login → `'WEB'`, CLI → `'CLI'` (default).
