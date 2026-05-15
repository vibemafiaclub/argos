---
id: UC-SESS-003
name: Overview 의 "Skill별 호출 빈도" 카드를 본다
level: user-goal
scope: 웹 대시보드 (`/dashboard/[orgSlug]/overview`) + 백엔드 API (`/api/orgs/[orgSlug]/dashboard/overview`) + `daily_project_stats` 사전집계
primary_actor: orgSlug 의 멤버 사용자 (OWNER/ADMIN/MEMBER 동일 동작)
status: active
includes: []
related: [UC-SESS-002]
e2e: []
coverage_status: pending
sources:
  - docs/tasks/2026-05-14-overview-skill-frequency-bug/01-clarify.md
  - docs/tasks/2026-05-14-overview-skill-frequency-bug/03-plan.md
last_reviewed: 2026-05-15
---

## 이해관계자와 관심사

- **orgSlug 멤버 사용자**: skills 페이지에서 본 Top skills 와 overview 카드의 Top skills 가 동일하다고 신뢰하고 싶다 (지표 일관성).
- **조직 OWNER**: 조직의 실제 Skill 사용 (Skill tool 호출 + slash command) 을 한눈에 빈도순으로 파악하고 싶다.
- **플랫폼 운영자**: overview 와 skills 페이지의 정의 불일치로 인한 사용자 문의·오해를 줄이고 싶다. 정의 변경 시 캐시된 옛 정의 row 가 사용자에게 노출되지 않기를 원한다.
- **시스템 (rollup 캐시)**: lazy compute-on-read 모델을 유지하면서 정의 변경 시 자동으로 stale 판정이 이루어지길 원한다.

## 사전조건

- P1. 주 행위자가 orgSlug 의 멤버로 인증된 세션을 가진다 (`resolveOrgAccess` 통과).
- P2. 주 행위자가 멤버인 project 가 최소 1개 이상 있다 (없으면 `resolveOrgScopedProjectIds` 가 빈 배열을 반환해 카드가 빈 상태).
- P3. 해당 orgSlug 에 조회 기간 (from~to) 동안 최소 한 건 이상의 Skill tool 호출 (`events.is_skill_call=true`) 또는 사용자 slash command (`messages.role='HUMAN'` 의 `<command-name>/…</command-name>` 매칭) 이력이 존재한다 (없으면 빈 카드가 정상).

## 트리거

- T1. 사용자가 `/dashboard/<orgSlug>/overview` 페이지에 진입한다.
- T2. 사용자가 overview 페이지에서 날짜 범위 (`from` / `to`) 또는 `projectId` 필터를 변경해 재페치를 유발한다.

## 성공 보장 (Postconditions)

- G1. overview 의 "Skill별 호출 빈도" 카드는 (orgSlug, from, to, projectId) 가 동일한 skills 페이지 (UC-SESS-002) 의 Top skills 와 **skillName·callCount·정렬 순서까지 완전 일치** 한다 (동일 N 으로 잘랐을 때).
- G2. slash command 만 입력된 org/기간에서도 카드가 비어 있지 않다 (UNION 정의로 합산됨 — ADR-032).
- G3. `events.is_skill_call=true` 만 있던 org/기간의 카운트는 옛 정의 대비 회귀하지 않는다 (UNION 이므로 기존 케이스는 부분집합으로 보존).
- G4. `daily_project_stats.skill_counts` 의 캐시 row 가 `SKILL_COUNTS_INVALIDATION_AT` 보다 옛날 (`computed_at < threshold`) 이면 응답에 반영되지 않고 자연 재계산이 일어나, 사용자 화면은 항상 새 UNION 정의 결과를 본다 (ADR-034 lazy 가드).

## 최소 보장

- M1. 비멤버 / 미인증 사용자가 카드 데이터를 조회하면 기존 권한 가드가 401/403 을 반환하고, 어떤 raw 카운트도 노출되지 않는다.
- M2. rollup 빌더 또는 보조 sweep 스크립트 도중 실패해도 `daily_project_stats` 의 다른 컬럼 (`session_count`, `usage_totals`, `user_stats` 등) 과 다른 날짜의 row 는 손상되지 않는다 (날짜·project 단위 재시도 가능).
- M3. 옛 정의 row 가 캐시에 남아 있는 동안에도 사용자에게는 새 정의 결과만 노출된다 (lazy 가드가 stale 판정).

## 주 성공 시나리오

1. (User · UI) `/dashboard/<orgSlug>/overview` 페이지로 진입하거나 날짜/`projectId` 필터를 변경한다.
2. (System · API) `GET /api/orgs/{orgSlug}/dashboard/overview?from&to&projectId` 가 호출되어 `resolveOrgAccess` 권한 검사를 통과한 뒤 `resolveOrgScopedProjectIds` 로 허용 projectIds 를 결정한다.
3. (System · DB) `getDailyRollups(projectIds, from, to)` 가 `daily_project_stats` 에서 (projectIds, date BETWEEN from AND to) row 들을 조회하고, `row.computedAt < SKILL_COUNTS_INVALIDATION_AT` 인 row 는 `cachedResults` 가 아닌 `missingDays` 로 분류해 `computeDailyRollup` 으로 자연 재계산 + upsert 한다. 재계산 시 `aggregateSkillCountsForRange(projectIds, dayStart, nextDayStart)` 가 UNION 정의 (`events.is_skill_call=true` ∪ `messages` slash command, events anti-join) 로 `skill_counts` 를 산출한다.
4. (System · API) `aggregateSummary(rollups, { topSkillsN: 10 })` 가 모든 row 의 `skillCounts` 를 합산하고 `(callCount DESC, skillName ASC)` deterministic 정렬로 Top 10 을 잘라 `summary.topSkills = [{ skillName, callCount }, …]` 에 담아 200 으로 반환한다.
5. (System · UI) `SkillFrequencyChart` 가 응답을 받아 카드에 막대그래프로 렌더링한다. 같은 (orgSlug, from, to, projectId) 의 skills 페이지 (UC-SESS-002) Top 과 skillName·callCount·정렬이 동일하다.

## 확장 (Extensions)

- 2a. 권한 실패 (orgSlug 비멤버 또는 미인증):
  - 2a.1. (System · API) `requireAuth` / `resolveOrgAccess` 가 401 또는 403 을 반환한다.
  - 2a.2. (System · UI) overview 페이지가 카드 영역을 렌더하지 않고 어떤 raw 카운트도 노출하지 않는다 (M1 유지).
  - → 대체 종료.
- 2b. 해당 기간/projectId 의 `daily_project_stats` row 가 한 건도 없고 재계산 결과도 빈 경우:
  - 2b.1. (System · API) `summary.topSkills` 가 빈 배열로 직렬화된다.
  - 2b.2. (System · UI) 카드가 기존 empty state ("No skill data yet") 를 표시한다 (P3 미충족 케이스의 정상 동작).
  - → 대체 종료.
- 3a. 조회 기간의 모든 day 의 `daily_project_stats` row 가 `computedAt >= SKILL_COUNTS_INVALIDATION_AT` (fresh):
  - 3a.1. (System · DB) 모든 row 가 `cachedResults` 로 분류되어 재계산 없이 즉시 응답한다.
  - → 주 시나리오 4 단계로 복귀.
- 3b. 조회 기간 중 일부 day 가 stale 이고 일부가 fresh:
  - 3b.1. (System · DB) stale day 들만 `computeDailyRollup` 으로 재계산 + upsert, fresh day 는 그대로 사용. 재계산 후 모두 합쳐 합산한다.
  - → 주 시나리오 4 단계로 복귀.
- 3c. 재계산 도중 단일 day 의 upsert 가 실패 (DB 오류 등):
  - 3c.1. (System · DB) 다른 day 들의 row 는 손상되지 않는다 (M2). 실패한 day 는 다음 요청에서 다시 재계산 대상이 된다.
  - 3c.2. (System · API) 호출자가 받은 에러를 그대로 5xx 로 응답하거나, 부분 결과가 있다면 그대로 응답한다 (구현 결정).
  - → 대체 종료 (사용자가 다시 진입하면 주 시나리오로 재진입).

## 기술/데이터 변형

- V1. skill 호출 정의의 단일 출처는 `skillCallRowsRelation(projectIds, fromInclusive, toExclusive)` Prisma.Sql relation expression 이다 (ADR-033). overview / skills route / daily-rollup 빌더가 같은 fragment 를 자기 CTE 에 임베드해 사용한다.
- V2. 시간 경계는 모든 호출자에서 half-open `[fromInclusive, toExclusive)` 로 통일한다. `parseDateRange` 의 inclusive `to` (`23:59:59.999`) 는 caller 가 `toExclusive = new Date(to.getTime() + 1)` 로 변환해 helper 에 전달한다.
- V3. Top-N tie-break 정렬은 `(callCount DESC, skillName ASC)` 로 양쪽 화면 모두 deterministic. JS 쪽은 `localeCompare`, SQL 쪽은 `ORDER BY skill_name ASC` (collation 통일은 follow-up 후보).
- V4. Per-card N — `aggregateSummary(rollups, { topSkillsN: 10 })` 는 overview 전용. `topAgentsN` 은 기본 5 유지 (Negative Space — Top Agents 카드 회귀 없음).

## 참고

- ADR-032 (dashboard skill 집계 정의 통일 — UNION).
- ADR-033 (`skillCallRowsRelation` Prisma.Sql relation helper — 단일 출처).
- ADR-034 (`INVALIDATION_AT` lazy 가드 + 보조 oneshot sweep — 캐시 무효화 패턴).
- `packages/web/src/lib/server/skill-aggregation.ts` — `skillCallRowsRelation`, `aggregateSkillCountsForRange`.
- `packages/web/src/lib/server/daily-rollup.ts` — `computeDailyRollup`, `getDailyRollups` (stale 가드), `aggregateSummary` overload, `SKILL_COUNTS_INVALIDATION_AT`.
- `packages/web/src/app/api/orgs/[orgSlug]/dashboard/overview/route.ts` — overview 응답 경로.
- `packages/web/src/app/api/orgs/[orgSlug]/dashboard/skills/route.ts` — skills route (동일 helper 재사용 — UC-SESS-002).
- `packages/web/src/components/dashboard/skill-frequency-chart.tsx` — 카드 렌더링 및 empty state.
- `packages/web/scripts/invalidate-skill-counts.ts` — 보조 sweep 스크립트 (dry-run 기본, `--execute` 시 UPDATE).
- `docs/data-schema.md` — `daily_project_stats`, `events`, `messages` 스키마.
