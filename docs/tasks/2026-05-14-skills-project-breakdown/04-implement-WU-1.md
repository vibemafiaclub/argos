# Implement — WU-1

## 변경 요약

`packages/shared/src/types/dashboard.ts` 의 `SkillStat` interface 에 `projects` 와 `additionalProjectCount` 두 필드를 추가했다.
`SkillProjectEntry` 보조 interface 를 신설해 project 분포 항목(projectId, projectName, invocations, lastUsedAt) 의 타입을 정의했다.
각 필드에 JSDoc 으로 권한 필터(resolveOrgScopedProjectIds) 후 수치임을 명시하고, lastUsedAt 의 UTC ISO 8601 포맷과 additionalProjectCount 의 산출 방식을 기술했다.

## 변경 파일

- packages/shared/src/types/dashboard.ts (수정, +26/-0 lines)

## 검증 결과

- `pnpm --filter @argos/shared build` → pass (tsc, exit 0, 출력 없음)

## 잠재 이슈 / 후속 메모

없음
