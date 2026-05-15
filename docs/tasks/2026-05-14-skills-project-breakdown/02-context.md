# Context — 2026-05-14-skills-project-breakdown

## 관련 코드 위치

| # | path | lines | 역할 | 변경 가능성 |
|---|------|-------|------|-------------|
| 1 | packages/web/src/app/dashboard/[orgSlug]/skills/page.tsx | 전체 | skills 페이지 UI. "All skills" 테이블 thead/tbody (134-178) 에 "Projects" 컬럼·셀 추가. projectId 는 189에서 URL 읽음. | 수정 |
| 2 | packages/web/src/app/api/orgs/[orgSlug]/dashboard/skills/route.ts | 전체 | skills API. CTE (41-122) 에 skill×project group by 추가, 응답 shape 확장. | 수정 |
| 3 | packages/web/src/lib/server/dashboard-row-mapping.ts | 6-37 | `RawSkillRow` / `mapSkillRow` — projects 배열·additionalProjectCount 매핑 추가. | 수정 |
| 4 | packages/shared/src/types/dashboard.ts | 57-70 | `SkillStat` 타입. `projects`/`additionalProjectCount` 필드 추가 (clarify A1·G2). | 수정 |
| 5 | packages/web/src/hooks/use-dashboard-skills.ts | 전체 | react-query 훅. 응답 타입은 `{ skills: SkillStat[] }` 그대로 유지 — 변경 불필요. | 참조 |
| 6 | packages/web/src/lib/server/dashboard-route-helper.ts | 82-134 | `resolveOrgScopedProjectIds(orgId, userId, role, projectIdParam): string[] \| NextResponse` — projectId 지정 시 `[X]` 단일 배열 반환 (확장 2a 의 근거). | 참조 |
| 7 | packages/web/prisma/schema.prisma | 154-171 | `Project { id, orgId, name, slug }`. `projects.name` 이 표시용 이름 (A2). | 참조 |
| 8 | packages/web/prisma/schema.prisma | 258-280 | `Event { projectId, isSkillCall, skillName, sessionId }` — skill×project group by 의 원천. | 참조 |
| 9 | packages/web/src/components/dashboard/date-range-picker.tsx | 전체 | URL searchParams 패턴 (from/to). 셀 클릭 시 projectId 교체 시 같은 라우터 패턴 사용 (45-56). | 참조 |
| 10 | packages/web/src/components/ui/info-tooltip.tsx | 전체 | `@base-ui/react/tooltip` 사용 예시. 호버 팝오버는 base-ui Popover/HoverCard 로 신설 가능. | 참조 (신규 인접) |
| 11 | packages/web/src/app/api/orgs/[orgSlug]/dashboard/sessions/route.ts | 60-100 | `session.project.name` join 패턴 — project 표시명 가져오는 기존 사례. | 참조 |
| 12 | packages/web/src/app/dashboard/[orgSlug]/sessions/page.tsx | 102-112, 295-312 | `showProjectColumn = !projectId`, `setQuery` 로 projectId 쿼리 교체하는 기존 사례 (확장 8a 와 동형). | 참조 |
| 13 | packages/web/src/lib/server/dashboard-row-mapping.test.ts | 전체 | `mapSkillRow` 의 기존 테스트. 새 필드 매핑 테스트 케이스 추가 필요. | 수정 (인접 테스트) |
| 14 | packages/web/package.json | 20 | `@base-ui/react ^1.4.0` 사용 가능 — Popover/HoverCard primitive 도입 시 신규 의존성 없음. | 참조 |

## 관련 기존 ADR

| ADR | 제목 | 이번 task와의 관계 |
|-----|------|---------------------|
| (없음) | — | 본 task 와 직접 충돌·지시 관계인 ADR 없음. 권한·DB·집계 정책은 모두 ADR 외부의 코드 헬퍼(`resolveOrgScopedProjectIds`, dashboard CTE 패턴)로 운용 중이며, 본 task 도 그 패턴을 따른다. |

## Negative Space (만지지 말 것)

- `packages/web/src/app/api/orgs/[orgSlug]/dashboard/{overview,users,sessions,agents}/route.ts` — 다른 페이지의 집계 로직. 본 task 는 skills route 한정.
- `packages/web/src/app/dashboard/[orgSlug]/{overview,users,sessions,agents,settings,reports}` — 다른 dashboard 페이지의 UI.
- `packages/web/prisma/schema.prisma` — 본 task 는 read-only 집계 확장. schema 변경 금지.
- `packages/web/src/lib/server/dashboard-route-helper.ts` 의 `resolveOrgScopedProjectIds` 시그니처·동작 — RBAC 모델 그대로 사용 (A6).
- `packages/web/src/components/dashboard/{date-range-picker,ranked-bar-chart,chart-card,kpi-card}.tsx` — 공용 컴포넌트 시그니처 변경 금지 (다른 페이지가 함께 씀).
- `packages/shared/src/types/dashboard.ts` 의 `AgentStat`, `UserStat`, `SessionItem` 등 인접 타입 — 본 task 는 `SkillStat` 만 확장.
- `events.is_skill_call=true` 외의 skill 정의 (예: `message_slash_calls` LATERAL regex CTE) — 기존 union 로직 유지, project 차원만 추가.

## 폴더 구조 메모

- `packages/web/src/app/dashboard/[orgSlug]/skills/` — 본 task 의 클라이언트 진입 (page.tsx 만 존재, 'use client').
- `packages/web/src/app/api/orgs/[orgSlug]/dashboard/skills/` — Next.js Route Handler(`route.ts`). Prisma `$queryRaw` 로 CTE 작성.
- `packages/web/src/lib/server/` — server-only 헬퍼: `dashboard-route-helper.ts`(권한·projectId 해석), `dashboard-row-mapping.ts`(raw row → DTO 매핑), `dashboard.ts`(parseDateRange, assertOrgAccess 등).
- `packages/web/src/components/dashboard/` — recharts 기반 차트 + 카드 컴포넌트. 본 task 는 신규 컴포넌트(예: `skill-projects-cell.tsx`) 를 여기에 두는 게 자연스러움.
- `packages/web/src/components/ui/` — shadcn 스타일 primitives. 현재 popover/hover-card 컴포넌트 없음 → 도입 시 `@base-ui/react/popover` 또는 `…/hover-card` 래퍼 신설 필요.
- `packages/shared/src/types/dashboard.ts` — API↔UI 공유 DTO. 응답 스키마 변경의 단일 진실.

## 위험/주의 (R1·R2·R3 사실 확인)

- R1 (팝오버 내 클릭 통일): clarify 8a 가 이미 명세에 포함되어 있고, 코드상 동등한 패턴(`sessions/page.tsx` 102-112 의 setQuery+router.push) 이 존재해 같은 페이지 내 쿼리 교체는 검증된 기법. 셀 외부 클릭(팝오버 내부)도 동일 핸들러 재사용으로 비용 없음 — clarify 명세 그대로 진행 가능.
- R2 (Top 5 동률 tiebreaker): 현재 코드의 다른 CTE 들도 `ORDER BY ... DESC` 단일 키만 쓰며 tiebreaker 명시 없음(예: skills route 121 `ORDER BY e.call_count DESC`). 본 task 에서는 `ORDER BY invocations DESC, project_name ASC, project_id ASC` 로 결정적 정렬을 추가하는 것이 안전. 구현 단계 결정 사항.
- R3 (페이로드 회귀 P95 baseline 부재): repository 에 부하 테스트/성능 baseline 파일 없음(확인됨). 페이로드는 최악 250 entry × 약 80B ≈ 20KB 추가 수준으로 정성적 안전 범위. evaluate 단계에서 실제 응답 크기·시간을 로컬 측정해 기록하는 것으로 충분.
- 추가 주의 1: `message_slash_calls` CTE(55-80) 는 `claude_sessions.project_id` 로 project 를 얻고, `event_skill_calls` 는 `events.project_id` 를 직접 가짐. union 후 project 단위 group by 시 양쪽이 같은 `project_id` 컬럼을 노출하도록 union 절을 수정해야 함.
- 추가 주의 2: 권한 일관성(G4) — 분포 산출 시 반드시 `projectIds` 배열로 필터해야 함. `projects` 테이블 JOIN 시에도 `WHERE p.id = ANY(${projectIds}::text[])` 로 가드.
