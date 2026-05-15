# Plan — 2026-05-14-overview-skill-frequency-bug

## 개요

같은 `(orgSlug, from, to, projectId)` 에서 overview 의 "Skill별 호출 빈도" 카드가 skills 페이지 Top skills 와 **skillName / 정렬 순서 (tie-break 포함) / callCount 까지 동일**하도록, `daily_rollups.skillCounts` 의 정의를 skills route 의 UNION (`events.is_skill_call=true` ∪ messages 의 slash command, events anti-join) 으로 맞춘다. UNION 의 단일 출처는 신규 helper 가 export 하는 **Prisma.Sql relation expression** (`SELECT ... UNION ALL SELECT ...`). 과거 캐시 invalidation 은 **자연 lazy 가드** (`computedAt < SKILL_COUNTS_INVALIDATION_AT` 단독) 가 primary, oneshot 스크립트는 보조 (speed-up only). tie-break 는 `callCount DESC, skillName ASC` deterministic.

## 아키텍처/접근 선택

세 가지 선택지 검토 (V1a / V1b / 합성). **채택: V1a + helper 추출** (정의 단일 출처).

- A. V1a — rollup `skillGroups` 만 UNION 으로 + UI N 만 10 으로. 정의가 두 곳 분산 — 거절.
- B. **V1a + relation expression helper 추출 (채택)**. 모든 호출자가 같은 SELECT-UNION-SELECT relation expression 을 자기 CTE 안에 임베드하고, 그 위에서 GROUP BY 등 자기 집계를 한다. skills route 도 동일 relation 위에서 `skill_durations` join 만 추가.
- C. V1b 합성 — rollup 가치 깎고 users/weekly-report 와 정의 어긋남. 거절.

**helper 인터페이스 (Critique R2 #3 반영 — relation expression 으로 명확화)**: 두 layer 로 분리.
- **Layer 1 — `skillCallRowsRelation(projectIds: string[], fromInclusive: Date, toExclusive: Date): Prisma.Sql`**: `SELECT skill_name, session_id, user_id, timestamp, source FROM events WHERE ... UNION ALL SELECT ... FROM messages WHERE ... AND NOT EXISTS (...)` 형태의 **relation expression** 을 반환. CTE definition 이 아니라 SELECT 결과 그 자체. caller 는 `WITH skill_call_rows AS (${skillCallRowsRelation(...)})` 로 감싸 사용.
  - 컬럼: `skill_name TEXT, session_id TEXT, user_id TEXT, timestamp TIMESTAMPTZ, source TEXT` (source = `'event' | 'message_slash'`).
  - `Prisma.sql` 로만 빌드 (string 연결 금지).
  - 시간 경계: `timestamp >= ${fromInclusive} AND timestamp < ${toExclusive}` (half-open).
- **Layer 2 — `aggregateSkillCountsForRange(projectIds, fromInclusive, toExclusive): Promise<Array<{ skillName, callCount }>>`**: rollup builder 가 쓸 thin wrapper. 내부적으로 Layer 1 임베드 → `WITH skill_call_rows AS (...) SELECT skill_name, COUNT(*) AS call_count FROM skill_call_rows GROUP BY skill_name` → `{ skillName, callCount: Number(...) }`. 빈 projectIds → 빈 배열 early return. 반환 순서 보장 없음.

**Top-N 결정 (Critique R2 #5 반영 — 명시적 TS overload)**: `aggregateSummary` 시그니처를 TS overload 로 정확히 고정.
```ts
export interface AggregateSummaryOptions {
  topSkillsN?: number  // default 5
  topAgentsN?: number  // default 5
}
export function aggregateSummary(rollups: DailyRollup[]): AggregatedSummary
export function aggregateSummary(rollups: DailyRollup[], topN: number): AggregatedSummary  // legacy
export function aggregateSummary(rollups: DailyRollup[], opts: AggregateSummaryOptions): AggregatedSummary
export function aggregateSummary(rollups: DailyRollup[], optsOrTopN?: number | AggregateSummaryOptions): AggregatedSummary {
  const { topSkillsN, topAgentsN } = normalizeAggregateSummaryOptions(optsOrTopN)
  // ...
}
function normalizeAggregateSummaryOptions(input?: number | AggregateSummaryOptions): { topSkillsN: number; topAgentsN: number } {
  if (typeof input === 'number') return { topSkillsN: input, topAgentsN: input }
  return { topSkillsN: input?.topSkillsN ?? 5, topAgentsN: input?.topAgentsN ?? 5 }
}
```
- Weekly-report 의 `aggregateSummary(rollups, 10)` 호출은 legacy overload 로 매핑 → `topSkillsN=10, topAgentsN=10` (현행과 동일 동작 보존).
- Overview route 만 `aggregateSummary(rollups, { topSkillsN: 10 })` 사용 → `topAgentsN` 기본 5 유지.
- WU-3 의 단위 테스트가 `normalizeAggregateSummaryOptions` 의 세 케이스 (undefined, number, object) 를 검증.

**Tie-break 정렬 (Critique R1 #5 반영)**:
- skills route SQL: `ORDER BY e.call_count DESC, e.skill_name ASC LIMIT 50`.
- `aggregateSummary.topSkills`: `.sort((a, b) => b.callCount - a.callCount || a.skillName.localeCompare(b.skillName))`.
- `topAgents` 도 동일 패턴 (`localeCompare` 로 deterministic). 회귀 위험 미미 (이전 비결정 → 결정적).

**과거 캐시 invalidation 결정 (Critique R2 critical + #2 반영 — 단일 가드 + 보조 스크립트 + runbook)**:
- **Primary 가드 (correctness)**: `getDailyRollups` 의 cache hit 판정에서 `row.computedAt < SKILL_COUNTS_INVALIDATION_AT` 인 row 는 `cachedResults` 에 넣지 않고 `missingDays` 로 명시 이동. `SKILL_COUNTS_INVALIDATION_AT` 은 코드 상수, **implement 단계에서 PR merge 시각 + 충분한 여유 (예: PR merge + 24h)** 로 박는다. 이 단일 조건만으로 옛 정의 row 전부가 stale 로 잡힌다. `skillCounts === '{}'` 같은 부가 조건 없음.
- **Race condition 해결 (Critique R2 critical 반영)**: 
  1. **배포 순서 강제 (runbook)**:
     - Step 1. 새 코드 (`SKILL_COUNTS_INVALIDATION_AT` 가드 포함) 를 모든 인스턴스에 배포 완료.
     - Step 2. 배포 안정화 30 분 (cold start, region rollout 완료) 후 oneshot 스크립트 1차 실행 (`pnpm --filter web tsx scripts/invalidate-skill-counts.ts`).
     - Step 3. 추가 10 분 대기 후 oneshot 스크립트 2차 sweep — 1 차 도중에 새로 upsert 된 row 가 있다면 그것까지 invalidate (1차 sweep 이후 다시 upsert 된 row 는 새 코드 정의로 작성된 것이므로 invalidate 불필요하지만, 멱등이라 무해).
  2. 새 코드는 항상 새 정의로 upsert 한다 (`computedAt = new Date()`). 그 row 의 `computedAt` 은 `SKILL_COUNTS_INVALIDATION_AT` 보다 미래이므로 stale 가드를 통과.
  3. **vercel serverless 단일 region 가정 (현 stack)**: cold start 가 즉시 새 코드로 fail-over 하므로 동시 인스턴스에서 old writer 가 도는 윈도우는 ~ 초 단위. 그 윈도우의 upsert 결과는 다음 요청 / 다음 sweep 에서 invalidate. 실용적으로 안전.
- **보조 스크립트 (speed-up)**: WU-9 의 oneshot 스크립트는 **correctness 가 아닌 speed-up** 역할. 미실행 시에도 lazy 가드가 보장 (단, 다음 한 번의 요청에 inline 비용이 분산되어 첫 요청 latency 가 길어질 뿐).
- **스크립트 멱등 결정 (Critique R2 minor #7 반영)**: 스크립트는 `WHERE computed_at < SKILL_COUNTS_INVALIDATION_AT` 만 대상으로 한다. 첫 실행 → N rows reset. 두번째 실행 → 0 rows (이미 invalidate 된 row 는 `computedAt` 이 더 옛날로 강제됐고, 그 사이 자연 재계산 / upsert 된 row 는 `computedAt > THRESHOLD` 이므로 대상에서 빠짐). **검증 기준**: 첫 실행 > 0, 두번째 실행 = 0.

**비용 모델**: row 당 8개 inline 쿼리 × `projects × days`. 로컬 dev 에서 projects ≤ 10, days ≤ 90 = 900 rows × 80ms ≈ 72s worst case. 사용자에게는 첫 진입 시점에 lazy 분산. prod scale 시 escalation 권고.

**parseDateRange 와 half-open 일관성 (Critique R2 minor #6 반영)**: 기존 `parseDateRange` 는 `to` 를 `23:59:59.999` 로 보정해 inclusive 의도. helper 는 half-open `[from, to)` 요구. **변환 책임을 caller (route) 에 둔다**:
- skills route / overview route 에서 helper / rollup builder 호출 직전에 `toExclusive = new Date(to.getTime() + 1)` 변환 (즉 마지막 ms 의 다음 instant). 이로써 `< toExclusive` 가 `<= to` 와 동치성을 유지하며 helper 의 half-open 계약을 만족.
- 또는 더 깔끔하게: `parseDateRange` 가 추가로 `toExclusive: Date` 를 반환하도록 확장 (옵션). plan 에서는 후자 (확장) 를 권고하되, 변경 폭이 큰 경우 caller 단 변환으로 fallback 허용.

## Work Units

### WU-1: skill-aggregation helper 신규 (relation expression + 카운트 wrapper)

- **수정/생성 파일** (절대 경로):
  - `/Users/choesumin/Desktop/dev/vmc/argos/.claude/worktrees/stateful-hatching-lighthouse/packages/web/src/lib/server/skill-aggregation.ts` (생성)
- **입력 계약 (Critique R2 #3 반영 — relation expression)**:
  - **Export 1**: `skillCallRowsRelation(projectIds: string[], fromInclusive: Date, toExclusive: Date): Prisma.Sql`. 반환 fragment 는 **relation expression** (`SELECT ... UNION ALL SELECT ...`). CTE definition 이 아니라 SELECT 결과 자체. caller 가 `WITH skill_call_rows AS (${skillCallRowsRelation(...)}) SELECT ...` 로 임베드.
    - 행 컬럼: `skill_name TEXT, session_id TEXT, user_id TEXT, timestamp TIMESTAMPTZ, source TEXT`.
    - 시간 경계: `timestamp >= ${fromInclusive} AND timestamp < ${toExclusive}` (half-open).
    - 정의: events 분기 = `is_skill_call=true AND skill_name IS NOT NULL`. messages 분기 = `m.role='HUMAN'` + 정규식 `<command-message>[^<]*</command-message>[[:space:]]*<command-name>/?([^<[:space:]]+)</command-name>` + events anti-join (`is_skill_call=true AND is_slash_command=true AND skill_name=match`).
    - `Prisma.sql` 로만 빌드 (string 연결 / interpolation 금지).
  - **Export 2**: `aggregateSkillCountsForRange(projectIds: string[], fromInclusive: Date, toExclusive: Date): Promise<Array<{ skillName: string; callCount: number }>>`. 내부 SQL: `WITH skill_call_rows AS (${skillCallRowsRelation(...)}) SELECT skill_name, COUNT(*)::bigint AS call_count FROM skill_call_rows GROUP BY skill_name`. `Number(bigint)` 변환 후 반환. 빈 projectIds → 빈 배열 early return (DB 호출 없음). **반환 순서 보장 없음**.
- **출력 계약**: 위 두 함수 export. JSDoc 에 "skills route 와 daily-rollup 의 단일 출처" 명시.
- **WU-1 완료 조건 (fan-out 잠금 해제 게이트)**:
  1. `skillCallRowsRelation` 시그니처 (parameter 이름, 타입, half-open 계약), 컬럼 schema 확정.
  2. `aggregateSkillCountsForRange` 시그니처, bigint→number 변환 위치, 빈 입력 처리 확정.
  3. WU-1 commit 후에야 WU-2 / WU-3 fan-out 가능.
- **의존**: 없음.
- **검증 방법**: WU-4 가 직접 호출.
- **예상 LOC**: ~100.

### WU-2: skills route 를 helper relation 재사용으로 리팩터 + tie-break + half-open 적용

- **수정/생성 파일**:
  - `/Users/choesumin/Desktop/dev/vmc/argos/.claude/worktrees/stateful-hatching-lighthouse/packages/web/src/app/api/orgs/[orgSlug]/dashboard/skills/route.ts` (수정)
- **입력 계약**: 기존 라우트 시그니처 / 응답 shape 변경 없음.
  - **`to` → `toExclusive` 변환 (Critique R2 minor #6 반영)**: route 안에서 `parseDateRange` 결과의 `to` 를 `toExclusive = new Date(to.getTime() + 1)` 으로 변환해 helper 와 CTE 에 일관 전달. (또는 parseDateRange 가 toExclusive 를 함께 반환하도록 확장 — implement 선택.)
- **출력 계약**:
  - 기존 `event_skill_calls` / `message_slash_calls` CTE 두 개를 단일 `skill_call_rows AS (${skillCallRowsRelation(projectIds, from, toExclusive)})` 로 교체. `event_skill_calls` / `message_slash_calls` 명칭은 helper 내부로 캡슐화되어 외부에서 보이지 않음 — skill_events 집계는 `skill_call_rows` 를 source 로.
  - `skill_durations` CTE 는 그대로 유지 (skills route 전용 컬럼 — Negative Space). `< toExclusive` 로 경계만 통일.
  - **Tie-break**: `ORDER BY e.call_count DESC, e.skill_name ASC LIMIT 50`.
- **의존**: WU-1 (Layer 1 export 시그니처 확정).
- **검증 방법**: WU-7 의 route-level contract 테스트.
- **예상 LOC**: ~40 변경.

### WU-3: daily-rollup builder skillCounts 를 helper 호출로 교체 + aggregateSummary overload + tie-break + invalidation 가드

- **수정/생성 파일**:
  - `/Users/choesumin/Desktop/dev/vmc/argos/.claude/worktrees/stateful-hatching-lighthouse/packages/web/src/lib/server/daily-rollup.ts` (수정)
- **입력 계약**:
  - **skillCounts 계산 교체**: `computeDailyRollup` L150-159 `db.event.groupBy` 호출 제거. 새 코드: `aggregateSkillCountsForRange([projectId], utcDayStart(date), utcDayStartNextDay(date))`. `utcDayStartNextDay` 는 `utcDayStart(date) + 1 day` 의 새 internal helper (utcDayEnd 가 `23:59:59.999` 였던 inclusive 의도를 half-open `< nextDayStart` 로 정렬).
  - **skillCounts 직렬화**: helper 결과 `Array<{ skillName, callCount }>` 를 `Record<string, number>` 로 변환 (L255-258 패턴 보존).
  - **userStats.skillCalls 정의는 그대로 유지 (Negative Space)**: `userStatsRaw` 의 `e_agg.skill_calls` (L219, L235) 는 **건드리지 않는다**. context 21 / clarify 비범위. WU-3 acceptance 체크리스트에 한 줄 명시: "user_stats 컬럼은 skill_call_rows 정의를 사용하지 않는다. 그건 별도 task."
  - **`aggregateSummary` TS overload 도입 (Critique R2 #5)**:
    - 새 인터페이스 `AggregateSummaryOptions { topSkillsN?: number; topAgentsN?: number }` export.
    - 세 overload signature 선언 (위 "아키텍처/접근 선택" 코드 블록 참조).
    - 내부 helper `normalizeAggregateSummaryOptions(input?: number | AggregateSummaryOptions): { topSkillsN: number; topAgentsN: number }`:
      - undefined → `{ 5, 5 }`.
      - number → `{ N, N }` (legacy positional 동작).
      - object → `{ opts.topSkillsN ?? 5, opts.topAgentsN ?? 5 }`.
    - 내부 정렬 코드는 `topSkillsN` 과 `topAgentsN` 을 각각 사용.
  - **Tie-break**: 
    - `topSkills.sort((a, b) => b.callCount - a.callCount || a.skillName.localeCompare(b.skillName))`.
    - `topAgents.sort((a, b) => b.callCount - a.callCount || a.agentType.localeCompare(b.agentType))`.
  - **Cache invalidation 가드 (Critique R2 critical + #2 단일화)**:
    - `SKILL_COUNTS_INVALIDATION_AT = new Date('YYYY-MM-DDThh:mm:ssZ')` 상수 (implement 단계에서 PR merge + 24h 시각으로 박는다).
    - `getDailyRollups` L488 `const existing = await db.dailyProjectStat.findMany(...)` 직후 stale 분리 로직: row 를 두 그룹으로 split — `fresh` (`computedAt >= SKILL_COUNTS_INVALIDATION_AT`) 는 `cachedResults` 로, `stale` (`computedAt < SKILL_COUNTS_INVALIDATION_AT`) 은 절대 `cachedResults` 에 넣지 않음. `missingDays` 산출 시 stale row 의 date 도 missing 으로 처리 (즉 자연 inline 재계산 + upsert 발생).
    - 가드 조건은 **`computedAt` 단일 비교만** — `skillCounts === '{}'` 같은 합성 조건 없음 (Critique R2 #2).
- **출력 계약**: `DailyRollup.skillCounts` UNION 정의 적용. `aggregateSummary` deterministic 정렬 + per-card N. stale row 가 자동 재계산.
- **WU-3 acceptance 체크리스트**:
  - [ ] L150-159 `db.event.groupBy({ ... isSkillCall: true ... })` 호출이 코드에서 사라졌다.
  - [ ] L194-243 `userStatsRaw` 의 `e_agg` 부분이 그대로다 (변경 0줄).
  - [ ] `aggregateSummary` 세 overload 가 모두 정의됐고 기존 호출자 (`weekly-report.ts` 의 positional `10`) 가 컴파일 통과.
  - [ ] `SKILL_COUNTS_INVALIDATION_AT` 상수가 정의됐고 `getDailyRollups` 에서 사용된다.
- **의존**: WU-1.
- **검증 방법**: WU-4 (helper), WU-5 (rollup builder), WU-6 (weekly-report 회귀).
- **예상 LOC**: ~70.

### WU-4: 공유 fixture helper 신규 (테스트 owner 단일화) [Critique R2 #4 반영]

- **수정/생성 파일**:
  - `/Users/choesumin/Desktop/dev/vmc/argos/.claude/worktrees/stateful-hatching-lighthouse/packages/web/src/lib/server/__fixtures__/skill-call-fixture.ts` (생성)
- **입력 계약**: WU-5 ~ WU-8 의 4 개 테스트가 공유할 fixture builder.
  - Export 1: `seedSkillCallFixture(opts: { projectId: string; sessionId: string; userId: string; day: Date }): Promise<void>` — Case B 와 동일 데이터를 DB 에 삽입. **events 2건 + messages 4건 (HUMAN 3 + ASSISTANT 1)**.
  - Export 2: `cleanupSkillCallFixture(opts: { projectId: string }): Promise<void>` — 해당 fixture 가 만든 row 전부 삭제 (테스트 간 격리).
  - Export 3: `EXPECTED_SKILL_COUNTS = { bar: 1, baz: 1, qux: 1, 'whitespace-ok': 1 }` 상수 (4 테스트가 같은 기대치 사용).
- **출력 계약**: 위 3 export. JSDoc 에 "skill-call 정의 회귀 가드용 공유 fixture. owner: WU-4. 변경은 4 테스트 모두 영향" 명시.
- **테스트 인프라 결정 (Critique R1 #4 + R2 #4)**: **기존 dev DB 재사용**. `packages/web` 의 vitest 가 이미 prisma client 를 import 하므로 실DB 접근 가능 (`db` from `./db`). 만약 vitest 가 mock DB 만 쓰는 환경이라면 implement 가 escalation. fallback: WU-5 를 SQL string snapshot 검증으로 격하 (정확성은 떨어지나 unblock).
- **의존**: WU-1 (helper 가 의도하는 data shape 확정 필요).
- **검증 방법**: 이 WU 자체는 import 가능성만 (`pnpm --filter web typecheck` 통과).
- **예상 LOC**: ~120.

### WU-5: skill-aggregation helper 단위 테스트

- **수정/생성 파일**:
  - `/Users/choesumin/Desktop/dev/vmc/argos/.claude/worktrees/stateful-hatching-lighthouse/packages/web/src/lib/server/skill-aggregation.test.ts` (생성)
- **입력 계약**: WU-4 의 `seedSkillCallFixture` + `EXPECTED_SKILL_COUNTS` import.
  - **Case A — slash command only**: fixture 를 변형해 events 0 건만 둔다 (또는 별도 minimal fixture 인라인). 기대: `[{ skillName: 'foo', callCount: 2 }]`.
  - **Case B — UNION + anti-join + role filter + whitespace**: 표준 fixture 그대로 사용. 기대: `EXPECTED_SKILL_COUNTS` 와 정확히 일치 (Set 비교).
- **출력 계약**: vitest pass.
- **의존**: WU-1, WU-4.
- **검증 방법**: `pnpm --filter web vitest run skill-aggregation`.
- **예상 LOC**: ~80.

### WU-6: daily-rollup builder 통합 회귀 가드

- **수정/생성 파일**:
  - `/Users/choesumin/Desktop/dev/vmc/argos/.claude/worktrees/stateful-hatching-lighthouse/packages/web/src/lib/server/daily-rollup.test.ts` (생성)
- **입력 계약**: WU-4 의 fixture 사용. `computeDailyRollup(projectId, day)` 직접 호출.
  - **Skill 회귀 가드**: `result.skillCounts` 가 `EXPECTED_SKILL_COUNTS` 와 정확히 일치.
  - **`normalizeAggregateSummaryOptions` 단위 테스트** (별도 describe 블록):
    - `undefined` → `{ 5, 5 }`.
    - `10` (number) → `{ 10, 10 }` (weekly-report 호환).
    - `{ topSkillsN: 10 }` → `{ 10, 5 }` (overview 패턴).
    - `{ topSkillsN: 10, topAgentsN: 3 }` → `{ 10, 3 }`.
  - **`aggregateSummary` 정렬 deterministic 검증**: rollup fixture 에 동률 skill 2개 (`zz: 5, aa: 5`) 를 두고 `topSkills` 결과가 `[{ aa, 5 }, { zz, 5 }]` 인지 (alphabet tie-break) 확인.
- **출력 계약**: vitest pass.
- **의존**: WU-1, WU-3, WU-4.
- **검증 방법**: `pnpm --filter web vitest run daily-rollup`.
- **예상 LOC**: ~120.

### WU-7: weekly-report skill-only 회귀 가드

- **수정/생성 파일**:
  - `/Users/choesumin/Desktop/dev/vmc/argos/.claude/worktrees/stateful-hatching-lighthouse/packages/web/src/lib/server/weekly-report.test.ts` (생성)
- **입력 계약 (Critique R1 #6)**: WU-4 fixture 위에서 weekly-report 의 entry function (예: `buildWeeklyReport` 또는 노출된 helper) 호출. 또는 비용 절감을 위해 직접 `aggregateSummary` 만 호출 + 다른 KPI 는 단순 reducer 로 fixture 기대치 검증.
  - **검증 핵심 (Critique R2 #4 — 다른 KPI 회귀 없음을 자동화)**:
    1. `summary.topSkills` 가 UNION 정의를 반영 (`EXPECTED_SKILL_COUNTS` 의 key 들이 포함됨).
    2. **다른 weekly KPI** (`kpis.sessionCount`, `kpis.totalTokens`, `insights.delegation.taskCount`, `topUsers.usageScale.sessionCount` 등) 가 fixture 의 기존 (옛 정의로 빌드된) 결과와 동일. 즉 skill 컬럼만 변동.
- **출력 계약**: vitest pass.
- **의존**: WU-1, WU-3, WU-4.
- **검증 방법**: `pnpm --filter web vitest run weekly-report`.
- **예상 LOC**: ~120.

### WU-8: skills route contract 테스트

- **수정/생성 파일**:
  - `/Users/choesumin/Desktop/dev/vmc/argos/.claude/worktrees/stateful-hatching-lighthouse/packages/web/src/app/api/orgs/[orgSlug]/dashboard/skills/route.test.ts` (생성)
- **입력 계약**: WU-4 fixture 위에서 skills route GET handler 호출 (`NextRequest` mock + auth bypass — `auth-helper` 의 `requireAuth` 를 spy 로 ok). 응답 `{ skills: SkillStat[] }` 의 callCount / 정렬 순서 assert.
  - 기대: `bar=1, baz=1, qux=1, 'whitespace-ok'=1` 가 (callCount DESC, skillName ASC) 로 정렬.
- **출력 계약**: vitest pass.
- **의존**: WU-2, WU-4.
- **검증 방법**: `pnpm --filter web vitest run dashboard/skills/route`.
- **예상 LOC**: ~100.

### WU-9: overview route N=10 적용 (per-card N 옵션 사용)

- **수정/생성 파일**:
  - `/Users/choesumin/Desktop/dev/vmc/argos/.claude/worktrees/stateful-hatching-lighthouse/packages/web/src/app/api/orgs/[orgSlug]/dashboard/overview/route.ts` (수정, L43)
- **입력 계약**: `aggregateSummary(rollups, { topSkillsN: 10 })` 로 변경. `topAgentsN` 미지정 → 기본 5.
- **출력 계약**: `summary.topSkills` 최대 10 개. `summary.topAgents` 기존대로 5.
- **의존**: WU-3 의 `aggregateSummary` overload land.
- **검증 방법**: `pnpm --filter web typecheck`, M1 QA.
- **예상 LOC**: 1.

### WU-10: invalidate-skill-counts oneshot 스크립트

- **수정/생성 파일**:
  - `/Users/choesumin/Desktop/dev/vmc/argos/.claude/worktrees/stateful-hatching-lighthouse/packages/web/scripts/invalidate-skill-counts.ts` (생성)
- **입력 계약 (Critique R2 critical + minor #7 반영)**:
  - 스크립트 본문: prisma raw query `UPDATE daily_project_stats SET skill_counts = '{}'::jsonb, computed_at = '1970-01-01T00:00:00Z'::timestamptz WHERE computed_at < ${SKILL_COUNTS_INVALIDATION_AT}::timestamptz RETURNING project_id, date`.
  - `SKILL_COUNTS_INVALIDATION_AT` 상수는 daily-rollup.ts 에서 export 한 것을 import (단일 source of truth).
  - stdout 에 영향받은 row 수와 처음/마지막 (project_id, date) 샘플 5개 로깅.
  - **멱등 기준 (Critique R2 #7)**: WHERE 조건 방식이므로 **두번째 실행 = 0 rows**. 검증.
- **출력 계약**: 실행 가능한 ts 파일. stdout 에 영향받은 row 수.
- **실행 runbook (Critique R2 critical 반영)**:
  1. Step 1: PR merge & 새 코드 (WU-3 의 가드 포함) 모든 인스턴스에 배포.
  2. Step 2: 30 분 안정화 후 `pnpm --filter web tsx scripts/invalidate-skill-counts.ts` 1차 실행.
  3. Step 3: 10 분 후 같은 스크립트 2차 sweep — 실행 중에 누가 옛 row 를 새로 만들었다면 (이론적으론 새 코드만 도므로 없어야 함) 그것까지 invalidate. **0 rows 면 race 없었음 확인**.
- **의존**: WU-3 의 `SKILL_COUNTS_INVALIDATION_AT` export.
- **검증 방법**: 로컬 dev DB 에서 1회 실행 → row 수 출력. 같은 명령 2 번째 → 0 rows.
- **예상 LOC**: ~50.

### WU-11: SkillFrequencyChart 카피 검토 (NoOp 강제)

- **수정/생성 파일**:
  - `/Users/choesumin/Desktop/dev/vmc/argos/.claude/worktrees/stateful-hatching-lighthouse/packages/web/src/components/dashboard/skill-frequency-chart.tsx` (검토만)
- **입력 계약**: implement 가 카피 / 툴팁이 의미적으로 모호하지 않은지 1회 확인. **변경 금지**.
- **출력 계약**: git diff 비어 있어야 함.
- **의존**: 없음.
- **검증 방법**: `git diff -- packages/web/src/components/dashboard/skill-frequency-chart.tsx` 가 빈 결과.
- **예상 LOC**: 0.

## 병렬 실행 그룹

- **Group A (병렬, 독립)**: WU-1, WU-11
  - 충돌 검증: WU-1 = `skill-aggregation.ts` 신규, WU-11 = `skill-frequency-chart.tsx` 검토만 (변경 0). **충돌 없음.**
  - (WU-10 의 oneshot 스크립트는 WU-3 의 `SKILL_COUNTS_INVALIDATION_AT` export 에 의존하므로 Group B 이후로 이동.)
- **Group B (Group A 완료 후)**: WU-2, WU-3, WU-4
  - WU-2 = `skills/route.ts`, WU-3 = `daily-rollup.ts`, WU-4 = `__fixtures__/skill-call-fixture.ts` 신규. **서로 다른 파일, 충돌 없음.**
  - WU-2, WU-3, WU-4 모두 WU-1 의 export 시그니처에 의존.
- **Group C (Group B 완료 후)**: WU-9, WU-10, 그리고 WU-5/6/7/8 (테스트 4 개)
  - **WU-9** (`overview/route.ts` 1줄 변경) 는 WU-3 의 `aggregateSummary` overload land 후. 다른 파일과 무충돌 — 독립 worker.
  - **WU-10** (`scripts/invalidate-skill-counts.ts` 신규) 는 WU-3 의 `SKILL_COUNTS_INVALIDATION_AT` export 후. 독립 worker.
  - **WU-5, WU-6, WU-7, WU-8** 은 모두 신규 테스트 파일, 서로 다른 파일, 서로 다른 entry, 같은 fixture (WU-4) import → **병렬 가능**. fixture 가 read-only import 라 동시 실행 안전.
  - 충돌 검증: Group C 내 6 개 WU 모두 서로 다른 파일을 생성 / 수정. fixture 는 WU-4 가 owner 이고 Group C 는 import 만 → race 없음.

**Fan-out 흐름 요약**:
- 1차 fan-out: WU-1, WU-11 (병렬).
- WU-1 완료 게이트 통과 후 2차 fan-out: WU-2, WU-3, WU-4 (병렬).
- WU-3 / WU-4 완료 게이트 통과 후 3차 fan-out: WU-5, WU-6, WU-7, WU-8, WU-9, WU-10 (병렬).

## Negative Space 재확인

(context.md Negative Space + clarify 비범위 + Critique R1 #2 명시.)

- `daily-rollup.ts` L160-179 의 `agentGroups` / `modelGroups` (Top agents, Token usage by model).
- `daily-rollup.ts` L122-149 의 `sessionCount` / `turnCount` / `usageTotals`.
- `daily-rollup.ts` L194-243 `userStatsRaw` 의 `e_agg.skill_calls` (`userStats.skillCalls` — context 21 별도 task). **WU-3 acceptance 체크리스트에 명시.**
- `skills/route.ts` 의 `skill_durations` CTE (median duration).
- 인증 / 권한 (auth-helper, rbac, dashboard-route-helper).
- `SkillFrequencyChart` 의 차트 모양 / 축 / empty state 메시지 (WU-10 = 검토만).
- `packages/cli`, `packages/shared` 의 비-dashboard 도메인, `packages/web/src/app/api/auth/*`, settings.
- skills 페이지 정의를 **좁히는** 방향 (Q4 폐기).
- 다른 dashboard 카드 (Top agents 카운트는 변경 없음 — WU-8 가 `topAgentsN` 기본 5 유지로 보장. Critique R1 #2 반영).
- **`aggregateSummary` 의 다른 호출자 (`weekly-report.ts` L383, L384)** 는 positional `aggregateSummary(rollups, 10)` 사용 — backward compat overload 로 그대로 동작 (변경 0줄).

## 검증 시나리오 (Evaluate 단계 입력용)

### 자동

- `pnpm --filter web typecheck`.
- `pnpm --filter web vitest run skill-aggregation` — WU-5.
- `pnpm --filter web vitest run daily-rollup` — WU-6.
- `pnpm --filter web vitest run weekly-report` — WU-7.
- `pnpm --filter web vitest run dashboard/skills/route` — WU-8.
- `pnpm --filter web vitest run` — 기존 테스트 (`dashboard-row-mapping.test.ts`, `events.test.ts`, `rbac.test.ts`) 회귀 없음.
- `pnpm --filter web build`.

### QA 시나리오 (실DB 띄워서)

1. **배포 runbook 검증 (Critique R2 critical 가드)**:
   - 1a. 새 코드 (`SKILL_COUNTS_INVALIDATION_AT` 가드 포함) 배포 완료.
   - 1b. 옛 row 가 있는 (orgSlug, from, to) 로 overview 진입 → 가드가 stale 판정 → 자연 재계산 → 카드가 UNION 정의로 채워짐. **스크립트 실행 없이도 correctness 보장**.
   - 1c. 30 분 후 oneshot 스크립트 1차 실행 (WU-10) → row 수 로깅.
   - 1d. 10 분 후 oneshot 스크립트 2차 sweep → **0 rows** (race 없음 확인).
2. **M1 동치성 — slash command 위주 org**: `/dashboard/<orgSlug>/skills` Top 10 vs `/dashboard/<orgSlug>/overview` "Skill별 호출 빈도" Top 10 = **skillName, callCount, 정렬 (callCount DESC, skillName ASC) 완전 일치**. (M1, M2)
3. **M3 회귀 없음**: events.is_skill_call=true 만 있는 org/기간 → overview 카드가 옛 정의의 부분집합으로 동일 카운트.
4. **Negative Space 가드 — Top Agents 회귀 없음**: Top Agents 카드의 항목 수가 본 변경 전후 동일 (5). `topAgentsN=5` 기본값 보존 확인.
5. **권한 가드 (M4)**: 비멤버 / 미인증 → 401/403.
6. **weekly-report 영향 (WU-7 자동 가드 보완)**: 같은 (org, week) 의 weekly report 의 `summary.topSkills` 가 UNION 정의로 변동, **다른 KPI (sessionCount, totalTokens, delegation.taskCount, eligibleUserCount)** 는 본 변경 전과 동일.
7. **Stale cache 가드 단독 (스크립트 미실행 시나리오)**: 가상의 prod hotfix 상황 — 가드 코드만 배포, 스크립트 미실행. overview 첫 진입 latency 가 평소보다 ~ 수백 ms 길지만 정확성은 유지. 두번째 진입부터 평소 latency.

## Decision Log

- **Decision-1: 구현 채널 V1a (rollup 정의 변경) 채택, V1b (overview 합성) 거절.** **[ADR 후보 — 공유 rollup metric semantics 변경]**
  - 컨텍스트: clarify §2. V1a/V1b 외부 결과 동일하나 V1b 는 rollup 사전집계 가치 깎고 users/weekly-report 와 정의 어긋남 (context 12, 13).
  - 대안과 거절 사유: V1b — 백필 무필요로 단순하지만 매 overview 요청 정규식 평가 + 정의가 라우트별 분산.
  - 트레이드오프: V1a 는 캐시 stale 처리 필요 → Decision-3 으로 해결.
  - 태그: `language:typescript`, `library:prisma`, `area:dashboard-rollup`, `area:api`, `adr-candidate`.

- **Decision-2: UNION 의 단일 출처를 row-level Prisma.Sql CTE fragment (`skillCallRowsCte`) 로 추출.** **[ADR 후보 — 공유 rollup metric semantics 변경]**
  - 컨텍스트: user_directives 4번. Critique R1 #3 — `{ skillName, callCount }` 만 export 하면 skills route 의 추가 컬럼 (session_count, user_count, last_used_at, duration) 을 helper 가 못 받쳐 SQL 중복 발생.
  - 대안과 거절 사유: (a) 함수만 export — skills route 가 자기 CTE 를 따로 유지 → 정의 두 곳. (b) raw string export — Prisma 파라미터 바인딩 안전성 무력화 (Critique R1 minor). (c) `dashboard-row-mapping.ts` 에 합치기 — 매핑/집계 책임 혼재.
  - 트레이드오프: row-level CTE 는 호출자가 자기 GROUP BY 책임. 그러나 skills route 의 `skill_events` / `skill_durations` 패턴이 이미 그런 구조여서 자연스러움.
  - 태그: `area:server-helper`, `language:typescript`, `library:prisma`, `pattern:single-source-of-truth`, `adr-candidate`.

- **Decision-3: 과거 캐시 invalidation = 코드 가드 단독 (correctness) + oneshot 스크립트 (speed-up).** **[Critique R2 critical + #2 반영]**
  - 컨텍스트: R1 #1, R2 critical (race condition), R2 #2 (가드 조건 단일화). user_directives 2번 "가장 가벼운 전략".
  - 대안과 거절 사유: (a) DB schemaVersion 컬럼 — 무거움. (b) row 전량 delete — 다른 컬럼도 재계산. (c) computedAt + skillCounts==='{}' 합성 가드 — 스크립트 미실행 row 를 못 잡음 (R2 #2).
  - 채택안:
    1. **Primary 가드 (correctness)**: `getDailyRollups` 의 `row.computedAt < SKILL_COUNTS_INVALIDATION_AT` 단일 조건. 이것만으로 모든 옛 row 가 stale 판정 + 자연 재계산. 스크립트 없이도 정확.
    2. **Race condition 해소 (R2 critical)**: 배포 runbook — 코드 배포 완료 → 안정화 30 분 → 스크립트 1차 → 10 분 → 2차 sweep. vercel serverless single-region 가정에서 old writer 윈도우는 초 단위, 그 윈도우의 upsert 도 다음 요청 / 2차 sweep 에서 invalidate.
    3. **Speed-up 스크립트 (WU-10)**: lazy 가드의 first-request latency 비용을 미리 spread. 미실행 = correctness 영향 없음.
  - 트레이드오프: 코드 상수 (`SKILL_COUNTS_INVALIDATION_AT`) 는 배포 후 immutable. 다음 정의 변경 때 같은 패턴 재사용 (template).
  - 태그: `pattern:lazy-cache-invalidation`, `pattern:explicit-cache-invalidation`, `area:dashboard-rollup`, `decision:scope-pragmatic`.

- **Decision-4: `aggregateSummary` 를 TS overload 3 종으로 확장. overview 만 `{ topSkillsN: 10 }`, 다른 호출자 기본 5.** **[Critique R2 #5 반영]**
  - 컨텍스트: R1 #2 (topN 전파로 Negative Space 위반), R2 #5 (overload 명시화 필요).
  - 대안과 거절 사유: (a) 차트 컴포넌트를 5 로 — UX 후퇴. (b) skills 페이지 LIMIT 10 — 비범위. (c) union type `number | object` 만 — type narrowing 흔들림.
  - 채택안: 명시적 3 overload (no-arg / number / options). 내부 `normalizeAggregateSummaryOptions` 가 분기. number 입력은 두 N 에 동일 적용 → weekly-report 의 `aggregateSummary(rollups, 10)` 가 `{ topSkillsN: 10, topAgentsN: 10 }` 로 매핑 (현행 동작 보존).
  - 트레이드오프: API 표면 복잡도 증가. 그러나 호출자 변경량 0 (legacy overload).
  - 태그: `area:api-response-shape`, `pattern:additive-api-change`, `pattern:typescript-overload`, `decision:scope-pragmatic`.

- **Decision-5: Tie-break 정렬 = `callCount DESC, skillName ASC` 양쪽 동일 적용.**
  - 컨텍스트: Critique R1 #5 — M1 의 "순서까지 완전 일치" 가 deterministic tie-break 없이는 비결정. skills route 의 `ORDER BY e.call_count DESC` 는 같은 카운트의 skillName 정렬을 SQL 구현에 위임.
  - 대안과 거절 사유: 무작위 — M1 위반. 다른 기준 (`last_used_at DESC`) — 정보 손실 + 양쪽 적용 비용.
  - 트레이드오프: skills route 의 기존 응답 순서가 미세하게 (같은 카운트끼리만) 바뀔 수 있음. 사용자 영향 무시 가능.
  - 태그: `area:sql-order`, `pattern:deterministic-ordering`.

- **Decision-6: 테스트 4 개 (WU-5 helper, WU-6 rollup builder, WU-7 weekly-report 회귀, WU-8 skills route contract) + 공유 fixture (WU-4) 단일 owner.** **[Critique R2 #4 반영 — fixture 충돌 방지] [ADR 후보 — 공유 rollup metric semantics 변경]**
  - 컨텍스트: R1 #4 (인프라 결정), R1 #6 (weekly 회귀 가드), R2 #4 (fixture race / 중복 구현 방지). 기존 dev DB 재사용.
  - 대안과 거절 사유: 통합 테스트 — 두 API 띄우고 응답 비교, 인증 mocking 비용 큼. fixture 를 각 테스트 파일 내부 inline — 4 파일에 동일 schema 중복.
  - 채택안: WU-4 가 fixture owner. WU-5/6/7/8 은 read-only import. Group C 병렬 실행 시 fixture 는 import 만 일어나므로 race 없음.
  - 트레이드오프: WU 수 증가 (4→5 test-related). 그러나 fixture 변경 영향이 명시되어 future 회귀 안전.
  - 태그: `area:test-strategy`, `pattern:shared-fixture-owner`, `decision:scope-pragmatic`, `adr-candidate`.

- **Decision-7: weekly-report 의 의도된 동시 영향 수용, 자동 가드 (WU-6) 로 비-skill 컬럼 불변 보장.**
  - 컨텍스트: weekly-report 가 같은 rollup 사용 (context 12), Critique R1 #6 — 자동 가드 필요.
  - 대안과 거절 사유: weekly-report 만 옛 정의 — rollup 두 벌 → 부담 + 사용자 멘탈 모델 어긋남.
  - 트레이드오프: skill 관련 weekly KPI (`topSkills`, `insights.skillAssets.totalCalls`, `topUsers.learnFrom.skillUsage`) 가 의도적으로 변동. WU-6 가 비-skill 컬럼이 변하지 않음을 가드.
  - 태그: `area:weekly-report`, `pattern:shared-rollup`, `decision:scope-pragmatic`.

- **Decision-8: half-open `[from, to)` UTC interval 을 모든 helper / route / rollup 의 공통 경계로 통일. caller 가 `toExclusive` 변환 책임.** **[Critique R2 minor #6 반영]**
  - 컨텍스트: R1 #7. 현재 skills route 는 `>= from AND <= to` (inclusive), rollup builder 는 `utcDayEnd` 가 `23:59:59.999`. R2 minor — `parseDateRange` 가 inclusive 의도로 만든 `to` 와 half-open 의 정합성.
  - 채택안: caller (route) 에서 helper 호출 직전 `toExclusive = new Date(to.getTime() + 1)` 변환. 또는 `parseDateRange` 가 `toExclusive` 도 함께 반환 (옵션 — implement 가 변경 폭 보고 결정). rollup builder 도 동일 패턴 (`utcDayStart(date + 1day)` 를 helper 인자로).
  - 대안과 거절 사유: helper 가 inclusive `<=` 수용 — UNION 분기에 동일 보정 로직 분산, 정의 단일 출처 의도 훼손.
  - 트레이드오프: caller 가 변환 책임을 짊. 그러나 변환 1줄이라 비용 작음.
  - 태그: `area:date-range`, `pattern:half-open-interval`, `decision:scope-pragmatic`.

- **Decision-9: oneshot 스크립트 race condition 은 배포 runbook 으로 해소.** **[Critique R2 critical 반영]**
  - 컨텍스트: R2 critical — 스크립트 실행 중 old writer 가 옛 정의로 upsert 하고 `computedAt` 을 새로 찍어 가드를 빠져나갈 위험.
  - 채택안: 3-step runbook — (1) 새 코드 전체 인스턴스 배포 → (2) 30 분 안정화 후 1차 스크립트 → (3) 10 분 후 2차 sweep 으로 race 잔여 검증 (2차에서 0 rows 이면 확정).
  - 대안과 거절 사유: (a) DB advisory lock — 스크립트 / 빌더 양쪽 코드 추가, 본 task 범위 초과. (b) maintenance flag — 다운타임 발생, 사용자 영향. (c) old writer 차단 — 코드 분기 추가 부담.
  - 트레이드오프: runbook 의 인적 절차 의존. 그러나 lazy 가드가 correctness 를 이미 보장하므로 runbook 은 best-effort speed-up + 검증.
  - 태그: `area:deployment-runbook`, `pattern:lazy-cache-invalidation`, `decision:scope-pragmatic`.

**ADR 승격 기준 (R1 #9 반영)**: "공유 rollup metric semantics 변경" 또는 "단일 출처 helper 도입" 인 결정만 ADR 후보. → Decision-1, 2, 6. 나머지 (3/4/5/7/8/9) 는 본 task 한정 결정으로 ADR 미승격.

## Critique Reflection

### Round 1 반영

| Critique 항목 | 반영 | 위치 | 사유 |
|---|---|---|---|
| #1 schemaVersion 프록시 위험 (major) | 반영 | Decision-3, WU-3, WU-9, 아키텍처/접근 선택 | oneshot 스크립트 (WU-9) + `SKILL_COUNTS_INVALIDATION_AT` 코드 가드 병행. "schemaVersion" 표현 제거. |
| #2 topN 전파로 Negative Space 위반 (major) | 반영 | Decision-4, WU-3, WU-8, Negative Space 재확인 | `aggregateSummary` 시그니처를 per-card N 으로 확장 + backward-compat overload. overview 만 `topSkillsN=10`. |
| #3 helper 인터페이스 불명확 (major) | 반영 | Decision-2, WU-1, 아키텍처/접근 선택 | row-level CTE fragment (`skillCallRowsCte`) + thin wrapper (`aggregateSkillCountsForRange`) 2 layer 로 명확화. skills route 도 같은 CTE 위에 자기 집계. |
| #4 테스트 인프라 미확정 (major) | 반영 | WU-4, Decision-6 | 기존 dev DB 재사용 결정. fallback (SQL fragment 만 검증) 도 plan 에서 허용. |
| #5 tie-break 미정의 (major) | 반영 | Decision-5, WU-2, WU-3 | `callCount DESC, skillName ASC` 양쪽 동일. |
| #6 weekly-report 자동 가드 부재 (major) | 반영 | WU-6, Decision-7 | weekly-report 단위 회귀 가드 신규 work unit 추가. |
| #7 from/to 경계 불명 (minor) | 반영 | Decision-8, WU-1, WU-2, WU-3 | half-open `[from, to)` 로 통일. |
| #8 WU-2 회귀 검증 약함 (minor) | 반영 | WU-7 신규 | skills route contract 테스트 work unit 추가. |
| #9 ADR 승격 미기록 (minor) | 반영 | Decision Log 의 `[ADR 후보]` 마킹 + 승격 기준 명시 | Decision-1/2/6 후보. |
| minor — Prisma.Sql 강제 | 반영 | WU-1 입력 계약 | `Prisma.sql` 만 export. string 연결 금지 명시. |
| minor — invalidate row 누락 위험 (#6) | 반영 | WU-3 입력 계약 | stale row 가 `missingDays` 로 명시 이동. |
| minor — invalidate cost 근거 (#7) | 반영 | 아키텍처/접근 선택 비용 모델 | dev worst case ~72s 추정 + prod escalation 경로. |
| minor — WU-6 UI 검토가 변경 유도 위험 (#8) | 반영 | WU-10 — 검토 체크리스트로 격하 + "변경 금지" 명시 | git diff 비어야 함. |

### Round 2 결과

Round 2 에서 신규 critical 1 건 + major 4 건이 surface 됐다. 모두 반영.

| Critique R2 항목 | 반영 | 위치 | 사유 |
|---|---|---|---|
| **critical** — oneshot script race condition | 반영 | Decision-3, Decision-9 (신규), WU-10 실행 runbook | 3-step 배포 runbook (deploy → 30분 → 1차 sweep → 10분 → 2차 sweep 확정). lazy 가드가 correctness 보장하므로 runbook 은 speed-up + 검증. |
| #2 major — 가드 조건 일관성 | 반영 | 아키텍처/접근 선택, WU-3, Decision-3 | `computedAt < THRESHOLD` 단일 조건으로 통일. `skillCounts === '{}'` 합성 조건 제거. |
| #3 major — helper 인터페이스 모호 (CTE vs relation) | 반영 | WU-1 / 아키텍처/접근 선택 | `skillCallRowsRelation` 으로 rename. SELECT-UNION-SELECT relation expression 만 반환. caller 가 `WITH ... AS (${...})` 로 감쌈. |
| #4 major — 테스트 fixture owner 미정 | 반영 | WU-4 (신규, fixture owner), Decision-6 | 신규 WU-4 `__fixtures__/skill-call-fixture.ts` 가 단일 owner. WU-5/6/7/8 은 read-only import. |
| #5 major — aggregateSummary overload TS 안전성 | 반영 | 아키텍처/접근 선택 (코드 블록), WU-3, Decision-4 | 명시적 3-overload + `normalizeAggregateSummaryOptions`. WU-6 단위 테스트 4 케이스 (undefined/number/options/both). |
| #6 minor — parseDateRange ↔ half-open 변환 | 반영 | WU-2, Decision-8 | caller 에서 `toExclusive = to + 1ms` 변환 (또는 parseDateRange 확장). |
| #7 minor — script 멱등 기준 | 반영 | WU-10 검증 | `WHERE computed_at < THRESHOLD` 방식 → 두번째 실행 = 0 rows 로 명시. |

### 종료 사유

Round 2 의 critical + major 5건 모두 반영. 신규 issue 가 plan 본문에 모두 반영된 상태이고, 남은 점검은 implement 단계의 코드 리뷰 / typecheck 가 더 효율적으로 처리할 영역 (구체적 TS overload syntax, prisma raw query syntax 등). **자율 종료. Round 3 미실행.**
