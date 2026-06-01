# Context — 2026-05-14-yellow-skill-bars

## 관련 코드 위치

| # | path | lines | 역할 | 변경 가능성 |
|---|------|-------|------|-------------|
| 1 | packages/web/src/components/dashboard/session-activity-ribbon.tsx | 31-43 | `segmentVisuals()` — tool 분기를 `bg-chart-4` / `bg-muted-foreground` 로 갈라야 할 유일한 변경 지점 | 수정 |
| 2 | packages/web/src/components/dashboard/session-activity-ribbon.tsx | 283-307 | 머지바 head 렌더 (`bg-muted-foreground` 하드코딩) — 정의상 skill/subagent 미포함, 유지 | 참조 |
| 3 | packages/web/src/components/dashboard/event-list.tsx | 137-138 | 동일 분류 `isSkillCall || isAgentCall` → `bg-chart-4` 사용. 시각 일관성 기준점 | 참조 |
| 4 | packages/web/src/components/dashboard/event-detail.tsx | 83-84 | 동일 분류 → `bg-chart-4`. 두 번째 일관성 기준점 | 참조 |
| 5 | packages/web/src/lib/timeline-events.ts | 17-31 | `ToolEvent` 타입에 `isSkillCall` / `isAgentCall` 플래그 선언 | 참조 |
| 6 | packages/web/src/lib/timeline-events.ts | 70-112 | 플래그 생성 로직: `toolName === 'Skill'`, `agentType !== null`, HUMAN 슬래시커맨드 합성 Skill | 참조 |
| 7 | packages/web/src/lib/timeline-events.ts | 149-169 | `buildTimelineGroups` — line 162 에서 skill/subagent 를 머지 run 에서 제외 | 참조 |
| 8 | packages/web/src/lib/timeline-events.test.ts | 전체 (61 lines) | 기존 vitest 스위트. `segmentVisuals` 테스트의 거주지 후보 (export 추가 필요) | 신규 인접 |
| 9 | packages/web/src/app/globals.css | 46, 104, 156 | `--chart-4` / `--color-chart-4` 토큰 정의 (light/dark) — 이미 존재, 변경 불필요 | 참조 |
| 10 | packages/web/vitest.config.ts | 전체 | vitest 설정 — 신규 테스트가 자동 수집되는지 확인용 | 참조 |

## 관련 기존 ADR

관련 ADR 없음 — ADR-001 ~ ADR-012 는 모두 모노레포/백엔드/인증/데이터 결정으로, 웹 컴포넌트 색 토큰 적용 규칙에 대한 결정은 부재.

## Negative Space (만지지 말 것)

- `packages/web/src/components/dashboard/event-list.tsx`, `event-detail.tsx` — 이미 `bg-chart-4` 동일 분류로 일관됨. 손대지 말 것.
- `packages/web/src/lib/timeline-events.ts` 의 `isSkillCall` / `isAgentCall` 생성 로직 (line 70-112) 과 `buildTimelineGroups` 머지 분기 (line 162) — 분류 정의의 단일 원천. 색 task 에서 의미를 흔들면 회귀 위험.
- `packages/web/src/app/globals.css` 의 `--chart-4` 토큰 값 — 본 task 는 신규 토큰 도입 없이 기존 값 그대로 재사용. 톤 조정 금지.
- `session-activity-ribbon.tsx` 의 머지바 head (line 303 `bg-muted-foreground`) — clarify 가 명시적으로 회색 유지를 못박음.
- 호버/선택 outline/hover opacity (line 218-222 등) — 본 task 의 시각 상태 범위 밖.

## 폴더 구조 메모

- `packages/web/src/components/dashboard/` — Session/Project 대시보드 시각 컴포넌트. ribbon, event-list, event-detail 이 transcript 시각화 3 형제.
- `packages/web/src/lib/` — 클라이언트 측 도메인 로직. `timeline-events.ts` 가 메시지/툴 이벤트를 ribbon·event-list 가 함께 쓰는 `TimelineEvent` 형태로 정규화하는 단일 원천이며 같은 폴더에 vitest 테스트 거주.
- `packages/web/src/app/globals.css` — Tailwind v4 의 색 토큰 정의 (light/dark). `bg-chart-4` 클래스의 실체.

## 추가 컨텍스트

- 테스트 러너: vitest (`packages/web/vitest.config.ts`). `timeline-events.test.ts` 가 동일 패턴의 단위 테스트 레퍼런스.
- `segmentVisuals` 는 현재 `session-activity-ribbon.tsx` 내부에 비-export 로 선언되어 있어, 단위 테스트를 위해서는 export 가 필요하거나 별도 모듈로 추출이 필요. 신규 인접 테스트 파일 (예: `session-activity-ribbon.test.ts`) 거주지는 동일 dashboard 폴더가 자연스럽다.
