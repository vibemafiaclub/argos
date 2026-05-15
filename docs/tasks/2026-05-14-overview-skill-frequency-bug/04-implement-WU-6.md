# Implement — WU-6

## 변경 요약

`packages/web/src/lib/server/daily-rollup.test.ts` 를 신규 생성했다.
세 개 describe 블록으로 구성: (1) `normalizeAggregateSummaryOptions` 4-case 단위 테스트 (undefined/number/options/both), (2) `aggregateSummary` deterministic tie-break 6개 테스트 (callCount DESC, skillName/agentType ASC), (3) DB 연동 skill 회귀 가드 (DATABASE_URL 없으면 skip).
순수 단위 테스트 10개 모두 pass, DB 연동 테스트 1개 skip (worktree 환경에 DATABASE_URL 미설정).
타입체크 시 내 파일 기인 에러 0건 (기존 39개 에러는 `@argos/shared` 모듈 미빌드 등 pre-existing).

## 변경 파일

- `packages/web/src/lib/server/daily-rollup.test.ts` (신규, 177 lines)

## 검증 결과

- `pnpm --filter web exec vitest run src/lib/server/daily-rollup.test.ts` → 10 passed | 1 skipped
  - skipped: DB 연동 skill 회귀 가드 (`DATABASE_URL` 미설정 환경)
- 타입체크: `daily-rollup.test.ts` 기인 에러 0건 (동적 import path `.js` 확장자 명시로 TS2835 해소)

## 잠재 이슈 / 후속 메모

- DB 연동 테스트 (`getDailyRollups — skill 회귀 가드`) 는 `DATABASE_URL` 이 설정된 환경에서만 실행된다. CI 에서 실제 Postgres 가 있을 경우 자동으로 활성화된다.
- DB 테스트는 `getDailyRollups` (exported)를 통해 `computeDailyRollup` 을 간접 호출한다. `computeDailyRollup` 이 internal function 으로 export 되지 않으므로 public API 경유가 유일한 방법.
- DB 테스트의 projectId/sessionId/userId 는 fixture seed 전 DB 에 존재해야 한다. 실 dev DB 에서 사전 생성 없이 실행 시 foreign key 오류가 발생할 수 있다 — 이 경우 fixture opts 에 실존 id 를 전달하거나 fixture 자체에 org/project/session/user 생성 로직을 추가해야 한다 (WU-4 scope).
