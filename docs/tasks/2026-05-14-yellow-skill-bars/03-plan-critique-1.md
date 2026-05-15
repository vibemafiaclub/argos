# Plan Critique Round 1 — 2026-05-14-yellow-skill-bars

critical 없음.

## severity: major
- 위치(plan 섹션): 아키텍처/접근 선택, WU-1 구현 세부, Decision-3
- 한 줄 설명: `.test.ts` 가 `session-activity-ribbon.tsx` 를 import 하면 `segmentVisuals` 만 가져오는 것이 아니라 `use client` 모듈 전체와 `@/lib/...`, React, date-fns 계열 top-level import 를 Node env 에서 평가하므로, "호출되지 않으니 안전" 이라는 근거가 불충분하다.
- 권고 수정: 현재 `packages/web/vitest.config.ts` 에 alias/plugin 설정이 없다는 점을 반영해, (1) `segmentVisuals` 를 순수 `.ts` helper 로 추출해 테스트가 JSX/client 모듈을 import 하지 않게 하거나, (2) vitest alias 해석 및 `.tsx` import smoke 결과를 Decision Log 에 명시하고 실패 시 대안을 적어라.

## severity: major
- 위치(plan 섹션): Decision-3, 검증 시나리오/자동 검증
- 한 줄 설명: `@/*` path alias 는 tsconfig 에만 있고 vitest config 에는 없는데, 계획은 `session-activity-ribbon.tsx` 의 `@/lib/timeline-events`, `@/lib/format` import 가 vitest 에서 해석된다는 전제를 검증 없이 둔다.
- 권고 수정: `pnpm --filter @argos/web exec vitest run src/components/dashboard/session-activity-ribbon.test.ts` 전에 alias preflight 를 넣거나, 테스트 대상 모듈을 alias 없는 순수 helper 로 분리하라; vitest config 변경 금지 방침을 유지한다면 후자가 더 안정적이다.

## severity: major
- 위치(plan 섹션): WU-1 테스트 케이스, 검증 시나리오/자동 검증
- 한 줄 설명: 성공 기준 4의 "접힌 머지바 head 는 회색 유지" 는 `segmentVisuals` 테스트 4(+1) 개로는 검증되지 않으며, 현재 계획은 수동 QA 에만 사실상 의존한다.
- 권고 수정: 최소한 `buildTimelineGroups` 가 skill/subagent 를 merged group 에 넣지 않는 회귀 테스트를 기존 `timeline-events.test.ts` 에 추가하거나, component-level 검증을 하지 않는 이유와 수동 QA 만으로 충분한 근거를 Decision Log 에 명시하라.

## severity: major
- 위치(plan 섹션): Decision-3
- 한 줄 설명: `use client` 디렉티브가 vitest 에서 무해하다는 결론은 맞을 가능성이 높지만, 계획의 근거가 "React 훅이 호출되지 않는다" 에 치우쳐 있고 디렉티브 자체가 테스트 번들러에서 단순 문자열 directive 로 취급된다는 설명이 없다.
- 권고 수정: Decision Log 에 "Vitest/Vite 에서는 `use client` 가 런타임 동작을 만들지 않는 directive prologue 이며, 위험은 directive 가 아니라 모듈 top-level import 평가다" 라고 분리해 적고, 실제 검증 명령을 실패 조건과 함께 둬라.

## severity: minor
- 위치(plan 섹션): WU-1 출력 계약, Decision-3, 검증 시나리오/자동 검증
- 한 줄 설명: `export function segmentVisuals` 추가가 Next.js client component 규칙을 위반하지 않는지에 대해 `next build` 만 적혀 있고, "서버 코드에서 이 non-component export 를 import 하지 않는다" 는 사용 경계가 명시되지 않았다.
- 권고 수정: named export 자체는 client module 에서 금지되는 변경이 아니라는 판단 근거와 함께, 해당 export 는 테스트 전용/순수 helper 용이며 production server component 에서 호출하지 않는다는 경계를 계획에 추가하라; `next build` 는 그 경계의 최종 검증으로 유지하라.

## severity: minor
- 위치(plan 섹션): Work Units, 병렬 실행 그룹
- 한 줄 설명: 단일 WU 라 파일 충돌은 없지만, WU-1 이 구현 변경과 테스트 생성, export 정책 결정까지 모두 포함해 실패 원인 분리가 약하다.
- 권고 수정: 병렬화는 하지 않되 순차 하위 단계로 "export/import feasibility 확인 → 색 분기 수정 → 테스트 추가 → build 검증" 을 나누고, 첫 단계 실패 시 helper 추출로 전환하는 stop condition 을 적어라.

## severity: minor
- 위치(plan 섹션): 검증 시나리오/QA 시나리오
- 한 줄 설명: skill/subagent 가 포함된 세션을 "고르거나 fixture 데이터로 시드" 한다고만 되어 있어 수동 QA 가 재현 가능하지 않다.
- 권고 수정: 평가자가 사용할 구체 fixture 조건을 적어라: `Skill`, `Task + subagent_type`, 일반 `Bash/Read`, HUMAN, ASSISTANT, same-tool merged run 을 한 세션에 포함시키고 라이트/다크 모드에서 각각 비교하도록 명시하라.

## severity: minor
- 위치(plan 섹션): Decision Log
- 한 줄 설명: "Open risks 없음" 이라는 clarify 의 낙관을 계획이 거의 그대로 받아들이지만, 테스트 방식 변경(export 및 TSX import) 은 색상 한 줄 변경과 별개의 tooling risk 다.
- 권고 수정: Decision Log 또는 Risk 섹션에 "제품 변경 risk 는 낮지만 테스트 접근 risk 는 있음" 으로 분리하고, alias/TSX/client-module import 실패 시 fallback 을 기록하라.
