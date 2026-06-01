# Implement — WU-9

## 변경 요약
`overview/route.ts` L43 의 `aggregateSummary(rollups, 5)` 를 `aggregateSummary(rollups, { topSkillsN: 10 })` 로 교체했다. WU-3 가 도입한 `AggregateSummaryOptions` overload 를 활용하여 `topSkillsN=10` 을 명시적으로 전달하고, `topAgentsN` 은 옵션에서 생략해 `normalizeAggregateSummaryOptions` 의 기본값 5 가 적용되도록 했다. 변경 범위는 정확히 1줄이며 다른 파일은 일체 수정하지 않았다.

## 변경 파일
- `packages/web/src/app/api/orgs/[orgSlug]/dashboard/overview/route.ts` (수정, 1 line)

## 검증 결과
- `pnpm --filter web typecheck` → `overview/route.ts` 에서 WU-9 관련 신규 오류 없음. 유일한 오류(`TS2307: Cannot find module '@argos/shared'`)는 프로젝트 전체에 걸쳐 수십 파일에 이미 존재하는 사전 환경 문제로, WU-9 변경과 무관.
- `aggregateSummary` 호출이 WU-3 의 `opts: AggregateSummaryOptions` overload 에 정확히 매핑됨 확인.

## 잠재 이슈 / 후속 메모
- `@argos/shared` 모듈 미설치(`node_modules missing`) 로 인해 전체 typecheck 가 exit 2 를 반환하는 환경 문제가 있음. CI 에서 `pnpm install` 이 선행되어야 완전한 typecheck 통과 가능.
- WU-3 의 `aggregateSummary` overload 가 존재해야 이 변경이 유효함. WU-3 이 완료된 상태에서 merge 해야 한다.
