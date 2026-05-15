코드 리뷰 결과를 정리했습니다.

---

# 코드 리뷰 — task:2026-05-14-overview-skill-frequency-bug

## 개요

`/dashboard/overview` 의 "Skill별 호출 빈도" 카드와 `/dashboard/skills` 페이지가 같은 (org, from, to, projectId) 에서 서로 다른 결과를 내던 버그를 해결한다. 핵심 변경은:

- **`skill-aggregation.ts` 신설** — `events.is_skill_call=true` ∪ `messages` slash command (events anti-join) UNION 정의를 `Prisma.Sql` relation expression (`skillCallRowsRelation`) + count wrapper (`aggregateSkillCountsForRange`) 의 두 레이어로 추출 (ADR-014).
- **`daily-rollup.ts` 의 `computeDailyRollup`** — `event.groupBy({ isSkillCall: true })` 를 helper 호출로 교체. `skillCounts` 가 UNION 정의를 따른다 (ADR-013).
- **`skills` route** — 인라인 SQL 의 `event_skill_calls` / `message_slash_calls` CTE 를 helper 호출로 치환. ordering 에 `skill_name ASC` tie-break 추가.
- **`overview` route** — `aggregateSummary(rollups, 5)` → `{ topSkillsN: 10 }` 옵션 객체. 차트 표시 N 과 정렬.
- **lazy invalidation 가드** — `SKILL_COUNTS_INVALIDATION_AT = 2026-05-16T00:00Z`. 임계 이전 row 는 cache miss 처리해 자연 재계산 (ADR-015).
- **보조 sweep 스크립트** — `packages/web/scripts/invalidate-skill-counts.ts` (dry-run 기본, `--execute` 명시 시 UPDATE).
- 단위/통합 테스트 4종 + 공유 fixture (`__fixtures__/skill-call-fixture.ts`).

전반적으로 ADR 의 결정·근거·트레이드오프와 코드가 잘 맞물려 있고, 단일 출처(helper) → 호출자 임베드 구조가 깔끔하다. 다만 **ADR-013 의 "scope 주장"이 실제 구현보다 넓다**는 점, **`INVALIDATION_AT` 시각 설정에 race 위험이 있다**는 점이 가장 큰 이슈.

---

## ADR ↔ 코드 일관성

### ADR-013 — "weekly-report 가 모두 이 정의를 공유한다" 는 과대 주장 (Medium)

ADR-013 본문 (`docs/adr.md:304`)
> `daily_rollups.skillCounts` 빌더, skills route, overview route, **weekly-report 가 모두 이 정의를 공유한다**.

그러나 `packages/web/src/lib/server/weekly-report.ts` 에는 UNION 정의로 안 옮긴 skill 쿼리가 두 곳 남아있다:

- `queryTopSkillDiversityByUser` (weekly-report.ts:159) — `events.is_skill_call = true` 만 카운트. → `topUsers.learnFrom.skillDiversity` 리더가 events-only 정의로 산출됨.
- `queryForgottenSkills` (weekly-report.ts:323) — `past_skills` / `current_skills` CTE 가 모두 `events.is_skill_call=true` 만 본다. → slash command 로만 호출된 skill 은 "잊혀진 스킬" 판정 대상에서 빠지거나, 과거에 slash 로만 썼던 skill 이 "현재도 events 없음" 이라는 이유로 잘못 forgotten 분류됨.

추가로 `aggregateUserStats(rollups).skillCalls` (= `DailyUserStat.skillCalls`) 는 `daily-rollup.ts:232` 의 `e_agg.COUNT(*) FILTER (WHERE is_skill_call)` 로 채워지므로 여전히 events-only. → `topUsers.learnFrom.skillUsage` 리더도 events-only.

후자 셋(`userStats.skillCalls`, `queryTopSkillDiversityByUser`, `queryForgottenSkills`)은 `02-context.md:21,31-34` 와 `03-plan.md:110` 에서 **Negative Space (별도 task 로 이관)** 로 명시한 사항이라 *구현 자체는 의도된 결과*다. 문제는 ADR-013 의 문장이 이 negative space 를 노출하지 않고 "모두 공유" 라고 적은 점.

**액션**: ADR-013 결정/근거 절을 다음 중 하나로 보정.
- (권장) "skill **count** 정의는 모두 공유한다. 단, `userStats.skillCalls` / weekly-report 의 `queryTopSkillDiversityByUser` / `queryForgottenSkills` 는 본 task 범위 외 (별도 task — 'weekly-report skill 정의 통일')." 한 줄로 negative space 를 ADR 본문에 박는다.
- 또는 후속 task 로 이관한 항목을 ADR 의 "참고" 절에 링크 추가.

지금 상태로 ADR 만 읽은 사람이 weekly-report 의 forgotten/diversity 가 UNION 인 줄 알고 회귀 가드 짤 가능성이 있다.

### ADR-015 — `SKILL_COUNTS_INVALIDATION_AT` 시각이 위험하게 이른 (Medium)

`daily-rollup.ts:10`
```ts
export const SKILL_COUNTS_INVALIDATION_AT = new Date('2026-05-16T00:00:00Z')
```

ADR-015 본문 (`docs/adr.md:373`):
> Primary 가드: 코드 상수 `<METRIC>_INVALIDATION_AT: Date` 를 **PR merge 시각 + 24h 등 충분히 여유 있는 timestamp** 로 박는다.

오늘이 2026-05-15 인데 threshold 가 2026-05-16T00:00Z 다. PR 머지/배포 타임라인이 다음 어느 경우로 흐르면 가드가 정확성을 잃는다:

1. **머지·배포가 2026-05-16T00:00Z 이후로 슬립** → 신규 코드가 배포된 시점부터 쓰는 row 의 `computedAt` 은 모두 threshold 보다 **미래**. 그런데 배포 전(이 commit merge 직전까지 가동하던 구 코드)이 threshold 보다 **미래에** 옛 정의로 upsert 한 row 가 있다면, 그 row 는 stale 임에도 가드가 못 잡는다 → **사용자가 옛 카운트를 본다**. ADR-015 가 약속한 correctness 가 깨진다.
2. **머지는 2026-05-15 안에 끝나지만 배포·전파 (Vercel rolling, 캐시 등) 가 2026-05-16T00:00Z 를 넘김** → 동일 race.

ADR-015 의 race 해소 모델 (`docs/adr.md:375`) 은 "threshold 가 *모든* 신규 코드 배포 완료 시각 이후" 임을 가정한다. 현재 값은 그 가정을 만족하지 않을 수 있다.

**액션** (택1):
- 머지 직전에 `SKILL_COUNTS_INVALIDATION_AT` 을 **머지 직후 + 24h 의 미래 시각** 으로 재설정하는 PR pre-merge step 을 runbook 에 명시 (지금 PR description / 배포 체크리스트에 한 줄).
- 또는 보수적으로 `2026-05-17T00:00:00Z` 정도로 늘려둔다 (배포 슬립 24-48h 흡수). 어차피 threshold 가 미래여서 발생하는 비용은 "그 시점까지 hit 한 모든 캐시 row 가 stale 판정되어 1회 재계산" 뿐이고, 보조 sweep 으로 일괄 비용 처리하면 사용자 체감 없음.

이 항목은 ADR 본문엔 가이드라인이 있지만 **코드의 실제 값이 그 가이드라인을 어긴다**. 머지 전 반드시 갱신.

### ADR-013 M1 — Top-N tie-break 의 collation 비대칭 (Low)

ADR-013 (`docs/adr.md:307`) 의 success metric M1: "두 화면 Top N 의 (skillName, callCount, **순서**) 완전 일치".

현재 두 라우트의 tie-break 구현이 collation 이 다르다:
- `overview` → `aggregateSummary` (daily-rollup.ts:620) → `a.skillName.localeCompare(b.skillName)` (JS, V8 default = en-US-ish, locale-aware)
- `skills` route (route.ts:86) → `ORDER BY e.call_count DESC, e.skill_name ASC` (Postgres collation, DB instance 의 lc_collate 의존)

테스트 fixture 의 skill 이름이 전부 lowercase ASCII (`bar`, `baz`, `qux`, `whitespace-ok`) 라 둘이 동일하지만, 실데이터에 `Foo` / `foo`, 한글, `_` / `-` 가 섞이면 순서가 갈릴 수 있다.

**액션**: 둘 중 하나로 통일. 가장 싼 옵션은 skills route 쪽을 `ORDER BY e.call_count DESC, e.skill_name COLLATE "C" ASC` 로 잠그는 것 (binary order). aggregateSummary 도 binary 비교 (`<`/`>`) 로 바꾸면 완전 일치. 회귀 테스트 보강도 권장 — 현재 fixture 만으론 안 잡힘.

### `computeDailyRollup` 내부 시간 경계 표기 비대칭 (Nit)

`daily-rollup.ts:127-130` 에서 같은 day 에 대해
- `sessionCount`, `turnCount`, `usageTotals`, `agentGroups`, `modelGroups`, `userStatsRaw`, `activeUserRows` → `gte: from, lte: to` (closed, `to = 23:59:59.999`)
- `aggregateSkillCountsForRange` → `[from, toExclusive)` half-open (`toExclusive = next day 00:00:00.000`)

JS Date ms 단위에선 동일 집합이지만 Postgres `timestamptz` 는 μs 정밀도라 `23:59:59.9995` 같은 row 가 존재할 경우 skill 만 잡고 다른 메트릭은 누락한다 (현 데이터 파이프라인이 그런 timestamp 를 만드는지는 별도 점검 필요). 보수적으로 모든 쿼리를 helper 와 동일한 half-open `< toExclusive` 로 통일해두면 향후 cron/이벤트 시각 정밀도 변경 시 안전.

---

## 코드 품질 / 컨벤션

### 좋은 점

- **단일 출처 (ADR-014) 가 깔끔하게 실현됨**. `skillCallRowsRelation` 이 `Prisma.Sql` 로 반환되고 호출자가 자기 CTE 에 임베드하는 구조는 daily-rollup 의 단순 카운트와 skills route 의 다중 집계 (`session_count`, `user_count`, `last_used_at`, `skill_durations` join) 양쪽을 SQL 중복 없이 잘 흡수한다.
- **half-open 계약을 helper 시그니처에 박은 것**, 호출자 (`overview`/`skills` route, `daily-rollup`) 가 모두 `parseDateRange` 의 inclusive `to` 를 `+1ms` 변환해 넘기는 패턴이 일관적이다.
- **`aggregateSummary` 의 3-overload + `normalizeAggregateSummaryOptions`** — weekly-report 의 기존 `aggregateSummary(rollups, 10)` positional 호출이 변경 0줄로 살아남으면서, overview 가 새 옵션 객체 (`{ topSkillsN: 10 }`) 만 쓴다. `@deprecated` 도 잘 박아둠.
- **테스트 커버리지** — fixture 공유 (`__fixtures__/skill-call-fixture.ts`), DB 가용성 가드 (`describe.skipIf(!DB_AVAILABLE)`), Case A (slash only) / Case B (UNION + anti-join + role filter + whitespace), normalizeOptions overload 동치성, tie-break determinism 모두 포함.
- **invalidate-skill-counts.ts** 의 dry-run 기본 + `--execute` 게이트 + `RETURNING` 으로 affected sample 출력 — runbook 친화적.

### 개선 권고

- **`daily-rollup.ts:129`** 주석에 일본어가 섞임 — `// half-open 경계: helper 는 [fromInclusive, toExclusive) を 要求`. 의도는 "를 요구". (Nit, 가독성)
- **`vitest.config.ts`** 의 .env 파서 — 30줄짜리 IIFE 가 인라인됨. `dotenv` 가 이미 `weekly-report.test.ts` 와 `skill-aggregation.test.ts` 에서 사용 중이고 deps 에 있을 가능성이 높다. `dotenv/config` 를 `setupFiles` 에 한 줄로 쓰는 게 표준. 또는 vitest 의 `envFile` (2.x) 옵션이 안 먹는다고 적었는데, `import('dotenv').config({ path })` 를 globalSetup 에 두는 게 더 간결.
- **`skill-aggregation.test.ts` 의 `dotenvConfig` 호출**이 파일 안에 직접 박혀 있는데, `vitest.config.ts` 의 env 로딩과 중복된다. 한 곳으로 모으는 게 권장 (지금은 같은 env 를 두 번 로드하는 비용).
- **`skills` route 의 `LIMIT 50`** — overview 는 `topSkillsN: 10`. 두 라우트가 같은 N 을 노출해야 M1 의 "Top N 동일" 검증이 의미를 가지는데, 클라이언트 컴포넌트가 알아서 자르는지 백엔드에서 자르는지 일관성 확인 필요. (이 PR 범위 외일 수 있음, 정보 차원에서만 기록.)
- **`invalidate-skill-counts.ts:34`** `const isDryRun = !args.includes('--execute') || process.env.DRY_RUN === 'true'` — `DRY_RUN=true && --execute` 조합 시 dry-run 이 이김. 의도 맞음 (안전 측에 가깝게). 다만 사용자에 게 명확하게 알리는 로그 한 줄이 있으면 좋다 (예: `[OVERRIDE] DRY_RUN=true overrides --execute`).
- **테스트 fixture 의 timestamp 가 `setUTCHours(12, 0, 0, 0)`** — 명확하고 좋다. 다만 시간 경계 테스트가 "day 의 정확히 자정 직전 (23:59:59.999)" / "다음 날 자정 (00:00:00.000)" 의 row 를 포함하지 않는다. half-open 계약을 강하게 보호하려면 경계값 fixture 가 한 케이스 더 있는 게 안전.

---

## 위험 / 잠재 이슈

1. **(Medium) 배포 race** — `SKILL_COUNTS_INVALIDATION_AT` 이 머지·배포 완료 시각보다 이르면 ADR-015 가 약속한 correctness 가 깨진다. 위 ADR-015 절 참조.
2. **(Medium) ADR-013 가 weekly-report 의 forgotten/diversity 까지 통일된 것처럼 읽힘** — 후속 task 명시화 필요. 안 하면 PR 리뷰어가 "이 PR 이 weekly-report 까지 다 잡았다" 고 오해할 수 있고, 회귀 테스트도 그쪽엔 안 깔린다.
3. **(Low) Top-N tie-break collation 비대칭** — 실데이터에서 비-ASCII / 대소문자 혼합 skill 이름이 들어오면 두 라우트의 순서가 갈릴 수 있다. M1 의 "순서 완전 일치" 가 무너진다.
4. **(Low) `userStats.skillCalls` events-only** — Negative Space 로 명시되어 의도된 결과지만, 같은 weekly report 안에서 `summary.topSkills` (UNION) 과 `topUsers.learnFrom.skillUsage` (events-only) 가 다른 정의로 산출되어 사용자가 두 카드를 비교하면 어긋나 보인다. 다음 스프린트 follow-up 후보로 명시 권장.
5. **(Low) `INVALIDATION_AT` 가 immutable 한 상수** — ADR-015 트레이드오프에서 명시함. 다음 정의 변경 시 새 상수 (`SKILL_COUNTS_V2_INVALIDATION_AT` 같은) 가 추가될 텐데, 동시에 옛 상수를 *지우면* 옛 row 의 guard 가 사라진다. ADR 에 "다음 변경 시 옛 상수는 가장 늦은 정의 변경 시각으로 합쳐서 단일 상수로 유지" 같은 가이드를 한 줄 추가하면 명료해진다.

---

## 보안

- `skillCallRowsRelation` 이 `Prisma.sql` template 으로만 빌드되고 `projectIds` / `fromInclusive` / `toExclusive` 모두 파라미터 바인딩됨 → injection 안전 (ADR-014 의 설계 의도와 일치). 
- `invalidate-skill-counts.ts` 가 `WHERE computed_at < threshold` 단일 조건으로 동작하고, threshold 는 코드 상수라 외부 입력 없음. 
- skills route 의 `regexp_matches(...)` regex 가 user content 에 대해 LATERAL JOIN 되는데, 정규식 자체는 리터럴 상수라 ReDoS 위험 없음 (`[^<]*` 등 한 번의 nested unbounded 없음). 

---

## 테스트 커버리지

- `aggregateSkillCountsForRange` — Case A (slash only), Case B (UNION + anti-join + role filter + whitespace + time boundary half-open). 충분.
- `getDailyRollups.skillCounts` — fixture 결과가 `EXPECTED_SKILL_COUNTS` 와 정확히 일치 + 예상 외 skill 없음 어설션. 충분.
- `aggregateSummary` overload 동치성 (positional 10 vs object), tie-break determinism, top-N 절삭, 비-skill KPI 불변. 충분.
- skills route GET handler — auth mock + 실 DB fixture 로 응답 형태 + ordering + 빈 projectIds + auth 실패 401. 충분.

**미커버 (M1 정합성 직접 검증 없음)**:
- 같은 fixture 로 **overview route + skills route 를 둘 다 호출** 하고 Top-N 의 `(skillName, callCount, 순서)` 가 완전 일치하는지 검증하는 통합 테스트가 없다. 두 라우트 각각의 단위 테스트는 통과해도 위에서 지적한 collation 비대칭 같은 cross-cut 회귀를 못 잡는다. M1 이 success metric 이므로 한 케이스라도 추가 권장.

---

## 머지 전 권장 액션 요약

1. **(Must)** `SKILL_COUNTS_INVALIDATION_AT` 을 머지 직후 + 24h 의 미래 시각으로 갱신 (또는 `2026-05-17T00:00Z` 같이 보수적으로). 머지 PR 의 마지막 commit 으로 박는 게 안전.
2. **(Should)** ADR-013 본문에 "weekly-report 의 `queryForgottenSkills` / `queryTopSkillDiversityByUser` / `userStats.skillCalls` 는 본 task 범위 외 (별도 follow-up)" 한 줄 추가.
3. **(Should)** Top-N tie-break collation 통일 — skills route 의 `ORDER BY ... ASC` 를 `COLLATE "C"` 로 잠그거나, aggregateSummary 의 `localeCompare` 를 binary 비교로 교체.
4. **(Nice)** overview ↔ skills 라우트 Top-N 동일성 통합 테스트 1건 추가 (M1 직접 가드).
5. **(Nit)** `daily-rollup.ts:129` 주석 일본어 → 한국어.

전체적으로 잘 설계된 변경이고, ADR 의 결정·근거 문서화가 코드와 거의 일관된다. 머지 전에 위 1번만 반드시 처리되면 안전하게 배포 가능.
