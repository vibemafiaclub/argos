# Implement — WU-8

## 변경 요약

skills route GET handler contract 테스트를 신규 작성했다. WU-4 공유 fixture를 사용해 실제 Postgres DB에 bar/baz/qux/whitespace-ok 4개 스킬 데이터를 시드하고, auth 관련 모듈(requireAuth, assertOrgAccessBySlugOrResponse, resolveOrgScopedProjectIds)을 vi.mock으로 bypass한 뒤 route handler를 직접 호출해 callCount 정확성 및 callCount DESC, skillName ASC 정렬 순서를 검증한다.

vitest.config.ts에 두 가지 인프라 수정을 추가했다: (1) `resolve.alias`에 `@/` → `src/` 경로 매핑 추가 (route.ts의 `@/lib/server/*` import 해석에 필수), (2) `.env.local` 자동 파싱 및 `test.env` 주입으로 DATABASE_URL 자동 로드.

## 변경 파일

- `packages/web/src/app/api/orgs/[orgSlug]/dashboard/skills/route.test.ts` (신규, 5개 테스트, ~190 lines)
- `packages/web/vitest.config.ts` (수정, `@/` alias + `.env.local` 자동 로드 추가)

## 검증 결과

- `pnpm --filter web vitest run dashboard/skills/route` → 5 tests pass
  - fixture 기대치(bar=1, baz=1, qux=1, whitespace-ok=1) 모두 반환
  - 동일 callCount=1 항목이 skillName ASC 순(bar < baz < qux < whitespace-ok) 정렬 확인
  - 각 skill 항목 필드(callCount/sessionCount/userCount/lastUsedAt) 형식 확인
  - projectIds 빈 배열 → 빈 skills 응답 확인
  - requireAuth가 NextResponse 반환 시 401 전달 확인
- 기존 테스트(rbac, events, dashboard-row-mapping, slash-command, timeline, weekly-report, skill-aggregation) 모두 pass

## 잠재 이슈 / 후속 메모

- `daily-rollup.test.ts` (WU-6)의 `getDailyRollups — skill 회귀 가드 (DB 연동)` 테스트가 FK constraint 오류(`events_sessionId_fkey`)로 실패한다. WU-6 test가 fixture 시드 전 supporting records(org/user/project/session)를 먼저 생성하는 `setupSupportingRecords`를 호출하지 않아 발생하는 WU-6 자체 버그. WU-8 변경과 무관.
- `vitest.config.ts` 수정은 WU-8 테스트를 위한 필수 인프라 변경이며 다른 WU의 DB 연동 테스트(WU-5/6/7)도 `.env.local` 자동 로드 혜택을 받는다.
