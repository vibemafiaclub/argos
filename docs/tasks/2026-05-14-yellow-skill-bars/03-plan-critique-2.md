# Plan Critique Round 2 — 2026-05-14-yellow-skill-bars

critical 없음.

## severity: major
- 위치(plan 섹션): 아키텍처/접근 선택, WU-1, Decision-3
- 한 줄 설명: `session-ribbon-visuals.ts` 를 `src/lib/` 에 두면 ribbon 전용 Tailwind/React style 결정이 도메인 lib 처럼 보이며, 향후 event-list/detail 등으로 재사용되면서 분류/시각 결합도가 퍼질 위험이 있다.
- 권고 수정: helper 위치를 `packages/web/src/components/dashboard/session-ribbon-visuals.ts` 로 두고 테스트도 같은 폴더의 `.test.ts` 로 둬라. import 는 상대경로 type-only 로 유지하면 alias/vitest 문제도 피하면서 "ribbon 전용" 소유권이 명확해진다.

## severity: minor
- 위치(plan 섹션): 검증 시나리오/자동 검증 #6, Critique Reflection minor #5
- 한 줄 설명: `rg "from '@/lib/session-ribbon-visuals'" packages/web/src` 는 alias import 만 잡기 때문에 상대경로 import 나 다른 문자열 사용을 놓쳐 "ribbon 외 사용 금지" 경계를 완전히 검증하지 못한다.
- 권고 수정: helper 를 dashboard 폴더로 옮기거나, 유지한다면 grep 을 `rg "session-ribbon-visuals" packages/web/src` 로 바꾸고 허용 파일 목록을 `session-activity-ribbon.tsx` 및 테스트 파일로 명시하라.

## severity: minor
- 위치(plan 섹션): WU-1 입력 계약, Decision-3 보강 근거, Decision-6 Fallback
- 한 줄 설명: `import type` 이 emit 되지 않는다는 판단은 `isolatedModules` 및 `verbatimModuleSyntax` 환경에서도 맞지만, `tsc --noEmit` 이 "emit 제거" 자체를 검증한다는 표현은 부정확하다.
- 권고 수정: "TypeScript 의 type-only import 는 JS emit 에서 제거되며, 값으로 오용하면 `isolatedModules`/TS 컴파일에서 드러난다. 실제 런타임 import 부재는 vitest 실행으로 간접 확인한다" 로 고쳐라. 현재 repo 에는 `verbatimModuleSyntax` 설정이 보이지 않으므로 그 설정을 확인됨처럼 쓰지 말고 "설정되더라도 동일" 정도로 표현하라.

## severity: minor
- 위치(plan 섹션): CP-3 테스트 작성
- 한 줄 설명: 테스트에서 `ToolEvent` / `MessageEvent` 를 `./timeline-events` 에서 가져온다고만 되어 있어, 구현자가 값 import 로 작성하면 `timeline-events.ts` 런타임 모듈을 평가하게 되어 helper 추출의 목적이 일부 약해진다.
- 권고 수정: 테스트 파일도 `import type { ToolEvent, MessageEvent } from './timeline-events'` 로 명시하고, 값 import 는 `./session-ribbon-visuals` 의 `segmentVisuals` 하나로 제한하라.

## 종합

round 1 의 major 들은 helper 추출 방향으로 실질 해소됐다. CP-4(b) 는 `timeline-events.test.ts` 만 수정한다면 negative space 의 `timeline-events.ts` 수정 금지를 위반하지 않는다. Decision-3 의 `import type` emit 가정 자체도 맞다. 다만 위처럼 helper 위치와 검증 표현은 더 정확히 조정하는 편이 좋다.
