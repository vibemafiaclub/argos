# Clarify — 2026-05-14-skills-project-breakdown

## 요구사항 한 줄 요약

org 단위 `/dashboard/[orgSlug]/skills` 페이지의 "All skills" 테이블에 각 skill 이 어떤 project 들에서 얼마나 호출되었는지 분포를 노출하는 "Projects" 컬럼을 추가한다.

## 배경/동기

현재 skills 페이지는 `SkillStat[]` 만 보여줄 뿐, "이 skill 이 어떤 project 에서 쓰였는가" 의 분포 정보가 어디에도 없다. URL 에 `?projectId=` 가 있으면 *필터* 만 적용될 뿐 비교가 안 된다. 데이터 측면에서는 `events.project_id`, `claude_sessions.project_id` 가 이미 있어 skill × project 분포는 기존 CTE 에 group by 한 단계만 더하면 산출 가능하다. UX 가 추가되면 "어느 project 가 어떤 skill 을 많이 쓰는가" 라는 운영 관점의 핵심 질문을 한 화면에서 답할 수 있다.

## 명시적 범위 (In scope)

- org 단위 skills 페이지(`/dashboard/[orgSlug]/skills`) 의 "All skills" 테이블에 **"Projects" 컬럼 추가**.
- 셀 요약: invocations 내림차순 Top 5 project 이름을 텍스트로 (예: `argos-web, argos-cli (+2 more)`).
- 호버 시 상세 팝오버: 각 project 별 invocations 누적 막대(또는 리스트) + last used 표시.
- 셀 안의 project 이름 클릭 시 같은 skills 페이지에 `?projectId=<id>` 필터를 적용한다 (페이지 이동 없이 쿼리 파라미터 교체 + 재페치).
- 권한: 기존 `resolveOrgScopedProjectIds` 결과로 한정 (사용자가 접근 가능한 project 만 분포에 포함).
- `?projectId=<X>` 가 이미 활성일 때: "Projects" 셀은 단일 project 로만 표시되며, 시각적으로 disabled (클릭 비활성). count = 1.
- API 응답 스키마 확장: `SkillStat` 에 `projects: Array<{ projectId, projectName, invocations, lastUsedAt }>` (Top 5) + `additionalProjectCount: number` 필드를 추가.

## 명시적 비범위 (Out of scope)

- skill 별 drill-down 페이지(`/skills/<skillName>`) 신설 — 별도 task.
- skill × project 매트릭스/히트맵 같은 별도 시각화 섹션.
- expandable row 형태의 UI.
- project overview 페이지로 이동하는 링크 동작 (대신 같은 페이지 내 필터링만).
- 멤버가 아닌 project 의 익명 버킷("Other (N projects)") 노출 — 권한 모델은 기존 그대로.
- OWNER/ADMIN 한정 추가 노출 정책.
- 사용자 화면에서 Top-N 한도(5) 조절 UI.
- skill 자체의 LIMIT 50 정책 변경.
- 시계열(시간대별 분포) 표현.

## 성공 기준

1. `/dashboard/[orgSlug]/skills` 의 "All skills" 테이블에 "Projects" 컬럼이 보이고, 각 skill 행 셀에는 invocations 내림차순 Top 5 project 이름이 표시된다. project 수가 5 를 초과하면 `(+N more)` 접미사가 붙는다.
2. "Projects" 셀 호버 시 풀 분포(접근 가능한 project 전체, invocations 누적 막대 또는 리스트 + lastUsedAt) 가 팝오버로 보인다.
3. 셀 안 project 이름 클릭 시 URL 의 `projectId` 가 해당 id 로 교체되고, 테이블이 그 project 로 필터된 skill 목록으로 갱신된다 (페이지 reload 없이).
4. `?projectId=<X>` 가 이미 URL 에 있는 상태에서는 "Projects" 셀이 단일 project 로 표시되며 클릭이 동작하지 않는다(disabled).
5. 접근 권한 없는 project 의 invocations 는 분포에 포함되지 않는다. 즉 셀에 보이는 invocations 합 ≤ 같은 행의 "Invocations" 컬럼 값.
6. API 응답 페이로드 증가가 skill 50 × project 5 = 최대 250 entry 수준으로 한정된다 (응답 시간 회귀 없음 — 기존 P95 의 +20% 이내).

## 유스케이스 (Cockburn 형식)

### UC-DRAFT-2026-05-14-skills-project-breakdown-1: skill 별 project 분포를 본다

> 도메인 후보: SESS (Claude 세션/이벤트 도메인의 분석 표면. 단, dashboard 표면이 별도 도메인으로 갈라지면 그쪽으로 이동 가능 — 카탈로그 승격 시 결정)
> 카탈로그 매핑 후보: 신규

- **범위 (Scope)**: Argos 웹 대시보드(`/dashboard/[orgSlug]/skills`) + 백엔드 API (`/api/orgs/[orgSlug]/dashboard/skills`).
- **수준 (Level)**: user-goal
- **주 행위자 (Primary Actor)**: org 의 멤버 사용자 (역할 무관, OWNER/ADMIN/MEMBER 동일 동작).
- **이해관계자와 관심사 (Stakeholders & Interests)**:
  - org 멤버 사용자: 어떤 skill 이 우리 org 안에서 어느 project 들에 퍼져 있는지 한 화면에서 비교하고 싶다.
  - org OWNER/ADMIN: 운영 관점에서 "특정 project 가 어떤 skill 에 토큰을 많이 쓰는가" 를 파악해 비용·사용 한도 의사결정에 쓰고 싶다.
  - 다른 project 의 멤버가 아닌 사용자: 자신이 멤버가 아닌 project 의 이름/사용량이 노출되지 않기를 원한다.
  - 시스템: 응답 페이로드와 SQL 비용이 통제되기를 원한다.
- **사전조건 (Preconditions)**:
  - 사용자는 해당 org 에 접근 권한이 있다 (`resolveOrgAccess` 통과).
  - 사용자가 멤버인 project 가 최소 1개 이상 있다 (없으면 `resolveOrgScopedProjectIds` 가 빈 배열을 반환해 skills 자체가 비어있음).
  - `events.skill_name`, `events.project_id` 가 일부 row 에 채워져 있다 (없으면 skill 목록이 비어 분포도 비어 있음).
- **성공 보장 (Success Guarantees / Postconditions)**:
  - G1. 테이블의 각 skill 행에 "Projects" 셀이 표시되고, 셀에는 사용자가 접근 가능한 project 중 invocations 내림차순 Top 5 의 이름이 있다.
  - G2. project 수가 6 이상일 때 `(+N more)` 접미사가 정확한 수로 붙는다 (`additionalProjectCount`).
  - G3. 호버 시 팝오버에 전체 분포(접근 가능한 project 만, invocations + lastUsedAt) 가 나타난다.
  - G4. "Projects" 셀에 보이는 invocations 합 ≤ 같은 행 "Invocations" 컬럼 값 (권한 필터 일관성).
- **최소 보장 (Minimal Guarantees)**:
  - M1. 응답 실패 시 기존 컬럼(skill name, invocations, sessions, users, median duration, last used) 은 정상 표시되거나, 전체 에러 UI 가 표시되며 부분 손상 상태로 머무르지 않는다.
  - M2. 권한 없는 project 의 이름·사용량은 어떤 경로로도(셀, 호버, API 페이로드) 노출되지 않는다.
  - M3. URL 의 `projectId` 가 잘못된 값/접근 불가 값일 때, 분포 렌더링 자체가 깨지지 않고 기존 `resolveOrgScopedProjectIds` 의 처리 결과를 그대로 따른다.
- **트리거 (Trigger)**: T1. 사용자가 `/dashboard/[orgSlug]/skills` 페이지를 연다 (또는 from/to/projectId 등 쿼리가 변경되어 재페치된다).
- **주 성공 시나리오 (Main Success Scenario)**:
  1. (User · UI) `/dashboard/[orgSlug]/skills` 페이지를 연다.
  2. (System · API) `GET /api/orgs/[orgSlug]/dashboard/skills?from=&to=&projectId=` 가 호출된다.
  3. (System · API) `resolveOrgScopedProjectIds` 로 사용자가 접근 가능한 projectIds 를 결정한다.
  4. (System · DB) skill × project group by CTE 로 각 skill 당 invocations 내림차순 Top 5 project + 총 project 개수를 산출한다 (`projects: [{projectId, projectName, invocations, lastUsedAt}]`, `additionalProjectCount`).
  5. (System · API) `200` 으로 `{ skills: SkillStat[] }` 를 반환한다. 각 `SkillStat` 에는 새 필드 `projects`, `additionalProjectCount` 가 포함된다.
  6. (System · UI) "All skills" 테이블이 "Projects" 컬럼과 함께 렌더된다. 각 셀에는 Top 5 project 이름이 쉼표 구분 + `(+N more)` 접미사.
  7. (User · UI) "Projects" 셀에 마우스를 올린다.
  8. (System · UI) 팝오버가 열려 풀 분포 리스트(혹은 누적 막대) 를 invocations 내림차순으로 표시한다.
- **확장 (Extensions)**:
  - 2a. URL 에 `?projectId=<X>` 가 이미 있고 X 가 접근 가능 project:
    - 2a.1. (System · API) `resolveOrgScopedProjectIds` 가 `[X]` 단일 배열을 반환한다.
    - 2a.2. (System · DB) 각 skill 의 분포는 항상 1개 project (X) 로만 산출된다 (`additionalProjectCount = 0`).
    - 2a.3. (System · UI) "Projects" 셀은 X 의 이름만 표시되며 disabled 스타일(클릭 비활성).
    - → 주 시나리오 6 단계로 복귀하되 클릭/호버 인터랙션은 비활성.
  - 3a. 사용자가 접근 가능한 project 가 0개:
    - 3a.1. (System · API) `{ skills: [] }` 반환 (기존 동작).
    - 3a.2. (System · UI) 빈 상태 화면. "Projects" 컬럼 자체가 렌더되지 않거나 빈 헤더로 표시.
    - → 대체 종료.
  - 6a. 특정 skill 의 project 수가 0 (이론상 발생 시 — 데이터 오염):
    - 6a.1. (System · UI) 그 행의 "Projects" 셀은 비어 있거나 `-` 로 표시.
    - → 주 시나리오 7 단계로 복귀.
  - 8a. 팝오버 안의 project 이름을 클릭:
    - 8a.1. (User · UI) project 이름 링크 클릭.
    - 8a.2. (System · UI) 라우터로 현재 경로 + `?projectId=<id>` 로 쿼리 교체 (페이지 reload 없이).
    - 8a.3. (System · UI) 같은 페이지가 `useDashboardSkills` 의 쿼리 키 변경으로 자동 재페치되어 단일 project 필터 결과를 렌더 (확장 2a 와 동일한 상태로 진입).
    - → 주 시나리오 6 단계로 복귀 (재페치된 데이터로).
  - 2b. API 가 실패 (5xx, 네트워크 오류):
    - 2b.1. (System · UI) skills 테이블 전체에 에러 UI 가 표시되며, 부분 컬럼만 렌더하지 않는다 (M1).
    - → 대체 종료.

### 메모: UC 개수 정당화

이 task 는 단일 user-goal ("skill 별 project 분포를 본다") 로 환원된다. 셀 클릭에 의한 필터링은 별개 user-goal 이 아니라 본 UC 의 확장(8a) 으로 모델링 — 이미 기존 skills 페이지의 projectId 필터 동작을 재사용하는 인터랙션이기 때문. UC 1 개로 충분.

## 가정 (Assumptions)

- A1. 응답 스키마 확장은 `packages/web/src/app/api/orgs/[orgSlug]/dashboard/skills/route.ts` 의 `SkillStat` / `mapSkillRow` 를 수정하는 형태로 처리한다.
- A2. project 이름은 `projects.name` 컬럼에서 가져온다 (slug 가 아니라 표시용 이름). 클릭 시 라우팅에 쓰는 식별자는 `projects.id`.
- A3. SQL 구현은 기존 CTE 에 `project_id, project_name` group by 한 단계를 추가하고, window function (`row_number() over (partition by skill order by invocations desc)`) 또는 LATERAL 로 Top 5 를 자른다. 총 project 수는 `count(distinct project_id)` 로 산출.
- A4. 호버 팝오버는 기존 dashboard 의 디자인 시스템 컴포넌트(Tooltip/Popover) 를 재사용한다.
- A5. 셀 안 텍스트의 라우팅은 클라이언트 측 Next.js router 사용 (전체 reload 없이 쿼리 교체).
- A6. `?projectId=<X>` 가 잘못된 id 이거나 접근 권한 없는 경우의 처리는 `resolveOrgScopedProjectIds` 의 기존 동작에 위임 — 본 task 가 변경하지 않는다.

## 미해결 위험 (Open risks)

- R1. 호버 팝오버 안의 project 이름 클릭 인터랙션(확장 8a) 이 명세상 자연스럽지만 라운드 1 의 Q3 가 명시적으로 셀 내 클릭만 다뤘다. 팝오버 내 클릭도 같은 동작으로 통일하는 것이 일관적이라 본 명세에 포함했으나, 디자인 단계에서 재확인 권장.
- R2. invocations 내림차순 Top 5 결정에서 동률이 발생할 때의 tiebreaker (예: project name asc, projectId asc) 가 미정. 구현 단계에서 결정 가능한 수준의 사소한 항목이므로 본 명세에서는 비결정으로 둔다.
- R3. 페이로드 크기 회귀 (성공 기준 6) 의 측정 기준 P95 baseline 이 현재 기록되어 있지 않다. evaluate 단계에서 실측 후 비교한다.

## 관련 기존 문서

- `packages/web/src/app/api/orgs/[orgSlug]/dashboard/skills/route.ts` — 기존 skills API. 새 컬럼/필드는 여기 CTE 와 `mapSkillRow` 에 추가.
- `resolveOrgScopedProjectIds` (auth/rbac 헬퍼) — 권한 필터의 단일 진실. 본 task 는 이 함수의 결과를 그대로 사용한다.
- `docs/usecases/README.md` — Cockburn UC 포맷·승격 규약. 본 task 종료 후 `new-task-usecase` 서브에이전트가 위 UC-DRAFT 를 정식 ID 로 승격한다.
- `docs/data-schema.md` — `events.project_id`, `claude_sessions.project_id` 컬럼 정의 (분포 산출의 원천).

## 메모 (메인 세션 참고)

- 라운드 1 답변으로 UC 의 모든 칸을 채울 수 있었다 — followup 추가 라운드 불필요.
- UC 개수는 1개. user-goal 단위로 적절히 묶였고 task 분할 신호 없음.
- 다음 단계: implement → evaluate 통과 후 `new-task-usecase` 호출. 도메인 prefix 후보는 `SESS` 가 가장 가깝지만, dashboard 표면 전용 도메인이 카탈로그에 신설되는 흐름이면 그쪽으로 배치할 수 있다 (승격 시 결정).
