---
id: UC-SESS-002
name: skill 별 project 분포를 본다
level: user-goal
scope: 웹 대시보드 (`/dashboard/[orgSlug]/skills`) + 백엔드 API (`/api/orgs/[orgSlug]/dashboard/skills`)
primary_actor: org 의 멤버 사용자 (OWNER/ADMIN/MEMBER 동일 동작)
status: active
includes: []
related: [UC-PROJ-001]
e2e: []
coverage_status: pending
sources:
  - docs/tasks/2026-05-14-skills-project-breakdown/01-clarify.md
  - docs/tasks/2026-05-14-skills-project-breakdown/03-plan.md
last_reviewed: 2026-05-15
---

## 이해관계자와 관심사

- **org 멤버 사용자**: 어떤 skill 이 우리 org 안에서 어느 project 들에 퍼져 있는지 한 화면에서 비교하고 싶다.
- **org OWNER/ADMIN**: 운영 관점에서 "특정 project 가 어떤 skill 에 토큰을 많이 쓰는가" 를 파악해 비용·사용 한도 의사결정에 쓰고 싶다.
- **다른 project 의 멤버가 아닌 사용자**: 자신이 멤버가 아닌 project 의 이름·사용량이 노출되지 않기를 원한다.
- **플랫폼 (시스템)**: 응답 페이로드와 SQL 비용이 통제되기를 원한다 (Top 5 + 추가 카운트 형태로 상한 보장).

## 사전조건

- P1. 사용자가 해당 org 에 접근 권한을 가진다 (`resolveOrgAccess` 통과).
- P2. 사용자가 멤버인 project 가 최소 1개 이상 있다 (없으면 `resolveOrgScopedProjectIds` 가 빈 배열을 반환해 skills 자체가 비어있다).
- P3. `events.skill_name` / `events.project_id` 또는 `messages` 의 slash command 패턴이 일부 row 에 채워져 있다.

## 트리거

- T1. 사용자가 `/dashboard/[orgSlug]/skills` 페이지를 연다.
- T2. 사용자가 같은 페이지에서 `from` / `to` / `projectId` 쿼리를 변경해 재페치를 유발한다.

## 성공 보장 (Postconditions)

- G1. 테이블의 각 skill 행에 "Projects" 셀이 표시되고, 셀에는 사용자가 접근 가능한 project 중 invocations 내림차순 Top 5 의 이름이 있다.
- G2. project 수가 6 이상일 때 `(+N more)` 접미사가 정확한 수(`additionalProjectCount`) 로 붙는다.
- G3. 호버/포커스 시 팝오버에 Top 5 분포(invocations + lastUsedAt) 가 나타나고, `additionalProjectCount > 0` 이면 `+N more projects` 안내가 추가로 보인다.
- G4. "Projects" 셀에 보이는 invocations 합 ≤ 같은 행 "Invocations" 컬럼 값 (권한 필터 일관성).

## 최소 보장

- M1. 응답 실패 시 기존 컬럼(skill name, invocations, sessions, users, median duration, last used) 은 정상 표시되거나 전체 에러 UI 가 표시되며, 부분 손상 상태로 머무르지 않는다.
- M2. 권한 없는 project 의 이름·사용량은 어떤 경로로도 (셀, 팝오버, API 페이로드) 노출되지 않는다.
- M3. URL 의 `projectId` 가 잘못된 값/접근 불가 값일 때, 분포 렌더링이 깨지지 않고 `resolveOrgScopedProjectIds` 의 기존 처리 결과를 그대로 따른다.

## 주 성공 시나리오

1. (User · UI) `/dashboard/[orgSlug]/skills` 페이지를 연다.
2. (System · API) `GET /api/orgs/[orgSlug]/dashboard/skills?from=&to=&projectId=` 가 호출되고, `resolveOrgScopedProjectIds` 의 결과로 허용 projectIds 가 결정된다.
3. (System · DB) skill × project 분포를 산출한다 — 각 skill 당 `(projectId, projectName, invocations, lastUsedAt)` 을 invocations DESC, projectName ASC, projectId ASC 로 정렬해 Top 5 를 자르고, 같은 skill 의 distinct project 총수를 함께 센다.
4. (System · API) `200 { skills: SkillStat[] }` 를 반환한다. 각 `SkillStat` 에 `projects: Array<{ projectId, projectName, invocations, lastUsedAt }>` (≤ 5) 와 `additionalProjectCount: number` (≥ 0) 가 포함된다.
5. (System · UI) "All skills" 테이블이 "Users" 와 "Median duration" 컬럼 사이에 "Projects" 컬럼을 포함해 렌더된다. 각 셀에는 Top 5 project name 이 `, ` 로 join 되고 `additionalProjectCount > 0` 이면 `(+N more)` 트리거가 sibling 으로 붙는다.
6. (User · UI) "Projects" 셀의 project name 또는 `(+N more)` 트리거에 마우스를 올리거나 키보드 포커스를 둔다.
7. (System · UI) base-ui Popover 가 열려 Top 5 분포(project name + invocations 막대 + lastUsedAt 상대 시간) 를 표시하고, `additionalProjectCount > 0` 이면 푸터에 `+N more projects` 안내를 보여준다.

## 확장 (Extensions)

- 2a. URL 에 `?projectId=<X>` 가 이미 있고 X 가 접근 가능 project →
  - 2a.1. (System · API) `resolveOrgScopedProjectIds` 가 `[X]` 단일 배열을 반환한다.
  - 2a.2. (System · DB) 각 skill 의 분포가 항상 1개 project (X) 로만 산출된다 (`projects.length === 1`, `additionalProjectCount === 0`).
  - 2a.3. (System · UI) "Projects" 셀이 X 의 이름만 표시되며 `aria-disabled="true"` + `opacity-60 cursor-default` 로 비활성. 클릭/호버 인터랙션은 동작하지 않는다.
  - → 대체 종료 (사용자가 다시 projectId 를 비우면 본 UC 의 주 시나리오로 재진입).
- 3a. 사용자가 접근 가능한 project 가 0개 →
  - 3a.1. (System · API) `200 { skills: [] }` 를 반환한다.
  - 3a.2. (System · UI) 페이지가 빈 상태 카드("아직 Skill 호출이 없습니다") 를 노출하고 테이블 자체가 렌더되지 않는다.
  - → 대체 종료.
- 5a. 특정 skill 의 project 수가 0 (데이터 오염, 이론상 케이스) →
  - 5a.1. (System · UI) 해당 행의 "Projects" 셀은 `<span class="text-muted-foreground">—</span>` 로 표시되고 팝오버 트리거를 렌더하지 않는다.
  - → 주 시나리오 6 단계 건너뛰고 다음 행으로 진행.
- 6a. 사용자가 셀 또는 팝오버 안의 project name 을 클릭/탭한다 →
  - 6a.1. (User · UI) project name 버튼 (`<button aria-label="Filter skills by project <name>">`) 을 클릭한다.
  - 6a.2. (System · UI) `useRouter` + `useSearchParams` 로 현재 쿼리에서 `projectId` 만 `<id>` 로 set 하고 `from` / `to` 등은 보존한 채 `router.push` 로 URL 을 교체한다 (페이지 reload 없음).
  - 6a.3. (System · UI) `useDashboardSkills` 의 쿼리 키 변경으로 자동 재페치가 일어나 확장 2a 와 동일한 상태로 진입한다.
  - → 주 시나리오 2 단계로 복귀 (재페치된 데이터로).
- 2b. API 가 실패 (5xx, 네트워크 오류) →
  - 2b.1. (System · UI) skills 테이블 전체 영역에 에러 Alert + 재시도 버튼이 표시되며, 부분 컬럼만 렌더되지 않는다 (M1).
  - → 대체 종료.

## 기술/데이터 변형

- V1. Top 5 결정의 tiebreaker 는 `(invocations DESC, project_name ASC, project_id ASC)` 로 결정적이며 새로고침 후에도 순서가 변하지 않는다 (Decision-2 / ADR-026).
- V2. `lastUsedAt` 은 SQL 측에서 `to_char(... AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')` 로 ISO8601 UTC 문자열로 변환되어 응답에 실린다.

## 참고

- `docs/data-schema.md` — `events.project_id`, `claude_sessions.project_id`, `projects.org_id` 컬럼 정의 (분포 산출의 원천).
- `docs/adr.md` ADR-025 (window function Top-N), ADR-026 (정렬 tiebreaker 표준), ADR-027 (base-ui Popover, click/focus 기본 + hover 보강), ADR-028 (CSS truncate), ADR-029 (Top-N + `additional<X>Count` 서버 계산), ADR-030 (변경 전/후 10회 median 비교), ADR-031 (`json_agg(... ORDER BY ...) FILTER` + ISO8601 `to_char`).
- `packages/web/src/app/api/orgs/[orgSlug]/dashboard/skills/route.ts` — `all_skill_calls` / `skill_project_aggregates` / `skill_project_ranked` / `skill_project_breakdown` CTE.
- `packages/web/src/lib/server/dashboard-row-mapping.ts` — `parseProjectsJson` + `additionalProjectCount` 계산.
- `packages/web/src/components/dashboard/skill-projects-cell.tsx` — 셀 UI + Popover 트리거.
- `packages/web/src/components/ui/popover.tsx` — base-ui Popover wrapper.
- `packages/shared/src/types/dashboard.ts` — `SkillStat.projects`, `additionalProjectCount`, `SkillProjectEntry`.
