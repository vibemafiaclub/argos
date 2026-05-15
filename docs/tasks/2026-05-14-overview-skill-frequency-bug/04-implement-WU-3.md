# Implement — WU-3

## 변경 요약

`packages/web/src/lib/server/daily-rollup.ts` 를 다음 4가지 변경으로 수정했다.

1. **skillCounts 계산 교체**: `computeDailyRollup` 의 `db.event.groupBy({ isSkillCall: true })` 호출을 제거하고, `aggregateSkillCountsForRange([projectId], from, toExclusive)` (WU-1 helper) 호출로 교체. `utcDayStartNextDay` internal helper 를 추가해 half-open `[from, toExclusive)` 경계를 생성.
2. **SKILL_COUNTS_INVALIDATION_AT 상수 export**: `new Date('2026-05-16T00:00:00Z')` 로 설정. `getDailyRollups` 의 DB cache hit 판정에서 `row.computedAt < SKILL_COUNTS_INVALIDATION_AT` 인 row 는 stale 로 처리해 `missingDays` 로 낙하 → 자연 inline 재계산. 단일 `computedAt` 비교만 사용 (합성 조건 없음).
3. **aggregateSummary TS overload 추가**: `AggregateSummaryOptions` 인터페이스와 `normalizeAggregateSummaryOptions` internal helper 를 export. 명시적 3-overload (no-arg / `topN: number` legacy / `opts: AggregateSummaryOptions`) 선언. `weekly-report.ts` 의 기존 `aggregateSummary(rollups, 10)` 는 legacy overload 로 매핑 → `{ topSkillsN: 10, topAgentsN: 10 }` (현행 동작 보존, 변경 0줄).
4. **Tie-break 정렬**: `topSkills.sort` 에 `|| a.skillName.localeCompare(b.skillName)`, `topAgents.sort` 에 `|| a.agentType.localeCompare(b.agentType)` 추가. `userStats.skillCalls` (`e_agg` 블록) 는 변경 없음.

## 변경 파일

- `packages/web/src/lib/server/daily-rollup.ts` (수정, +65 / -18 lines)

## 검증 결과

- `npx tsc --noEmit` → `daily-rollup.ts` / `skill-aggregation.ts` / `weekly-report.ts` 에 대한 신규 타입 오류 없음. 기존 pre-existing `@argos/shared` 모듈 미설치 오류는 워크트리 환경 이슈 (WU-1 보고와 동일).

## 수용 기준 체크리스트

- [x] L150-159 `db.event.groupBy({ ... isSkillCall: true ... })` 호출이 코드에서 사라졌다.
- [x] L194-243 `userStatsRaw` 의 `e_agg` 부분이 그대로다 (변경 0줄). user_stats 컬럼은 skill_call_rows 정의를 사용하지 않는다. 그건 별도 task.
- [x] `aggregateSummary` 세 overload 가 모두 정의됐고 기존 호출자 (`weekly-report.ts` 의 positional `10`) 가 컴파일 통과.
- [x] `SKILL_COUNTS_INVALIDATION_AT` 상수가 정의됐고 `getDailyRollups` 에서 사용된다.

## 잠재 이슈 / 후속 메모

- `SKILL_COUNTS_INVALIDATION_AT = new Date('2026-05-16T00:00:00Z')` 은 PR merge 시각 + 24h 여유 기준으로 설정했다. 다음 정의 변경 시 이 상수를 갱신 + 재배포.
- WU-9 (oneshot invalidate 스크립트) 가 이 파일의 `SKILL_COUNTS_INVALIDATION_AT` 를 import 해 사용한다 (single source of truth).
- `normalizeAggregateSummaryOptions` 는 `@internal` JSDoc 이지만 테스트 (WU-6) 가 직접 import 할 수 있도록 `export` 로 선언했다.
