# Implement — WU-2

## 변경 요약

`RawSkillRow` 인터페이스에 `projects_json: unknown` 과 `total_project_count: bigint` 두 필드를 추가하고, `parseProjectsJson` 헬퍼를 신설해 `Array.isArray` + element shape 체크(projectId/projectName/invocations/lastUsedAt 각각 타입 가드) 로 방어적 파싱을 구현했다. `mapSkillRow` 가 이 헬퍼를 통해 `projects` 와 `additionalProjectCount`(`Math.max(0, totalProjectCount - projects.length)`)를 SkillStat 에 채워 반환하도록 확장했다. 잘못된 입력(null, non-array, shape 불일치 element)은 throw 없이 빈 배열 폴백으로 처리하며, 5종의 신규 테스트 케이스가 모두 통과한다.

## 변경 파일

- `packages/web/src/lib/server/dashboard-row-mapping.ts` (수정, +43/-1 lines)
- `packages/web/src/lib/server/dashboard-row-mapping.test.ts` (수정, +51 lines)

## 검증 결과

- `vitest run src/lib/server/dashboard-row-mapping.test.ts` (from worktree packages/web) → 8 tests passed (3 기존 + 5 신규)
- 타입체크: WU-2 파일에 WU-2 기인 타입 오류 없음. `@argos/shared` 미해결은 워크트리 node_modules 미설치 환경의 전역 이슈로 WU-2 무관.

## 잠재 이슈 / 후속 메모

- `projects_json` 필드가 Postgres 에서 실제로 JSON 배열이 아닌 다른 타입(예: string)으로 내려올 경우 방어 로직이 동작해 빈 배열을 반환한다. 정상 경로에서는 WU-3 의 `COALESCE('[]'::json)` 가 항상 배열을 보장하므로 폴백이 실행될 일은 없다.
- `lastUsedAt` 이 `Date` 객체로 오는 경우 `.toISOString()` 폴백 경로가 있으나, WU-3 의 `to_char(...AT TIME ZONE 'UTC', ...)` 변환으로 항상 string 으로 내려온다.
