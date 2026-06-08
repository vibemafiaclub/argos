---
cycle: 260608-01
title: "Tech debt resolution: auth boilerplate, type safety, test coverage"
authored_at: 2026-06-08T18:45:00+09:00
started_at: 2026-06-08T19:28:00+09:00
completed_at:
status: running
---

# 260608-01 — Tech debt resolution cycle

**목표**: `docs/findings/` 에서 식별된 3개 P1/P2 기술부채를 우선순위 순서대로 해결한다.
1. API 라우트 auth 보일러플레이트 (P1)
2. Double cast 타입 안전성 (P2)
3. 테스트 커버리지 부족 (P2)

각 finding의 "Acceptance signal"을 만족할 때까지 작업한다. 매 작업 단위 완료 시 commit + push.

이 문서를 에이전트에게 **무한 루프 모드**로 넘긴다:
`cycles/260608-01-tech-debt-resolution.md 의 내용을 모두 완수할 때까지 작업해줘.`

**시작 상태**: chain GREEN (`.state/active-goal == ALL_DONE`), 작업 브랜치 `tech-debt-resolution`.

---

## 루프 알고리즘

```
step 0 — 최초 1회: 이 문서 frontmatter 갱신 (started_at, status: running) → commit.

LOOP:
  step 1 — chain 상태:  bash scripts/completion-check.sh
    exit 0 (ALL_DONE)  → step 2
    else               → .state/active-goal 의 goal 을 TDD 로 GREEN
                         → commit + push → step 1
  step 2 — finding 진행: target 리스트 첫 unresolved 선택
    없음               → TERMINATE
    있음               → "Finding 처리 절차" → frontmatter 갱신 → commit + push → step 1
```

종료 조건 (셋 다):
1. 모든 in-scope target 이 `resolved: true` 또는 `partial`
2. `completion-check.sh` exit 0
3. `git status` clean + push 완료

종료 시 frontmatter `completed_at`/`status` 갱신 + commit.

**막혀도 종료하지 마라.** stuck → blocker 기록 → 다음 target.

---

## Target findings (실행 순서)

### Tier 1 — P1 (높은 우선순위)

#### 1. `docs/findings/2026-06-08T1840-api-route-auth-boilerplate.md` (P1)

**문제**: API 라우트에서 auth/access 체크 패턴이 58번 반복됨

**작업 범위**:
1. `lib/server/route-wrappers.ts` 생성 → `withOrgAuth()`, `withAuth()` HOF 구현
2. 고트래픽 라우트 3개 포팅:
   - `src/app/api/orgs/[orgSlug]/projects/route.ts`
   - `src/app/api/orgs/[orgSlug]/members/route.ts`
   - `src/app/api/orgs/[orgSlug]/invitations/route.ts`
3. 테스트 추가: `packages/web/__tests__/api-auth-guard.test.ts`
   - 미인증 요청 → 401 검증
   - 인증됨 but 무권한 → 403 검증
   - 정상 → 핸들러 호출 검증

**Acceptance signal**:
- `withOrgAuth()` 래퍼로 포팅된 라우트에서 타입 검사 통과
- 테스트 3개 모두 GREEN
- 나머지 라우트 포팅은 이후 cycle에서 점진적 수행 가능 (현재는 3개만)

**Status**: TODO

---

### Tier 2 — P2 (보조 우선순위)

#### 2. `docs/findings/2026-06-08T1842-double-cast-type-safety.md` (P2)

**문제**: Prisma JSON 칼럼에서 `as unknown as` 이중 캐스팅으로 타입 안전성 우회

**작업 범위**:
1. `lib/server/parsers.ts` 생성 → Zod 스키마 + 파서 함수
   - `DailyUserStatSchema` + `parseDailyUserStats()`
   - 이벤트 메타데이터 스키마 + 파서
2. `daily-rollup.ts` 포팅 (2개 cast 위치 → Zod 파서로 교체)
3. `events/route.ts` 포팅 (3개 cast 위치 → Zod 파서로 교체)
4. 테스트 추가: `packages/web/__tests__/lib/daily-rollup.test.ts`
   - 유효한 데이터 → 정상 파싱
   - 손상된 데이터 (누락 필드) → 안전한 fallback
   - null/undefined → 기본값 반환

**Acceptance signal**:
- 파서 함수로 교체된 `daily-rollup.ts`, `events/route.ts` 코드에서 `as unknown as` 제거됨
- 테스트 3개 이상 GREEN
- Zod 스키마 타입 추론으로 타입 안전성 복구

**Status**: TODO

---

#### 3. `docs/findings/2026-06-08T1843-test-coverage-gaps.md` (P2)

**문제**: 227 소스 파일에 13 테스트만 존재 (~6% 비율)

**작업 범위** (Phase 1: 기초 + 핵심 3개 라우트):
1. Vitest 커버리지 설정 확인/추가:
   - `vitest.config.ts`에 coverage threshold 추가 (lines: 80)
   - CI/CD에 coverage 리포트 통합
2. Mock 팩토리 정리:
   - `__tests__/fixtures/` 에 공통 test data builders
3. 통합 테스트 작성 (3개 라우트):
   - `__tests__/api/events.test.ts` (POST, payload validation, DB write)
   - `__tests__/api/orgs-members.test.ts` (GET/POST, access control)
   - `__tests__/api/orgs-projects.test.ts` (GET/POST, org-level access)
4. 단위 테스트 (utility):
   - `__tests__/lib/daily-rollup.test.ts` (이미 2번 작업에서 부분 커버됨)
   - `__tests__/auth.test.ts` (session validation)

**Acceptance signal**:
- 3개 라우트 통합 테스트 GREEN (각 20+ assertions)
- `pnpm test --coverage` 출력에서:
  - `src/app/api/events/route.ts` 라인 커버리지 ≥80%
  - `src/app/api/orgs/[orgSlug]/members/route.ts` ≥80%
  - `src/app/api/orgs/[orgSlug]/projects/route.ts` ≥80%
  - `src/lib/server/daily-rollup.ts` ≥80%

**Status**: TODO

**Note**: Phase 2 (나머지 라우트 커버리지)는 다음 cycle에서 수행.

---

## Reference snapshots — 작업 대상 아님

없음.

## Out of scope

- 모든 34개 라우트 동시 포팅 (대신 점진적: 1번 cycle에서 3개, 다음에 10개, ...)
- 새로운 프레임워크 도입 (Pact, Cypress 등) — Vitest + Playwright로 충분
- 성능 최적화 (별도 cycle)
- 문서화만 추가 (구현 없이)

---

## Finding 처리 절차

각 finding:
1. 읽기 (이미 작성됨)
2. Acceptance signal 재확인
3. RED: 테스트 쓰기 (실패함을 확인)
4. GREEN: 구현
5. 검증: Acceptance signal 만족 확인
6. Finding 문서 업데이트: frontmatter `resolved: true`, 본문 끝 `## Resolution` 섹션 추가
7. commit + push

---

## Forbidden actions (HARD STOP)

1. ✋ Prior goal invariant 무단 약화
2. ✋ Hook 우회 (`--no-verify` 등)
3. ✋ 테스트/lint 비활성화 (`.skip`, `eslint-disable` 추가)
4. ✋ Coverage threshold 인하
5. ✋ 3 사이클 무진전 → blocker 기록 → 다음 target
6. ✋ Destructive git (`push --force`, `reset --hard`)
7. ✋ `.env` / credential / 대용량 산출물 커밋

---

## Commit / push 프로토콜

- TDD 각 phase (RED/GREEN) 한 커밋
- Finding 완료 후 마무리 커밋 (frontmatter + Resolution 섹션)
- 3개 finding 모두 완료 후 cycle 종료 커밋
- 매 커밋 후 즉시 push (브랜치 유지, PR은 cycle 끝에)

---

## 검증 — 진짜 끝났는지

```bash
# 모든 테스트 GREEN
pnpm test --coverage

# 모든 findings resolved
grep -r 'resolved: false' docs/findings/2026-06-08T18*.md  # 출력 없어야 함

# 코드 상태
git status --short                                          # 비어야 함
git log @{u}..HEAD --oneline                                # 비어야 함
```

TERMINATE.

---

## Notes

- 1번 finding (auth boilerplate)를 먼저 해결하면 2, 3번 작업에 영향 없음 (병렬 가능)
- 다만 1번 HOF 타입을 잘 정의하면 다른 라우트 리팩터링이 더 쉬워짐
- 각 finding 문서의 "Options" 섹션을 다시 읽고 선택한 옵션이 맞는지 재확인
