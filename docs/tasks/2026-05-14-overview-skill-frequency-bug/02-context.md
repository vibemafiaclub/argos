# Context — 2026-05-14-overview-skill-frequency-bug

## 관련 코드 위치

| # | path | lines | 역할 | 변경 가능성 |
|---|------|-------|------|-------------|
| 1 | packages/web/src/lib/server/daily-rollup.ts | 150-159 | `db.event.groupBy` 로 `isSkillCall=true` 만 카운트하는 **버그의 원천**. UNION 정의로 확장할 1차 후보 (V1a). | 수정 |
| 2 | packages/web/src/lib/server/daily-rollup.ts | 108-298 | `computeDailyRollup(projectId, date)` 본체. 새 정의를 어디에 끼울지 결정. | 수정 |
| 3 | packages/web/src/lib/server/daily-rollup.ts | 255-258, 293, 543-594 | `skillCounts` 직렬화(`Record<string, number>`) + `aggregateSummary`의 `topSkills` Top-N 정렬 (현재 `topN=5`). M1 비교 시 N 정렬·tie-break 동치성 검토 지점. | 참조 |
| 4 | packages/web/src/lib/server/daily-rollup.ts | 463-525 | `getDailyRollups`: 과거 날짜는 `daily_project_stats` 캐시→없으면 inline compute+upsert, 오늘은 30초 메모리 캐시만. **별도 cron 없음 — "rollup 빌더 트리거" = overview/users/reports API 호출 그 자체**. 백필도 동일 함수 호출로 가능. | 참조 |
| 5 | packages/web/src/app/api/orgs/[orgSlug]/dashboard/skills/route.ts | 41-122 | UNION 정의 SQL **단일 출처**. `event_skill_calls` (events.is_skill_call=true, L42-54) ∪ `message_slash_calls` (regex `<command-message>…</command-message>\s*<command-name>/?([^<\s]+)</command-name>`, L55-80, events 중복 제거 anti-join 포함). 동일 정의를 rollup 또는 overview로 옮겨야 함. | 참조 / 수정 (helper 추출 시) |
| 6 | packages/web/src/app/api/orgs/[orgSlug]/dashboard/overview/route.ts | 41-56 | `getDailyRollupsForProjects` → `aggregateSummary(rollups, 5)` → `summary.topSkills` 직렬화. V1b 합성 경로 채택 시 여기서 messages-slash 실시간 합산을 수행. | 수정 (V1b) / 참조 (V1a) |
| 7 | packages/web/prisma/schema.prisma | 194-225 | `DailyProjectStat` 모델. `skillCounts Json @default("{}")` 컬럼 (`{ skillName: count, ... }`). 스키마 변경 불필요 — 정의만 바뀜. | 참조 |
| 8 | packages/web/prisma/schema.prisma | 267-287 | `Event` 모델의 `isSkillCall`, `skillName`, `isSlashCommand` 컬럼. `is_slash_command=true` AND `is_skill_call=true` 이벤트는 messages 분기에서 anti-join 으로 제외되는 케이스 (skills route L72-79). | 참조 |
| 9 | packages/web/src/components/dashboard/skill-frequency-chart.tsx | 37-50 | `data.slice(0,10)` Top 10 + `chartData.length===0` empty state. UI 정의가 N=10 이므로 M1 비교 N도 10. | 참조 (카피 조정 시 수정) |
| 10 | packages/web/src/app/dashboard/[orgSlug]/overview/page.tsx | 141, 179 | `summary.topSkills` → `<SkillFrequencyChart data={topSkills} />` 바인딩. | 참조 |
| 11 | packages/shared/src/types/dashboard.ts | 16-28 | `DashboardSummary.topSkills: Array<{ skillName; callCount }>` — 타입 변경 불필요 (구조 보존). | 참조 |
| 12 | packages/web/src/lib/server/weekly-report.ts | 376-377, 454-478 | 주간 리포트도 `getDailyRollupsForProjects` + `r.skillCounts` 사용. **rollup 정의가 바뀌면 같이 영향받음** (의도된 일관성 효과). | 참조 (회귀 영향) |
| 13 | packages/web/src/app/api/orgs/[orgSlug]/dashboard/users/route.ts | 12-14, 60 | overview와 동일하게 `getDailyRollupsForProjects` 호출. rollup 정의 변경 시 동일 캐시 행을 공유함 (skillCounts 만 다름). | 참조 |
| 14 | packages/web/src/lib/server/dashboard-row-mapping.ts | 전체 | `mapSkillRow` (skills route 매핑). UNION SQL 을 helper 로 빼는 경우 인접 위치 후보. | 신규 인접 (helper 추출 시) |
| 15 | packages/web/src/lib/server/daily-rollup.ts | 219, 235 | `e_agg` 의 `COUNT(*) FILTER (WHERE is_skill_call)` — `userStats.skillCalls` 도 동일 비대칭을 가짐. 이번 task 범위는 **`skillCounts` 만** (사용자 컬럼은 비범위 — negative space 참조). | 참조 (의도적으로 안 건드림) |

## 관련 기존 ADR

| ADR | 제목 | 이번 task와의 관계 |
|-----|------|---------------------|
| (없음) | — | `docs/adr.md` 1-291 전수 확인. skill 집계 / daily rollup / dashboard 데이터 소스 정의에 관한 ADR 항목 없음. ADR-012(Message 모델 저장)가 messages-slash 정규식 매칭의 데이터 소스를 제공하지만 집계 정의 결정과는 무관. 본 task가 의존하는 선행 결정 없음. |

## Negative Space (만지지 말 것)

- `packages/web/src/lib/server/daily-rollup.ts` L160-169 (`agentGroups`), L170-179 (`modelGroups`), L122-131 (sessionCount/turnCount), L132-149 (usageTotals) — 다른 카드 (Top agents, Token usage by model, Sessions, Tokens) 의 집계 로직. 본 task 범위 외 (clarify 비범위 — "별도 task").
- `packages/web/src/lib/server/daily-rollup.ts` L194-243 `userStatsRaw` CTE 의 `e_agg.skill_calls` — 사용자별 skill calls 카운터에도 동일한 비대칭이 존재하지만 본 task에서는 손대지 않는다 (clarify 비범위, 별도 task로 이관 권장).
- `packages/web/src/app/api/orgs/[orgSlug]/dashboard/skills/route.ts` 의 **정의 자체** — clarify Q4(a) 로 "skills 페이지 쪽이 진실" 확정. 좁히는 방향(Q4(a) 폐기안의 반대)은 금지.
- `packages/web/src/app/api/orgs/[orgSlug]/dashboard/skills/route.ts` L95-109 `skill_durations` CTE (median duration) — clarify 비범위 (별도 task).
- `packages/web/src/components/dashboard/skill-frequency-chart.tsx` 의 차트 UI/축/툴팁 — 카피·툴팁만 정합성 검토 가능 (clarify SHOULD-S3). 차트 모양·empty state 메시지는 손대지 않는다.
- 인증/권한 (`auth-helper.ts`, `rbac.ts`, `dashboard-route-helper.ts`) — 기존 가드 그대로 통과 (M4).
- `packages/cli`, `packages/shared` 다른 도메인, `packages/web/src/app/api/auth/*`, settings 경로 — 무관.

## 폴더 구조 메모

- `packages/web/src/app/api/orgs/[orgSlug]/dashboard/*/route.ts` — org-scoped dashboard API (overview/skills/users/agents/sessions). 본 task의 두 라우트가 여기서 마주봄.
- `packages/web/src/lib/server/` — 서버 전용 helper. `daily-rollup.ts` (rollup 빌더+캐시+aggregate), `dashboard-row-mapping.ts` (raw row→DTO), `dashboard-route-helper.ts` (orgSlug→projectIds 게이트), `dashboard.ts` (parseDateRange). UNION 정의를 공통 helper로 추출하려면 `dashboard-row-mapping.ts` 또는 신규 `skill-aggregation.ts` 가 자연스러운 위치.
- `packages/web/prisma/schema.prisma` — DB 스키마. `DailyProjectStat`(L194-225)·`Event`(L267-287)·`Message`·`ClaudeSession` 모두 본 task가 읽는 테이블.
- `packages/web/src/components/dashboard/` — 클라이언트 차트 컴포넌트. `skill-frequency-chart.tsx` 가 overview/reports 양쪽에서 사용됨.
- `packages/shared/src/types/dashboard.ts` — 공용 DTO 타입. 구조 변경 없으면 안 건드림.

## 추가 컨텍스트

- **Rollup 트리거 채널**: 별도 cron / Vercel scheduler 없음 (`vercel.json`/`turbo.json`/`package.json` 모두 cron 설정 없음). `getDailyRollups` 가 호출 시 missing day를 inline 계산해 `daily_project_stats` 에 upsert한다. **즉 백필 = 모든 (projectId, date) 의 row 를 삭제한 뒤 overview/users/reports 가 호출되면 자연 재계산되거나, 명시적으로 `computeDailyRollup` + `upsertRollup` 을 호출하는 oneshot 스크립트** 가 선택지. `packages/web/scripts/` 폴더는 현재 부재 — 신규 디렉토리 가능 (루트 `scripts/` 는 docs/server 용 python).
- **Messages-slash 정규식** (skills route L62-67): `<command-message>[^<]*</command-message>[[:space:]]*<command-name>/?([^<[:space:]]+)</command-name>` — 캡쳐 그룹 1이 skillName. `m.role = 'HUMAN'` AND messages 의 anti-join (events 에 `is_skill_call=true AND is_slash_command=true AND skill_name=match` 이 없을 때만 카운트) 까지 그대로 옮겨야 동치성 (M1) 성립.
- **Top-N 기본값**: overview API 가 `aggregateSummary(rollups, 5)` 로 호출 (overview/route.ts L43) 하므로 현재 `topSkills` 길이는 최대 5. 한편 차트 컴포넌트는 `slice(0, 10)`. skills route 는 `LIMIT 50`. **M1 의 N 정의는 차트 표시 기준 10** — overview API 의 `topN` 인자도 10 으로 늘리거나 cap을 옮길지 plan 단계에서 결정 필요.
- **백필 비용 추정 필요**: `daily_project_stats` row 수 = projects × days. 본 task의 SHOULD-S1 백필 채택 여부는 plan 단계 cost 측정 후 결정 (clarify 명시).
- **테스트 인프라**: vitest 기반, `*.test.ts` 가 src 옆에 위치 (`daily-rollup.ts` 옆 신규 `daily-rollup.test.ts` 또는 `skill-aggregation.test.ts` 가 자연스러움). 기존 test 예시: `rbac.test.ts`, `events.test.ts`, `dashboard-row-mapping.test.ts`.
