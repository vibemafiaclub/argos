# Plan — 2026-05-14-skills-project-breakdown

## 개요

org-scoped `/dashboard/[orgSlug]/skills` 의 "All skills" 테이블에 skill 별 project 분포를 보여주는 "Projects" 컬럼을 추가한다. 백엔드는 기존 `skill_events` union CTE 를 (skill, project) 차원으로 확장해 **Top 5 project + 추가 개수(`additionalProjectCount`)** 를 산출하고, 프론트는 셀 텍스트 요약 + base-ui Popover 로 **"Top 5 분포 + `+N more projects` 잔여 안내"** + 같은 페이지 `?projectId=` 교체 클릭을 구현한다.

> 명세 정합 메모: clarify 라인 36 은 호버 시 "풀 분포(접근 가능한 project 전체)" 를 요구하지만, 동일 clarify 의 응답 스키마(A1/G2)·성공 기준 6 (50×5=250 entry 상한)·R3 (페이로드 회귀) 와 충돌한다. 본 plan 은 **응답 스키마 정의(Top 5 + count)** 를 단일 진실로 채택해 UI 도 동일하게 Top 5 + 잔여 카운트 라벨로 노출한다. 풀 분포 요구는 별도 drill-down task 로 넘긴다 (clarify 비범위의 "skill 별 drill-down 페이지" 와 정합). 이 결정은 Decision-9 에 기록.

## 아키텍처/접근 선택

- **SQL 형태**: (A) window function `ROW_NUMBER() OVER (PARTITION BY skill ORDER BY invocations DESC, ...)` 로 Top 5 자르기 vs (B) LATERAL join. → **A 채택**. 같은 union 결과를 단 한 번 group by 한 뒤 window 만 얹으면 되어 plan 노드 수가 적고 PG14+에서 안정적. LATERAL 은 skill 행 50 회 반복 sub-plan 이 필요.
- **응답 페이로드 모양**: `SkillStat.projects: Array<{projectId, projectName, invocations, lastUsedAt}>` (Top 5) + `additionalProjectCount: number`. clarify A1·G2 와 정확히 일치. 추가 distinct project 총합은 `additionalProjectCount = totalDistinctProjects - projects.length` 로 산출.
- **UI 팝오버 컴포넌트**: `@base-ui/react/popover` 사용 (이미 node_modules 에 sub-path 존재, HoverCard 는 base-ui 에 없음).
  - 확인된 API (`@base-ui/react/popover` 1.4): `Popover.Root`, `Popover.Trigger { openOnHover, delay, closeDelay }`, `Popover.Portal`, `Popover.Positioner`, `Popover.Popup`.
  - **기본 트리거 = click/focus**, 데스크탑 hover 도 `openOnHover` 로 추가. 모바일/터치는 click(tap) 으로 동일 동작. 키보드 사용자는 Tab focus → Enter/Space 로 열림. Escape 로 닫힘 (base-ui 기본).
  - UI primitive 래퍼를 `packages/web/src/components/ui/popover.tsx` 로 신규 추가.
- **셀 컴포넌트 위치**: `packages/web/src/components/dashboard/skill-projects-cell.tsx` 신규. page.tsx 본문은 컬럼/헤더만 추가하고 셀 본체는 이 컴포넌트에 위임.
- **클릭→쿼리 교체**: `sessions/page.tsx` 의 `setQuery` 패턴 재사용 — `useRouter` + `useSearchParams` + `usePathname` 으로 `params.set('projectId', id)` 후 `router.push`.

## Work Units

### WU-1: shared 타입 확장 (`SkillStat.projects`, `additionalProjectCount`)

- **수정/생성 파일**:
  - `packages/shared/src/types/dashboard.ts` (수정)
- **입력 계약**: 기존 `SkillStat` interface.
- **출력 계약**: `SkillStat` 에 다음 두 필드 추가
  - `projects: Array<{ projectId: string; projectName: string; invocations: number; lastUsedAt: string }>` — invocations 내림차순 Top 5 (5 이하). 0개일 수도 있음 (clarify 6a).
  - `additionalProjectCount: number` — Top 5 에 들지 못한 추가 project 수 (≥0).
  - JSDoc 으로 권한 필터 후 수치, lastUsedAt ISO string 명시.
- **의존**: 없음.
- **검증 방법**: `pnpm --filter @argos/shared build` (tsc), `pnpm --filter @argos/web typecheck` (소비 측 컴파일 통과 확인은 다른 WU 작업 후이지만 타입 자체는 standalone). type 만 추가이므로 lint/build 통과로 충분.
- **예상 LOC**: +12

### WU-2: `mapSkillRow` + `RawSkillRow` 확장 + 단위 테스트

- **수정/생성 파일**:
  - `packages/web/src/lib/server/dashboard-row-mapping.ts` (수정)
  - `packages/web/src/lib/server/dashboard-row-mapping.test.ts` (수정)
- **입력 계약**:
  - `RawSkillRow` 에 새 필드 추가:
    - `projects_json: unknown` — Postgres `json_agg(...)` 결과 (배열). null 가능 (skill 에 project 가 0개일 때).
    - `total_project_count: bigint` — 그 skill 의 distinct project 총수 (≥0).
  - `mapSkillRow(row)` 가 위 필드를 파싱.
- **출력 계약**:
  - `mapSkillRow` 가 반환하는 `SkillStat` 에 `projects`, `additionalProjectCount` 채움.
  - **책임 경계 (WU-3 와 분리)**:
    - SQL (WU-3) 가 non-null 보장: `projects_json` 은 항상 JSON array(`'[]'::json` 폴백), `total_project_count` 는 항상 number.
    - mapper (WU-2) 는 **방어 로직만**: 만일 그래도 null/non-array 가 오면 빈 배열 폴백 + 0 으로 처리 (M3 — 분포 깨지지 않음). 정상 경로에서 폴백 path 가 실행될 일은 없음을 테스트로 명시.
  - `additionalProjectCount = Math.max(0, Number(total_project_count) - projects.length)`.
  - 각 element 의 `lastUsedAt` 은 **SQL 측에서 ISO 문자열로 보장** (WU-3 가 `to_char(last_used_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')` 로 변환). mapper 는 string 그대로 통과. 만일의 경우(Date 객체) string 변환 폴백.
  - 타입 가드: 수동 (zod 미도입 — 의존성 증가 회피). `Array.isArray` + element 별 shape 체크(`projectId/projectName: string`, `invocations: number`, `lastUsedAt: string`).
- **의존**: WU-1 의 타입 (인터페이스 일치 확인용. 단 WU-1 의 인터페이스 텍스트만 합의되면 병렬 가능, 실제 import 는 컴파일 시점에 만남).
- **검증 방법**: `pnpm --filter @argos/web test packages/web/src/lib/server/dashboard-row-mapping.test.ts`. 신규 케이스:
  - projects_json=null → `projects: [], additionalProjectCount: 0`.
  - projects_json=[3개 entry], total_project_count=3 → `projects.length === 3, additionalProjectCount === 0`.
  - projects_json=[5개 entry], total_project_count=12 → `additionalProjectCount === 7`.
  - projects_json=[5개 entry], total_project_count=5 → `additionalProjectCount === 0`.
  - 잘못된 모양(객체가 아닌 string 배열 등) → 빈 배열 폴백, throw 하지 않음.
- **예상 LOC**: +60 (코드 30, 테스트 30)

### WU-3: skills route CTE 확장 + SQL 단위 검증

- **수정/생성 파일**:
  - `packages/web/src/app/api/orgs/[orgSlug]/dashboard/skills/route.ts` (수정)
- **입력 계약**: 기존 GET handler. `projectIds: string[]` 가 이미 계산되어 있음.
- **출력 계약**:
  - CTE 수정안 (확정):
    1. `event_skill_calls`, `message_slash_calls` 양쪽 모두 `project_id` 컬럼을 select 절에 추가.
       - `event_skill_calls`: `events.project_id AS project_id` (이미 WHERE 에 있음).
       - `message_slash_calls`: `s.project_id AS project_id` (claude_sessions 의 project_id 사용 — 추가 주의 1 일치).
    2. **`all_skill_calls` 를 독립 CTE 로 승격**: 기존 인라인 subquery (`skill_events` 내부의 union) 를 빼내어 `all_skill_calls AS (SELECT * FROM event_skill_calls UNION ALL SELECT * FROM message_slash_calls)` 로 재사용 가능한 CTE 로 둔다. `skill_events` 와 `skill_project_aggregates` 가 모두 이 CTE 를 참조 → union 중복 실행 회피.
    3. `skill_events` group by 는 그대로 `skill_name` 단일 키 — 기존 invocations/sessions/users/last_used 컬럼 회귀 없음. 단 base 는 `FROM all_skill_calls` 로 변경.
    4. 새 CTE `skill_project_breakdown` 추가:
       ```sql
       all_skill_calls AS (
         SELECT * FROM event_skill_calls
         UNION ALL
         SELECT * FROM message_slash_calls
       ),
       skill_project_aggregates AS (
         SELECT
           sc.skill_name,
           sc.project_id,
           p.name AS project_name,
           COUNT(*) AS invocations,
           MAX(sc.timestamp) AS last_used_at
         FROM all_skill_calls sc
         JOIN projects p
           ON p.id = sc.project_id
          AND p.org_id = ${access.org.id}                     -- 다중 가드 (org 격리)
         WHERE sc.project_id = ANY(${projectIds}::text[])     -- 다중 가드 (RBAC scope)
         GROUP BY sc.skill_name, sc.project_id, p.name
       ),
       skill_project_ranked AS (
         SELECT
           skill_name, project_id, project_name, invocations, last_used_at,
           ROW_NUMBER() OVER (
             PARTITION BY skill_name
             ORDER BY invocations DESC, project_name ASC, project_id ASC
           ) AS rn
         FROM skill_project_aggregates
       ),
       skill_project_breakdown AS (
         SELECT
           skill_name,
           COALESCE(
             json_agg(
               json_build_object(
                 'projectId',  project_id,
                 'projectName', project_name,
                 'invocations', invocations,
                 'lastUsedAt',  to_char(
                                  last_used_at AT TIME ZONE 'UTC',
                                  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                                )
               ) ORDER BY invocations DESC, project_name ASC, project_id ASC
             ) FILTER (WHERE rn <= 5),
             '[]'::json
           ) AS projects_json,
           COUNT(*) AS total_project_count
         FROM skill_project_ranked
         GROUP BY skill_name
       )
       ```
       - `to_char(... AT TIME ZONE 'UTC', ...)` 로 PG `timestamptz`→ISO8601 UTC 문자열 변환 (mapper 의 Date 가정 제거). milliseconds(`.MS`) 자리수는 JS `Date.toISOString()` 와 호환.
       - `json_agg(... ORDER BY ...) FILTER (WHERE ...)` 는 PG aggregate 표준 문법 (PG9.4+ 안정). Decision-10 에 명시.
       - `skill_events` 의 FROM 절도 기존 인라인 subquery 에서 `FROM all_skill_calls` 로 변경 (CTE 통합).
    5. 최종 SELECT 에 `LEFT JOIN skill_project_breakdown b USING (skill_name)` 추가, select 컬럼에 `COALESCE(b.projects_json, '[]'::json) AS projects_json, COALESCE(b.total_project_count, 0) AS total_project_count` (LEFT JOIN miss 대비 — non-null 보장).
  - 권한 재확인 (다중 가드, G4·M2):
    1. `resolveOrgScopedProjectIds` 가 이미 access 통과 set 반환.
    2. CTE base (event_skill_calls / message_slash_calls) 가 이미 `project_id = ANY(projectIds)` 필터.
    3. `skill_project_aggregates` 에서 `WHERE sc.project_id = ANY(projectIds)` 명시 (redundant 하지만 명시적 가드).
    4. `JOIN projects p ON ... AND p.org_id = ${access.org.id}` — projects 테이블의 org 격리 (orgId 컬럼 활용, schema.prisma 154-171).
  - `?projectId=X` 일 때 `projectIds = [X]` 이므로 각 skill 의 분포는 자동으로 1행 → `additionalProjectCount=0` (확장 2a 일치).
- **의존**: WU-2 의 `RawSkillRow` 새 필드 이름 (`projects_json`, `total_project_count`) 합의 — 같은 column alias 사용. WU-2 와 column 이름만 인터페이스 맞추면 병렬 가능, 하지만 안전을 위해 WU-2 의 인터페이스 합의 후로 그룹 배치.
- **검증 방법**:
  - `pnpm --filter @argos/web typecheck` (raw SQL 은 컴파일 검증 안되지만 mapSkillRow 통과 확인용).
  - `pnpm --filter @argos/web build` (Next.js build 통과).
  - 수동/통합: dev 서버 띄우고 `curl 'http://localhost:3000/api/orgs/<slug>/dashboard/skills?from=...&to=...'` → projects 배열, additionalProjectCount 응답 확인. projectId 파라미터 변형 케이스 2종.
- **예상 LOC**: +50

### WU-4: Popover UI primitive 신설

- **수정/생성 파일**:
  - `packages/web/src/components/ui/popover.tsx` (생성)
- **입력 계약**: `@base-ui/react/popover` 의 `Popover` namespace.
- **출력 계약**: shadcn 스타일 래퍼 — `Popover.Root`, `Popover.Trigger`, `Popover.Portal`, `Popover.Positioner`, `Popover.Popup` 을 그대로 re-export 하되 `Popup` 에 default className (`info-tooltip` 와 동일 톤: `rounded-md bg-popover text-popover-foreground ring-1 ring-foreground/10 shadow-md px-3 py-2 text-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0`) 적용 가능한 컴포넌트 export.
  - 트리거 모드는 click + hover 둘 다 — `Popover.Trigger` 의 `openOnHover` prop 으로 활성 (소스 검증: `node_modules/@base-ui/react/popover/trigger/PopoverTrigger.js` 가 `openOnHover` prop 받음). base-ui 1.4 의 popover 는 모달 비활성(`modal={false}`) 로 사용.
  - 명시 export: `Popover` 라는 단일 namespace 객체 또는 명명된 컴포넌트 5개. info-tooltip.tsx 와 동일한 스타일/구조 일관성 유지.
- **의존**: 없음.
- **검증 방법**: typecheck 통과 + WU-5 에서 실제 사용해 dev 화면에서 호버/클릭 양쪽으로 열리는지 확인.
- **예상 LOC**: +50

### WU-5: SkillProjectsCell 컴포넌트 (셀 + 팝오버 + 클릭 핸들러)

- **수정/생성 파일**:
  - `packages/web/src/components/dashboard/skill-projects-cell.tsx` (생성)
- **입력 계약**:
  - Props:
    - `projects: SkillStat['projects']`
    - `additionalProjectCount: number`
    - `isProjectFiltered: boolean` — URL 에 `?projectId=` 가 있을 때 true (= disabled 모드).
    - `onSelectProject: (projectId: string) => void` — 부모(page) 에서 setQuery 핸들러 주입.
- **출력 계약**:
  - **셀 DOM 구조 (nested interactive 방지)**: 셀 내부에 **두 종류의 sibling 요소** 를 둔다.
    1. **inline 요약 텍스트 영역** — `<span>` 컨테이너 안에 project name 들을 inline `<button>` 으로 나열. 클릭 시 `onSelectProject(projectId)`. 이 영역은 `Popover.Trigger` 가 **아님**.
    2. **팝오버 토글 affordance (항상 존재)** — 셀 우측에 작은 `<Popover.Trigger render={(props) => <button {...props} aria-label="Show project breakdown" ...>}>`.
       - `projects.length >= 1` 이면 **항상 렌더** — `additionalProjectCount` 와 무관. 팝오버는 풀 Top-5 breakdown(invocations 막대 + lastUsedAt) 표시.
       - **트리거 visible label 규칙**:
         - `additionalProjectCount > 0` → 라벨 텍스트 ` (+N more)` (이 자체가 트리거 버튼).
         - `additionalProjectCount === 0` → 라벨은 chevron 아이콘 (예: `lucide-react`의 `ChevronDown` size=14) 또는 "Details" 텍스트. 아이콘만 쓸 때도 `aria-label="Show project breakdown"` 필수.
       - `openOnHover` 는 데스크탑 보강. click/focus 가 기본 트리거.
    - 위 두 요소는 형제 (sibling) — 어떤 button 도 다른 button 의 자손이 아님. nested interactive 위험 제거.
  - **셀 텍스트 요약 규칙 (확정)**:
    - projects.length === 0 → 단일 `<span class="text-muted-foreground">—</span>` (clarify 6a). 팝오버 트리거 없음.
    - isProjectFiltered === true (확장 2a):
      - 첫 번째 project name 만 보이며 (단일 project 보장), `additionalProjectCount===0` 이라 접미사 없음.
      - 셀 전체에 `aria-disabled="true"`, 모든 button 에 `disabled` 속성, opacity-60 cursor-default 스타일. 팝오버 트리거도 비활성 (`disabled` button 으로 렌더 — base-ui 가 click/hover 모두 무시).
    - 일반 모드:
      - Top 5 project name 들을 `, ` 로 join. 각 이름은 inline `<button type="button">` — 클릭 시 `onSelectProject(projectId)`.
      - 길이 cut-off: **CSS truncation** (셀 자체에 `max-w-[20rem] truncate` 적용, full text 는 팝오버에서). text 자체 cut 은 하지 않아 데이터 손실 없음.
      - 팝오버 트리거(sibling)는 위 "셀 DOM 구조" 항목의 규칙대로 항상 존재 (라벨: `(+N more)` 또는 chevron/Details).
  - **팝오버 내용**: Top 5 project rows — 각 row 는 `<button>` (filter 가능) 으로 `project_name` + invocations 카운트 막대 + last used 상대 시간. `additionalProjectCount > 0` 이면 푸터에 `+N more projects (use Drill-down to see all)` 안내 텍스트 (별도 페이지가 없으므로 안내만; 풀 분포는 별도 task).
    - 팝오버 내 project name button 도 동일 `onSelectProject` 호출 (R1: 셀 텍스트 = 팝오버 내부 동일 핸들러로 통일).
    - 클릭 후 팝오버 자동 close (base-ui 기본 동작 + 명시적 `setOpen(false)`).
  - **접근성/키보드**:
    - 모든 project 클릭 요소는 `<button type="button" aria-label="Filter skills by project <name>">`.
    - 팝오버 트리거는 Tab focus 가능, Enter/Space 로 open, Escape 로 close.
    - 팝오버 내부 첫 button 으로 focus 이동 (base-ui `Popover.Popup` 기본 + `initialFocus` 사용 가능).
- **의존**: WU-1 (타입), WU-4 (Popover primitive).
- **검증 방법**:
  - `pnpm --filter @argos/web typecheck`.
  - 수동: dev 화면 — 셀 호버 → 팝오버 열림, 셀 내 클릭 → URL 변경, isProjectFiltered=true 일 때 disabled 스타일.
- **예상 LOC**: +120

### WU-6: skills page.tsx 컬럼/셀/핸들러 통합

- **수정/생성 파일**:
  - `packages/web/src/app/dashboard/[orgSlug]/skills/page.tsx` (수정)
- **입력 계약**: 기존 `SkillsContent` 컴포넌트와 `useDashboardSkills`.
- **출력 계약**:
  - `useRouter`, `usePathname` import 추가 (이미 `useSearchParams` 사용 중).
  - `setProjectIdQuery(id: string)` 헬퍼 (sessions/page.tsx 104-112 의 `setQuery` 패턴과 동형):
    ```ts
    const setProjectIdQuery = (id: string) => {
      const params = new URLSearchParams(searchParams.toString()) // ← 기존 from/to 등 보존
      params.set('projectId', id)                                  // projectId 만 set
      const qs = params.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)
    }
    ```
    - **명시 규칙**: `from`, `to`, 그 외 쿼리 파라미터는 보존. `projectId` 만 새 값으로 set. page 번호 같은 페이지네이션 파라미터는 skills 페이지에 없어 처리 불필요.
  - `isProjectFiltered = Boolean(projectId)` — 이미 부모에서 prop 으로 받음.
  - thead 에 새 `<th>` (Sessions 와 Users 사이 또는 Users 와 Median duration 사이 — **확정 위치: "Users" 와 "Median duration" 사이**. clarify 의 컬럼 순서 자연스러움 + Invocations 와 직결되는 dimension 이라 인접 권장):
    - 헤더 텍스트: `Projects`. isProjectFiltered 면 InfoTooltip 으로 "Filtered to one project" 안내(선택). 표시 자체는 항상 렌더(빈 헤더 X — clarify 3a 는 skills 가 0개일 때 별도 분기로 이미 처리됨).
  - tbody 의 각 row 에 새 `<td>` 추가, `<SkillProjectsCell>` 렌더 — `projects`, `additionalProjectCount`, `isProjectFiltered`, `onSelectProject={setProjectIdQuery}` 전달.
  - 컬럼 늘면서 `overflow-x-auto` 가 이미 적용되어 있어 가로 스크롤 처리 OK.
- **의존**: WU-1 (타입), WU-5 (SkillProjectsCell). WU-3 의 응답이 채워졌을 때 데이터가 흘러야 함 — 단 구현 자체는 WU-3 와 병렬 가능 (런타임에서만 만남).
- **검증 방법**:
  - `pnpm --filter @argos/web typecheck`.
  - `pnpm --filter @argos/web build`.
  - 수동 QA 시나리오 (아래 "검증 시나리오" 참조).
- **예상 LOC**: +30

## 병렬 실행 그룹

- **Group A (의존 없음, 병렬 가능)**: WU-1, WU-4
  - WU-1: `packages/shared/src/types/dashboard.ts`
  - WU-4: `packages/web/src/components/ui/popover.tsx` (신규)
  - 파일 충돌: 없음.
- **Group B (Group A 후, 병렬 가능)**: WU-2, WU-3
  - WU-2: `packages/web/src/lib/server/dashboard-row-mapping.ts` + `.test.ts`
  - WU-3: `packages/web/src/app/api/orgs/[orgSlug]/dashboard/skills/route.ts`
  - 파일 충돌: 없음. WU-3 가 WU-2 의 raw column 이름(`projects_json`, `total_project_count`)을 import 로만 참조하므로 인터페이스만 본 plan 에서 박혀 있으면 동시 작업 가능.
- **Group C (Group A 후, 병렬 가능 / Group B 와 동시 가능)**: WU-5
  - WU-5: `packages/web/src/components/dashboard/skill-projects-cell.tsx` (신규)
  - 의존: WU-1 (타입), WU-4 (Popover) — 둘 다 Group A. WU-2/WU-3 의 결과를 직접 쓰지 않음 (props 로 받는 순수 컴포넌트).
  - 파일 충돌: Group B 와 모두 다른 파일.
- **Group D (Group A+B+C 후)**: WU-6
  - WU-6: page.tsx 통합. WU-1, WU-5 둘 다 필요 (WU-3 의 응답은 런타임에만 합류하나 컴파일 의존 없음).
  - 파일 충돌: 없음 — 다른 worker 가 이 파일을 안 만짐.

**그룹 내 파일 경로 충돌 검증**: 모든 그룹의 work unit 들이 disjoint set 의 파일을 만진다 (WU-2 와 WU-3 가 같은 디렉토리지만 다른 파일). 동일 파일 동시 수정 없음.

## Negative Space 재확인

다음은 본 task 에서 **절대 수정 금지** (context.md 와 일치):

- `packages/web/src/app/api/orgs/[orgSlug]/dashboard/{overview,users,sessions,agents}/route.ts` — 다른 dashboard route.
- `packages/web/src/app/dashboard/[orgSlug]/{overview,users,sessions,agents,settings,reports}` — 다른 dashboard 페이지.
- `packages/web/prisma/schema.prisma` — read-only 집계 확장. schema 변경 금지.
- `packages/web/src/lib/server/dashboard-route-helper.ts` 의 `resolveOrgScopedProjectIds` — 시그니처/동작 그대로. **projectId 가드 위치는 이 함수에 위임** (clarify A6).
- `packages/web/src/components/dashboard/{date-range-picker,ranked-bar-chart,chart-card,kpi-card}.tsx` — 공용 컴포넌트 시그니처.
- `packages/shared/src/types/dashboard.ts` 의 `AgentStat`, `UserStat`, `SessionItem` 등 인접 타입.
- `events.is_skill_call=true` 외의 skill 정의 (`message_slash_calls` LATERAL regex) — union 절에 project_id 컬럼만 추가, 기존 매칭 로직 유지.
- `packages/web/src/hooks/use-dashboard-skills.ts` — 응답 타입은 `{ skills: SkillStat[] }` 그대로. 변경 불필요.

## 검증 시나리오 (Evaluate 단계 입력용)

### 자동 검증

1. `pnpm --filter @argos/shared build` — 타입 빌드 통과.
2. `pnpm --filter @argos/web typecheck` — TS 타입 통과.
3. `pnpm --filter @argos/web test packages/web/src/lib/server/dashboard-row-mapping.test.ts` — mapSkillRow 새 케이스 4종 통과.
4. `pnpm --filter @argos/web lint` — eslint 통과.
5. `pnpm --filter @argos/web build` — Next.js build 통과 (route handler 컴파일 통과).

### QA 시나리오 (앱 띄워서; UC-DRAFT 의 시나리오를 그대로 매핑)

#### 주 시나리오 (UC main 1~8)

- **S1**: dev 서버 (`pnpm --filter @argos/web dev`) 기동 후 멤버 사용자로 로그인 → `/dashboard/<orgSlug>/skills` 접속.
- **S2**: 네트워크 탭에서 `/api/orgs/<orgSlug>/dashboard/skills?from=&to=` 호출 1건 확인. 응답 JSON 각 skill 에 `projects`, `additionalProjectCount` 키 존재.
- **S3**: 화면의 "All skills" 테이블 thead 에 "Projects" 컬럼 존재. tbody 의 각 row 셀에 project name 들이 `, ` join + `(+N more)` 접미사 (해당 시).
- **S4**: 첫 행 "Projects" 셀에 마우스 호버 → 팝오버 열림. 풀 분포 리스트(Top 5 + lastUsedAt) 표시.
- **S5**: 셀 내 첫 project name 클릭 → URL 에 `?projectId=<id>` 추가, 페이지 reload 없이 테이블 재페치 (네트워크 새 요청 1건, 응답 skill 들의 `projects` 길이 = 1, `additionalProjectCount = 0`).

#### 확장 시나리오

- **S6 (확장 2a — projectId 이미 활성)**: 위 S5 직후 상태. "Projects" 셀이 단일 project 이름만, hover/click 비활성(opacity-60, cursor-default). 클릭해도 URL 변화 없음.
- **S7 (확장 8a — 팝오버 내 클릭)**: projectId 미설정 상태로 다시 시작. 셀 호버 → 팝오버 열림 → 팝오버 내 project name 클릭 → URL `?projectId=<id>` 교체 (S5 와 동일 결과).
- **S8 (확장 3a — 접근 가능 project 0개)**: 멤버십 없는 사용자로 로그인 → skills 페이지에 "아직 Skill 호출이 없습니다" 빈 상태 노출. "Projects" 컬럼 안 보임 (기존 빈 상태 분기 진입).
- **S9 (확장 6a — skill 의 project 0)**: SQL 데이터 오염 가정. 수동 케이스 — DB 에 is_skill_call=true 이지만 project_id NULL 인 event 만 있는 skill 시뮬레이션 어렵다면, mapSkillRow 의 빈배열 폴백 단위테스트로 갈음 (WU-2 자동 테스트).
- **S10 (확장 2b — API 실패)**: 네트워크 탭에서 응답을 5xx 로 시뮬레이션 (devtools throttle / proxy). 페이지 전체에 기존 빨간 에러 알림 + 재시도 버튼 노출. 부분 컬럼만 렌더되지 않음 (M1).

#### 권한 일관성 (G4·M2)

- **S11**: 두 project 멤버 A, B 가 있는 org 의 멤버. 셀에 노출되는 project 이름이 A, B 둘 다 있음. 동일 사용자가 멤버가 아닌 project C 의 데이터가 분포에 절대 노출되지 않음을 응답 페이로드(JSON) + UI 양쪽에서 확인. 셀의 invocations 합 ≤ 같은 행의 "Invocations" 컬럼 값.

#### 결정적 정렬 (R2 — tiebreaker)

- **S12**: 동일 invocations 값을 가진 project 2개가 있는 skill row 호버 → 팝오버 순서가 project_name ASC, project_id ASC tiebreaker 로 결정적. 페이지 새로고침 후에도 순서 변하지 않음.

#### 접근성 / 키보드 / 터치 (Decision-3, WU-5 보강)

- **S14 (키보드)**: 마우스 미사용. Tab 으로 "Projects" 셀의 첫 inline `<button>` (첫 project name) 까지 이동 → Enter 로 클릭 → URL `?projectId=` 교체. 이어서 Tab → `(+N more)` 트리거 → Enter 로 팝오버 open → 팝오버 내 첫 button 으로 focus 이동 → Escape 로 팝오버 close.
- **S15 (모바일/터치)**: Chrome DevTools mobile emulation (또는 실제 단말). "Projects" 셀 의 project name 탭 → URL 교체. `(+N more)` 탭 → 팝오버 open. 팝오버 외부 탭 → close. hover 이벤트 없이 동작 (clicks/taps 만으로 모든 시나리오 가능).
- **S16 (Escape/Outside click)**: 데스크탑 hover 로 팝오버 open → Escape 키 → close. 다시 open → 페이지 다른 영역 클릭 → close.

#### 페이로드 크기 회귀 (R3)

- **S13**: 변경 전/후 로컬 비교 절차 (성공 기준 6 의 P95 +20% 와 정합):
  1. 본 task 의 **변경 직전 커밋** 을 checkout 후 dev 서버 기동.
  2. seed 데이터(또는 staging dump) 가 있는 org/사용자로 `/api/orgs/<slug>/dashboard/skills?from=&to=` 를 **연속 10회** 호출 — curl `-w "%{time_total}\n%{size_download}\n"` 로 응답 시간/Content-Length 기록.
  3. 변경 후 커밋으로 다시 같은 호출 10회 반복.
  4. 비교: (a) **latency**: `변경 후 median <= 변경 전 median * 1.20` (= changed/baseline ≤ 1.2, 즉 변경 후가 변경 전 대비 120% 이내; 성공 기준 6 의 "P95 +20%" 를 로컬 median 으로 근사). (b) **payload**: 변경 후 Content-Length 절대값 < 40KB (50 skill × 5 project × ~80B = ~20KB + 헤더). 두 지표 모두 evaluate 보고서에 수치 기록.
  - baseline 비교가 불가능한 환경(데이터 없음)에서는 절대값 < 40KB sanity check 만 적용 + "측정 데이터 부족" 명시.

## Decision Log

- **Decision-1: Top-5 산출은 window function `ROW_NUMBER()` 로 한다 (LATERAL 미채택).**
  - 컨텍스트: 기존 union CTE 결과를 한 번 group by 한 뒤 partition 별 row_number 를 매기는 게 single plan node 로 충분.
  - 대안과 거절 사유: LATERAL join 은 skill 50 회 sub-plan 반복 — read 비용·plan complexity 증가. 기존 CTE 스타일과도 이질적.
  - 트레이드오프: window function 은 PG14+ 필요(이미 충족). 향후 분포 컬럼이 더 필요해질 때도 같은 base CTE 에 컬럼만 추가하면 됨.
  - 태그: `language:sql`, `db:postgres`, `area:api/skills`

- **Decision-2: Tiebreaker 는 `(invocations DESC, project_name ASC, project_id ASC)`.**
  - 컨텍스트: R2 — 동률 시 비결정적 순서면 새로고침 때마다 순서 흔들림.
  - 대안과 거절 사유: `(invocations DESC, project_id ASC)` 만 — id 가 cuid 라 사람 가독성 낮음. project_name 이 더 안정적이고 UX 친화.
  - 트레이드오프: 같은 이름의 project (실무에서 거의 없음) → projectId 가 최종 결정.
  - 태그: `area:api/skills`, `concern:determinism`

- **Decision-3: Popover 컴포넌트는 `@base-ui/react/popover` 를 사용. 기본 트리거 = click/focus, hover 는 보강.**
  - 컨텍스트: HoverCard 는 base-ui 에 없음(확인 — `ls node_modules/@base-ui/react` 결과 popover 만 존재). hover 단독 트리거는 모바일/터치/키보드 사용자를 배제하므로 안전한 기본은 click/focus.
  - 확인된 API: `Popover.Trigger` 가 `openOnHover` prop 노출 (PopoverTrigger.js 소스 검증). `Popover.Popup` 가 Escape/Outside click close 기본.
  - 대안과 거절 사유: Radix HoverCard 도입 → 신규 deps 증가. hover-only Tooltip → 클릭 가능 컨텐츠 불가.
  - 트레이드오프: trigger 가 두 영역(inline button vs popover button) 으로 분리되어 DOM 약간 복잡. 대신 nested interactive element 위험 제거 + a11y 준수.
  - 태그: `library:base-ui`, `area:web/ui`, `concern:a11y`

- **Decision-4: 셀 텍스트 cut-off 는 CSS truncate (`max-w-[20rem] truncate`), 텍스트 자체는 자르지 않는다.**
  - 컨텍스트: clarify 의 셀 텍스트 규칙은 `(+N more)` 접미사 뿐 — 글자 수 제한 없음. 데이터 손실 없이 UI overflow 처리.
  - 대안과 거절 사유: JS 측에서 substring 으로 자르고 `...` 붙이기 → 같은 데이터를 두 방식으로 두 번 표현해 일관성 깨짐. 풀 텍스트는 팝오버에 있어 truncate 가 안전.
  - 트레이드오프: 좁은 viewport 에서 1~2 글자 잘림은 가능. Hover 시 팝오버에서 full name 확인 가능 → 정보 손실 없음.
  - 태그: `area:web/ui`, `concern:ux`

- **Decision-5: projectId 권한 가드 위치는 `resolveOrgScopedProjectIds` 단일 진실로 유지.**
  - 컨텍스트: clarify A6 + context Negative Space 의 RBAC 위임 원칙. 본 route 는 함수 반환값을 그대로 SQL `WHERE` 절에 wiring 만 한다.
  - 대안과 거절 사유: route handler 내부에서 추가 검사 → 두 곳의 정책 분기 시 표류 위험.
  - 트레이드오프: 함수의 동작 변경 시 본 route 도 자동 영향 받음 — 일관성 측면에서 의도된 결합.
  - 태그: `area:api/auth`, `concern:rbac`

- **Decision-6: `additionalProjectCount` 는 응답 페이로드에서 계산해 보낸다 (UI 계산 X).**
  - 컨텍스트: SQL `count(distinct project_id) - 5` 한 줄. UI 가 풀 분포를 받지 않는 한 클라이언트가 알 수 없음.
  - 대안과 거절 사유: 응답에 풀 분포(N개) 를 다 보내고 UI 에서 자름 → R3 페이로드 회귀.
  - 트레이드오프: backend 가 두 값(`projects` Top5 + `additionalProjectCount`)을 모두 산출. clarify G2 와 정확히 일치.
  - 태그: `area:api/skills`, `concern:payload-size`

- **Decision-7: R1 (팝오버 내 project 이름 클릭) — 셀 텍스트 클릭과 동일 핸들러로 통일.**
  - 컨텍스트: clarify 확장 8a 가 이미 명세에 포함, context R1 사실 확인이 안전성 인정. 두 영역의 클릭을 분기할 UX 이유 없음.
  - 대안과 거절 사유: 팝오버 내부에만 클릭 허용 / 셀 외부는 디스플레이 only → 호버 의존 UX 가 모바일에서 어려움.
  - 트레이드오프: 클릭 가능 영역이 늘어 의도치 않은 클릭 가능성 — 각 project name 을 명시적 `<button>` 으로 감싸 명확한 affordance 제공.
  - 태그: `area:web/ui`, `concern:ux`

- **Decision-8: R3 페이로드 회귀 측정 — 변경 전/후 로컬 비교 절차 + 절대 sanity bound 병행.**
  - 컨텍스트: clarify 성공 기준 6 은 "P95 +20%". 저장된 baseline 부재 (context 확인) — 변경 전 커밋에서 같은 호출 10회 측정해 비교한다.
  - 대안과 거절 사유: 사전 부하 테스트 인프라 도입 → 본 task 범위 초과. 측정 없이 정성 기준 → 회귀 발견 못 함.
  - 트레이드오프: 로컬 median 측정은 정밀하지 않으나, +20% 임계는 정상 분포 안에서 안전한 가드. payload (Content-Length) 절대값은 보조 지표.
  - 절차: S13 에 명시. 두 지표(latency median + Content-Length) 를 evaluate 보고서에 수치 기록.
  - 태그: `concern:performance`, `phase:evaluate`

- **Decision-9: 호버 팝오버 내용은 Top 5 + `+N more` 안내만, "풀 분포(접근 가능한 project 전체)" 요구는 응답 스키마 정합에 의해 축소.**
  - 컨텍스트: clarify 라인 36 ("호버 시 풀 분포") 가 응답 스키마(A1/G2 — Top 5 + count) 및 성공 기준 6 (50×5=250 entry 상한) 과 충돌. 라인 19 의 응답 스키마가 더 구체적이고 R3 페이로드 가드와 정합하므로 그것을 단일 진실로 채택.
  - 대안과 거절 사유: 풀 분포를 별도 필드(`projectsAll`)로 추가 → 응답 페이로드가 skill 50개 × 잠재적 수십 project = 수백~수천 entry 로 폭증, R3 위반.
  - 트레이드오프: 사용자가 "Top 5 외 project 명세" 를 보려면 별도 drill-down 페이지 필요 (비범위로 이미 명시). 본 task 는 `+N more` 안내로 트레이드오프 표시.
  - 태그: `area:api/skills`, `area:web/ui`, `concern:payload-size`, `decision:clarify-conflict`

- **Decision-10: PG aggregate 문법 `json_agg(... ORDER BY ...) FILTER (WHERE ...)` 채택.**
  - 컨텍스트: Top 5 rank window 결과를 한 번에 array 로 묶기 위해 aggregate 의 ORDER BY + FILTER 조합 필요.
  - 대안과 거절 사유: subquery + LIMIT 5 (배열 produce 위해 또 한번 wrap 필요) → CTE 두 개 추가, 복잡도↑. window 결과를 application 에서 자르기 → DB→APP 전송량 증가.
  - 트레이드오프: PG aggregate ORDER BY + FILTER 는 SQL:2003 표준 + PostgreSQL 9.4+ 안정. Argos 의 PG 11+ 환경에서 안전.
  - 태그: `language:sql`, `db:postgres`, `area:api/skills`

## Critique Reflection

### Round 1 (`03-plan-critique-1.md`)

critical 없음. major 6, minor 6 처리:

- **1 (major, 풀 분포 vs Top 5 충돌)**: **반영** — Decision-9 신설로 clarify 내 충돌을 명시 해소. 응답 스키마(Top 5 + count)를 단일 진실로, UI 도 동일. 개요에 정합 메모 추가.
- **2 (major, hover-only a11y 위험)**: **반영** — Decision-3 갱신: 기본 트리거 = click/focus, hover 는 보강. 검증 시나리오 S14/S15/S16 추가 (키보드/터치/Escape).
- **3 (major, nested interactive)**: **반영** — WU-5 의 DOM 구조를 inline button(s) + sibling popover trigger 의 형제 구조로 명시. nested button 위험 제거.
- **4 (major, json_build_object timestamp 형식 불안정)**: **반영** — WU-3 SQL 에 `to_char(... AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')` 추가. mapper 의 Date 가정 제거.
- **5 (major, WU-7 일관성)**: **반영** — WU-7 삭제. 모든 mapSkillRow 테스트는 WU-2 에 흡수.
- **6 (major, R3 P95 vs Content-Length 혼선)**: **반영** — S13 을 변경 전/후 로컬 latency 비교 + payload 보조 지표 절차로 재작성. Decision-8 갱신.
- **7 (minor, projects p org_id 가드)**: **반영** — WU-3 JOIN 절에 `AND p.org_id = ${access.org.id}` 추가. 다중 가드 목록도 명시.
- **8 (minor, json_agg FILTER+ORDER BY 근거)**: **반영** — Decision-10 신설 (PG 9.4+ 안정성 명시).
- **9 (minor, projects_json nullable 책임 경계)**: **반영** — WU-2 출력 계약에 "SQL 측 non-null 보장 + mapper 는 방어 로직" 분리 명시. WU-3 최종 SELECT 도 `COALESCE` 명시.
- **10 (minor, base-ui popover API 근거)**: **반영** — Decision-3 에 확인된 API/소스 검증 한 줄 추가 (이미 본 plan 작성 중 `node_modules/@base-ui/react/popover/trigger/PopoverTrigger.js` 의 `openOnHover` 확인 완료).
- **11 (minor, from/to 쿼리 보존 규칙)**: **반영** — WU-6 에 `setProjectIdQuery` 코드 스니펫 추가, 명시 규칙 한 줄.
- **12 (minor, R1/R2 vs R3 일관성)**: **반영** — Decision-8/S13 재작성에서 R3 도 명시 절차로 확정.

### Round 2 (`03-plan-critique-2.md`)

critical 없음. major 3, minor 2 처리:

- **1 (major, S13 latency 비교식 반대)**: **반영** — `변경 후 median <= 변경 전 median * 1.20` 으로 수정, "changed/baseline ≤ 1.2" 명시.
- **2 (major, `all_skill_calls` CTE 중복 실행)**: **반영** — `all_skill_calls` 를 독립 CTE 로 승격, `skill_events` 도 `FROM all_skill_calls` 로 변경. union 한 번만 실행됨을 SQL/주석에 명시.
- **3 (major, popover trigger 누락 가능성)**: **반영** — WU-5 "팝오버 토글 affordance" 가 `projects.length >= 1` 일 때 항상 렌더. `additionalProjectCount===0` 케이스에 chevron/Details 라벨 fallback 명시.
- **4 (minor, openOnHover prop 위치 일관성)**: **반영** — WU-4 라인 149를 `Popover.Trigger` 로 수정, 소스 검증 경로(`node_modules/@base-ui/react/popover/trigger/PopoverTrigger.js`) 명시. 전 plan 문서가 `Popover.Trigger` prop 으로 일관.
- **5 (minor, Decision-8 → Decision-10 참조 오기)**: **반영** — SQL 주석을 "Decision-10 에 명시" 로 수정.

종료 사유: critical 한번도 없었고 두 라운드의 major/minor 17 건 전부 처리. 추가 round 한계효용 낮아 종료. (v1: 12건, v2: 5건; 새 critical 미발생 추세).
