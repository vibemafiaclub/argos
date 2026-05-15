# Implement — WU-1

## 변경 요약

`session-activity-ribbon.tsx` 에 인라인으로 있던 `segmentVisuals` 함수를 `session-ribbon-visuals.ts` (순수 `.ts`, JSX/React 런타임 의존 없음)로 추출하고, skill/subagent 이벤트(`isSkillCall || isAgentCall`)에 대해 `bg-chart-4`(앰버) 분기를 추가했다. ribbon은 같은 폴더의 named import로 교체하고, `CSSProperties` import도 더 이상 직접 사용하지 않으므로 제거했다. vitest 7케이스(skill/subagent/둘다/일반tool/HUMAN/ASSISTANT/ASSISTANT-zero)가 모두 통과하며, `timeline-events.test.ts`에 skill 이벤트가 `buildTimelineGroups`에서 머지되지 않음을 가드하는 회귀 케이스 1개를 추가했다.

## 변경 파일

- `packages/web/src/components/dashboard/session-ribbon-visuals.ts` (신규, ~19 lines)
- `packages/web/src/components/dashboard/session-ribbon-visuals.test.ts` (신규, ~90 lines)
- `packages/web/src/components/dashboard/session-activity-ribbon.tsx` (수정, ~-14/+2 lines)
- `packages/web/src/lib/timeline-events.test.ts` (수정, ~+60 lines)

## 검증 결과

- `npx vitest run src/components/dashboard/session-ribbon-visuals.test.ts` → 7 passed
- `npx vitest run` (전체 스위트) → 67 passed, 0 failed
- `tsc --noEmit` (내 파일 관련) → 에러 없음 (기존 pre-existing 에러는 본 WU 무관)
- `rg "session-ribbon-visuals" packages/web/src` → 허용 목록 2개(ribbon.tsx, visuals.test.ts) 외 import 없음
- `rg "bg-muted-foreground" session-activity-ribbon.tsx` → line 291 머지바 head 하드코딩 유지 확인

## 잠재 이슈 / 후속 메모

- `pnpm --filter @argos/web build` (Next 프로덕션 빌드) 와 `pnpm --filter @argos/web lint` 검증은 plan의 자동검증 4, 5번에 해당하며 evaluate 단계에서 수행 권고. 본 WU 범위의 ribbon import 변경은 client 컴포넌트에서 같은 폴더 순수 TS helper를 참조하는 것이므로 Next 빌드 경계 위반 가능성 낮음.
- 기존 `tsc --noEmit` 에는 `@argos/shared` 미빌드 및 ESM/CJS 모듈 혼용 관련 pre-existing 에러가 다수 존재하나, 이는 본 WU 변경과 무관하며 내 파일에 관련된 새 에러는 없음.
