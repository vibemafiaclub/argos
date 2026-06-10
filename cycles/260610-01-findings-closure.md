---
cycle: 260610-01
title: 2026-06-10 findings closure — security, gates, data-integrity, debt
authored_at: 2026-06-10T09:00:00+09:00
started_at: 2026-06-10T09:30:00+09:00
completed_at:
status: running
---

# 260610-01 — 2026-06-10 findings closure

**목표**: 2026-06-10 감사에서 생성된 6개 finding을 우선순위 순서대로 닫는다.
P0(보안·게이트) → P1(데이터 정합성·배포·아키텍처) → P2(코드 품질·부채).
매 작업 단위 완료 시 commit + push.

이 문서를 에이전트에게 **무한 루프 모드**로 넘긴다:
`cycles/260610-01-findings-closure.md 의 내용을 모두 완수할 때까지 작업해줘.`

**시작 상태**: chain 상태 `scripts/completion-check.sh`로 확인, `.state/active-goal`
없음. 다음 빈 goal 번호 1(`goals/0-event-pipeline.md` 기준). 작업 브랜치 유지.

---

## 루프 알고리즘

```
step 0 — 최초 1회: 이 문서 frontmatter 갱신 (started_at, status: running) → commit.

LOOP:
  step 1 — chain 상태: bash scripts/completion-check.sh
    exit 0 (ALL_DONE)  → step 2
    else               → .state/active-goal 의 goal 을 TDD 로 GREEN (goal-iteration.md Phase 4)
                         → commit + push → step 1
  step 2 — finding 진행: 아래 Target 리스트 순서대로 첫 unresolved 선택
    없음               → TERMINATE
    있음               → "Finding 처리 절차" → frontmatter 갱신 → commit + push → step 1
```

종료 조건 (셋 다): (1) 모든 in-scope target 이 `resolved: true` 또는 명시
`partial` + blocker 기록, (2) `completion-check.sh` exit 0, (3) `git status`
clean + push 완료. 종료 시 frontmatter `completed_at`/`status` 갱신.

**막혀도 종료하지 마라.** 3 TDD 사이클 무진전 → blocker 기록 → 다음 target.

---

## Target findings (실행 순서)

### Tier 1 — P0: chain-blocker · 보안 (먼저)

#### T1-A. `docs/findings/2026-06-10T0340-quality-gate-gaps.md` — 품질 게이트 3중 누수

**의존성**: 이 finding을 먼저 고쳐야 이후 모든 작업의 테스트 신뢰도가 생긴다.
처리 순서: **G2(테스트 DB 격리) → G1(CI 보강) → G3(shallow-run 선언 구분)**.
G2 없이 G1부터 하면 원격 DB 테스트가 CI에서 무음 skip되어 가짜 안심만 는다.

- **G2** (P0): `packages/web/vitest.config.ts`에 `DATABASE_URL`이
  `localhost`/`127.0.0.1`이 아니면 테스트를 exit 1(또는 전체 suite skip)하는
  allowlist 가드 추가. `docker-compose.yml`(루트)을 활용해 로컬 Postgres
  컨테이너 기동 스크립트 설정. 기존 DB 의존 테스트(skill-aggregation,
  daily-rollup, skills route)가 로컬 DB로 통과하는 것 확인.
- **G1** (P0): `.github/workflows/ci.yml`에 `pnpm --filter @argos/web test` +
  `pnpm -r run lint` + `pnpm -r run typecheck` 스텝 추가.
  postgres service container(image: postgres:16) 추가해 G2 가드가 CI에서
  통과하도록 환경 변수(`DATABASE_URL=postgresql://...@localhost:5432/...`) 설정.
- **G3** (P0): `scripts/completion-check.sh:44`의 `GATES_SKIP_DEEP` 기본값을
  `0`으로 변경, 또는 `GATES_SKIP_DEEP=1` 실행 시 `"ALL GOALS ACHIEVED"` 대신
  `"[SHALLOW PASS — deep gates skipped]"` 출력 + exit 1로 수정.

**Acceptance signal**:
- CI 로그에 web 154개 테스트 pass 기록.
- `grep "pooler.supabase.com" packages/web/vitest.config.ts` → 0 또는 allowlist
  가드 구문 존재.
- `GATES_SKIP_DEEP=1 bash scripts/completion-check.sh` 출력에
  "ALL GOALS ACHIEVED" 미포함.

**promote 여부**: G2·G1은 gate-verifiable universal invariant이고 multi-step RED/GREEN
이므로 goal 승격 후보. 단, 하나의 goal(`goals/1-ci-hardening.md`)로 묶어 승격 권장.
직접 처리가 짧다면 직접 닫아도 무방.

---

#### T1-B. `docs/findings/2026-06-10T0340-access-control-bugs.md` — API 접근 제어 결함

**의존성**: 없음. T1-A와 독립, 보안 버그라 T1-A 완료 후 즉시 시작.
처리 순서: A1 → A2 → A3 → A5 (A4는 P1이라 Tier 2 처리 가능, 여기서 함께 닫아도 됨).

- **A1** (P0): `packages/web/src/app/api/orgs/[orgSlug]/members/route.ts:80-130`
  — POST 핸들러에 초대 토큰 검증 추가. 단기: 요청 body에 초대 토큰이 없으면
  403 반환. 중기: 초대 기반 플로우(invite → accept)로 전환.
  최소 변경: `if (!inviteToken) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })`.
- **A2** (P0): `sessions/[sessionId]/route.ts:23-44`(GET), `:145-178`(DELETE)에
  `resolveOrgScopedProjectIds` 또는 `assertProjectAccess`로 세션의 `projectId`
  접근권 검증 추가. 해당 세션이 요청자 접근 가능 프로젝트에 속하지 않으면 404.
- **A3** (P0): `api/projects/[projectId]/route.ts:97-115` DELETE 핸들러에
  role 검사 추가 — `OWNER` 또는 `MANAGER`만 허용. `assertProjectAccess` 내부
  또는 핸들러 앞에서 `if (membership.role === 'MEMBER' || membership.role === 'VIEWER')`
  → 403.
- **A5** (P1): `api/auth/cli-poll/route.ts:30-33` — 토큰 반환 후
  `cliAuthRequest` 행 삭제 또는 token 컬럼 null 처리(1회 소비).

**Acceptance signal**:
- 비멤버 `POST /api/orgs/<slug>/members` → 403.
- 타 프로젝트 MEMBER의 `GET/DELETE .../sessions/<id>` → 404/403.
- MEMBER의 `DELETE /api/projects/<id>` → 403.
- cli-poll 2회째 호출 → token 미반환.

---

### Tier 2 — P1: 데이터 정합성 · 배포 · 아키텍처

#### T2-A. `docs/findings/2026-06-10T0340-data-integrity-bugs.md` — rollup 캐시 누락 + 회원가입 레이스

- **B1** (P1): `packages/web/src/lib/server/daily-rollup.ts` ingest 시점에
  이벤트 timestamp가 과거 일자면 해당 일자 캐시 행을 무효화(delete). 구체적으로
  `api/events/route.ts`의 `UsageRecord` insert 직후, insert된 레코드의
  `startedAt` 날짜에 해당하는 `DailyRollupCache` 행이 존재하면 삭제.
- **B2** (P2): `auth-actions.ts:120-134` `create` 호출을 try/catch로 감싸
  Prisma P2002 → 409 `EMAIL_IN_USE` 응답으로 매핑.

**Acceptance signal**:
- "과거 일자 UsageRecord insert 후 같은 일자 rollup 재조회 시 반영" 단언 테스트
  red→green.
- 동일 이메일 2회 등록 시뮬(P2002 mock) → 409 응답 테스트 red→green.

---

#### T2-B. `docs/findings/2026-06-10T0340-tech-debt-inventory.md` — 배포·의존성 부채 (P1 항목)

- **D1** (P1): `vercel.json:4` buildCommand에서 `db:migrate` 제거. 마이그레이션을
  별도 배포 스텝(Vercel `deploymentUrl` 훅 또는 GitHub Actions pre-deploy job)으로
  분리하는 계획을 `docs/` 에 1-page 메모 작성. (빌드 명령 수정만 최소 커밋.)
- **D3** (P1): `packages/web/package.json`에서 `shadcn`을 `devDependencies`로
  이동. `pnpm install` 후 빌드 통과 확인.
- **D2** (P1): `next-auth` 정확 버전(`5.0.0-beta.30`) 핀 고정 —
  `"next-auth": "5.0.0-beta.30"`. GA 전환 계획은 주석/status_notes로.

P2 항목(D4–D12)은 Tier 3에서 처리.

**Acceptance signal**:
- `grep "db:migrate" vercel.json` → 0.
- `pnpm why shadcn` 결과 devDependencies 경로만 표시.
- 빌드 통과.

---

#### T2-C. `docs/findings/2026-06-10T0340-architecture-unintuitive.md` — 아키텍처 비직관성 (P1 항목)

P1 항목만 처리. P2(R6–R9)는 Tier 3.

- **R1** (P1): `packages/cli/.eslintrc` 또는 `eslint.config.*`에
  `@typescript-eslint/consistent-type-imports` + `no-restricted-imports` 규칙 추가해
  값-import 시 fail. `pnpm --filter argos-ai exec eslint src` 통과.
- **R4** (P1): 사용자 없는 `packages/web/src/app/api/auth/login/route.ts` 삭제.
  삭제 전 grep으로 호출처 0건 확인.
- **R5** (P1): `issueAuthResultForUser` → `db.cliToken.create` 로직에
  `source: 'WEB'|'CLI'|'IMPERSONATION'` 컬럼 추가(Prisma migration). 함수 호출처
  각각 적절한 source 값 전달.
- **R2** (P1 — 부분): `admin-auth.ts:35`의 `JWT_SECRET` 참조를 `ADMIN_COOKIE_SECRET`
  환경 변수로 분리. `.env.example` 업데이트. (인증 매트릭스 문서는 out-of-scope —
  설계 논의 필요.)
- **R3** (P1 — 단기만): 웹 대시보드 Bearer 토큰의 만료를 session 수준으로 단축
  (`jwt.ts:4` `JWT_EXPIRATION`을 별도 `WEB_TOKEN_EXPIRATION` 환경변수로 분리해
  기본값 `7d`로 줄이기). 전체 RSC 전환은 out-of-scope(대형 리팩터).

**Acceptance signal**:
- `pnpm --filter argos-ai exec eslint src`가 값-import 시 fail하는 규칙 존재.
- `src/app/api/auth/login/route.ts` 삭제됨.
- `grep JWT_SECRET packages/web/src/lib/server/admin-auth.ts` → 0.

---

### Tier 3 — P2: 코드 품질 · 부채 (깊은 안전 큐)

P2 항목은 chain이 GREEN이고 Tier 1–2 전부 완료된 후 실행. 각 항목은 독립적이므로
순서 자유. 매 항목 완료 시 commit.

**코드 품질** (`docs/findings/2026-06-10T0340-code-quality-issues.md`):

- **Q1**: `jsonError(code, message, status)` 헬퍼 추출, 전 라우트 적용. 클라이언트
  `api-client.ts` 파서 양쪽 호환으로 1차 완충.
- **Q3**: `api/events/route.ts:197-199` 무음 catch에 최소 `console.error` 추가.
- **Q5**: `api-client.ts` apiPost/apiPatch/apiDelete의 에러 파싱 블록을
  `parseApiError(res)` 공용 함수로 추출.
- **Q7**: `createAndWriteProject()` 공용 함수 추출, 3중 복제(`default.ts` 2곳 +
  `setup.ts`) 교체.
- **Q2**, **Q4**, **Q6**, **Q8–Q15**: 위 항목 완료 후 순서대로. Q13(prettier)은
  전파 범위가 크므로 독립 커밋.

**기술 부채** (`docs/findings/2026-06-10T0340-tech-debt-inventory.md`):

- **D4**: `packages/shared/src/types/events.ts` payload 타입을 `z.infer`로 파생.
- **D5**: `docs/code-architecture.md`에서 `packages/api` 언급 제거, 현행
  Next.js 토폴로지로 재작성. `docs/data-schema.md`는 schema.prisma 링크 + ERD 요약만
  유지.
- **D6**: Vercel cron(`vercel.json` crons 필드) 또는 API route에서 만료
  `cliAuthRequest`/`onboardToken`/`passwordResetToken` 정리 쿼리 추가.
- **D8**: 루트 `vercel.json` 또는 `packages/web/vercel.json` 중 실제 읽히는
  1벌만 남기고 삭제.
- **D11**: `git rm -r --cached persuasion-data/runs`, `cc-test/` 삭제 또는
  `.gitignore` 추가.
- D7, D9, D10, D12: 나머지 정리 항목 순서대로.

**아키텍처** (`docs/findings/2026-06-10T0340-architecture-unintuitive.md`):

- **R6** (P2): `app/admin/layout.tsx` 공통 가드 추가.
- **R7** (P2): "라우트는 인증·파싱·HTTP 매핑만" 규칙 `docs/` 또는 `guidelines/`에
  명문화. 대형 인라인 로직(events route 284줄) 리팩터는 별도 finding/goal로 등록.
- **R8** (P2): 루트 README에 `goals/`, `cycles/`, `iterations/` 등 하네스
  디렉터리 맵 한 단락 추가. `.harness/` 이동은 out-of-scope.
- **R9** (P2): `packages/shared/package.json` exports를 `./src/index.ts` 직접
  참조로 변경(JIT 패키지 패턴). turbo.json의 `^build` 의존 제거 후 확인.

**access-control 잔여** (`docs/findings/2026-06-10T0340-access-control-bugs.md`):

- **A4** (P1, Tier 2에서 미처리 시): `updateProjectForUser`에 OWNER/MANAGER
  role 검사 추가.

---

## Out of scope

이 cycle에서 **손대지 않는다**:

- **대시보드 전체 RSC 전환** (R3 full): 전 page.tsx를 Server Component로 전환 +
  next-auth 세션 인가로 API 교체 — 대형 리팩터, 별도 cycle/goal.
- **초대 기반 멤버십 플로우 전체 설계** (A1 full): 단기 403 가드만; 초대 발급·수락
  UI 구현은 별도 goal.
- **CliToken → ApiToken 리네이밍 + source 마이그레이션 전체** (R5 full): Prisma
  마이그레이션 후 전 호출처 일괄 수정 — 범위가 크면 goal 승격.
- **인증 매트릭스 문서** (R2 full): 설계 논의 필요, 직접 코드 변경 없음.
- **webpack/turbo 캐시 전략 재설계** (R9 complex variants): JIT 패턴 적용만.
- **jest/vitest → 실물 DB 전환 설계** (G2 complex): allowlist 가드 + docker-compose
  까지만; 전체 fixture 교체는 개별 PR.
- **설계 결정이 필요한 대형 항목**: 발견해도 finding 등록만.

---

## Finding 처리 절차

각 finding(또는 finding 내 항목):

1. **읽기**: finding 파일 전문 + `related` 경로 확인.
2. **판단**: promote vs. direct.
   - promote: gate-verifiable universal invariant + multi-step RED/GREEN + 의미적으로
     이전 goal과 구별 → `goals/<N>-<slug>.md` 작성 후 finding에 `status_notes: promoted
     to goal N` 추가.
   - direct: 나머지 모두.
3. **실행 (TDD)**:
   - RED: 실패하는 테스트(또는 acceptance signal 검증 커맨드) 먼저.
   - GREEN: 최소 변경으로 통과.
   - REFACTOR: 필요하면.
4. **검증**: Acceptance signal 커맨드 실행해 통과 확인.
5. **마무리**: finding frontmatter `resolved: true`(전체) / `partial`(일부) +
   `resolved_by: <sha>` + 본문 끝 `## Resolution` 섹션 추가.
6. **commit + push**.

---

## Forbidden actions (HARD STOP — blocker 기록 후 다음으로)

1. 기존 goal invariant 무단 약화 (`goals/_meta.gates.sh` 등 gate 약화).
2. Hook 우회 (`--no-verify`, `--no-gpg-sign` 등).
3. 테스트/lint 비활성화 (`.skip`, `.only`, `eslint-disable` 추가).
4. Coverage threshold 인하 (현재 설정 없으나, 추가 후 즉시 인하 금지).
5. 3 TDD 사이클 무진전 → finding에 `status_notes: blocked — <reason>` → 다음 target.
6. Destructive git (`push --force`, `reset --hard`).
7. `.env`/credential/대용량 산출물 커밋.
8. 원격 Supabase DB에 직접 write/delete (G2 가드 완료 전은 DB 의존 테스트 로컬 실행
   자제).

---

## Commit / push 프로토콜

- TDD 각 phase 한 커밋 (RED / GREEN / REFACTOR 별도).
- finding 전체 완료 후 `docs/findings/<file>.md` frontmatter 갱신 커밋 + push.
- 커밋 메시지 첫 줄: `<type>(<scope>): <summary>` (Conventional Commits).
- 브랜치 유지 — 별도 PR 분리는 사람이 결정.

---

## 검증 — 진짜 끝났는지

```bash
bash scripts/completion-check.sh; echo "exit: $?"   # 0
git status --short                                   # 비어야 함
git log @{u}..HEAD --oneline                         # 비어야 함
grep -l "resolved: false" docs/findings/2026-06-10*.md   # 없어야 함 (또는 partial + blocker 기록)
```

TERMINATE.
