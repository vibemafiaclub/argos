# Implement — WU-3

## 변경 요약
`skills/route.ts` 의 union CTE 를 재구성해 skill 별 project 분포를 API 응답에 포함시켰다. `event_skill_calls` / `message_slash_calls` 양쪽에 `project_id` 컬럼을 추가하고, 기존 인라인 union subquery 를 `all_skill_calls` 독립 CTE 로 승격해 `skill_events` 와 신규 `skill_project_aggregates` 가 동일 CTE 를 공유하도록 했다. `skill_project_ranked` (ROW_NUMBER window, tiebreaker 3단) → `skill_project_breakdown` (json_agg FILTER rn<=5 + to_char ISO8601 + COALESCE '[]') 흐름으로 Top-5 배열과 `total_project_count` 를 산출한다. 최종 SELECT 에 `LEFT JOIN skill_project_breakdown USING (skill_name)` + COALESCE 를 추가해 `projects_json`, `total_project_count` 를 non-null 보장으로 노출한다. `JOIN projects p ON p.id = sc.project_id AND p.org_id = ${access.org.id}` + `WHERE sc.project_id = ANY(projectIds)` 로 org 격리 + RBAC 다중 가드를 구현했다.

## 변경 파일
- packages/web/src/app/api/orgs/[orgSlug]/dashboard/skills/route.ts (수정, +73/-8 lines, 128 → 194 lines)

## 검증 결과
- `pnpm --filter @argos/web typecheck` → skills/route.ts 파일 자체에 대한 타입 오류 없음. 다른 파일들의 기존 오류(`@argos/shared` 미빌드, `next-auth` ES module)는 WU-3 범위 외 pre-existing 문제로 영향 없음.
- SQL 구문 정합: plan §WU-3 출력 계약의 CTE 패턴(all_skill_calls 독립 승격, ROW_NUMBER PARTITION BY, json_agg FILTER, to_char ISO8601, COALESCE non-null 보장, LEFT JOIN) 전부 구현 완료.
- WU-2 컬럼 인터페이스 합의(`projects_json`, `total_project_count`) 와 column alias 정확히 일치.
- `pnpm --filter @argos/web build` — WU-1/WU-2 shared 패키지 빌드 선행 필요. 현 환경에서 shared 미빌드 상태이므로 Next.js build 는 WU-1/WU-2/WU-4/WU-5/WU-6 완료 후 통합 검증 예정.

## 잠재 이슈 / 후속 메모
- WU-2 의 `RawSkillRow` 에 `projects_json: unknown` 과 `total_project_count: bigint` 필드가 추가되어야 SQL 결과가 타입과 맞물린다. WU-2 와 column alias 가 plan 에 박혀 있으므로 병렬 구현 후 컴파일 시점에 자연스럽게 합류됨.
- `skill_project_breakdown` 의 `total_project_count` 는 `COUNT(*)` 이므로 Prisma `queryRaw` 결과에서 bigint 로 반환된다. WU-2 mapper 는 `Number(total_project_count)` 로 처리하도록 합의되어 있어 문제없음.
- `?projectId=X` 단일 project 필터 시 `projectIds = [X]` 이므로 각 skill 의 `projects` 배열 길이 = 1, `additionalProjectCount = 0` 이 자동 성립 (확장 2a 일치).
