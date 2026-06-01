# Clarify — 2026-05-14-yellow-skill-bars

## 요구사항 한 줄 요약

Session Activity Ribbon 에서 skill / subagent 호출 이벤트 막대를 기존 회색 대신 `bg-chart-4` (앰버/노랑) 로 칠해, event-list / event-detail 과 동일한 강조 규칙을 ribbon 에도 일관 적용한다.

## 배경/동기

- 현재 ribbon (`session-activity-ribbon.tsx` `segmentVisuals()`) 은 tool 이벤트 종류와 무관하게 모두 `bg-muted-foreground` (회색) 로 렌더한다. 그래서 transcript 를 빠르게 훑을 때 어디서 skill / subagent 가 호출됐는지 한눈에 파악할 수 없다.
- 같은 분류 (`isSkillCall || isAgentCall`) 에 대해 event-list (`event-list.tsx` line 137~138) 와 event-detail (`event-detail.tsx` line 83~84) 은 이미 `bg-chart-4` 로 강조하고 있다. 디자인 시스템 토큰은 이미 정의되어 있고, ribbon 만 이 규칙을 따르지 않는 상태.
- 따라서 본 task 는 신규 디자인 결정이 아니라 **기존 강조 규칙의 ribbon 일관 적용** 이다.

## 명시적 범위 (In scope)

- `packages/web/src/components/dashboard/session-activity-ribbon.tsx` 의 `segmentVisuals()` 안 tool 분기 한 곳 수정.
- 분류 기준: `event.kind === 'tool' && (event.isSkillCall || event.isAgentCall)` 인 이벤트의 막대 배경색을 `bg-chart-4` 로 변경.
- `segmentVisuals()` 에 대한 단위 테스트 추가 (skill 이벤트 / subagent 이벤트 / 일반 tool 이벤트 / 비-tool 이벤트 각각의 색 분기 보장).

## 명시적 비범위 (Out of scope)

- 새 디자인 토큰 추가 (별도 `bg-warning`, yellow-400 등). 기존 `bg-chart-4` 그대로 재사용.
- skill 과 subagent 를 서로 다른 색으로 분리하기 — 둘 다 같은 노랑.
- 접힌 머지바(`buildTimelineGroups` 가 만든 same-tool 연속 묶음) 의 색 변경 — `bg-muted-foreground` 회색 유지. (애초에 skill/subagent 는 `buildTimelineGroups` 의 분기에 의해 머지 그룹에 들어가지 않으므로 머지바는 정의상 일반 tool 묶음만 표현한다.)
- 호버/선택/outline 등 ribbon 의 다른 시각 상태 변경.
- event-list / event-detail 측 변경 — 이미 동일 분류로 `bg-chart-4` 를 쓰고 있어 손댈 필요 없음.
- 스토리북 / 시각 회귀(Chromatic 등) 도입 — 본 task 에서는 단위 테스트만.

## 성공 기준

1. `event.kind === 'tool' && (event.isSkillCall || event.isAgentCall)` 인 이벤트에 대해 `segmentVisuals()` 가 `bg-chart-4` 를 포함한 클래스를 반환한다.
2. 위 조건을 만족하지 않는 tool 이벤트 (`isSkillCall === false && isAgentCall === false`) 는 기존 `bg-muted-foreground` 를 유지한다.
3. 비-tool 이벤트(`kind !== 'tool'`) 의 색 분기는 변경 전과 동일하다 (회귀 없음).
4. 접힌 머지바 (그룹 head 가 머지 표현일 때) 의 배경은 `bg-muted-foreground` 로 유지된다.
5. `segmentVisuals` 단위 테스트가 위 1~4 를 모두 커버하며 통과한다.
6. 시각적으로, transcript 탭에서 skill / subagent 호출 막대가 다른 tool 막대와 명확히 구분되어 보인다 (수동 QA).

## 유스케이스 (Cockburn 형식)

### UC-DRAFT-2026-05-14-yellow-skill-bars-1: Transcript ribbon 에서 skill / subagent 호출 구간을 한눈에 식별한다

> 도메인 후보: SESS (Claude 세션/이벤트 도메인 — `session-activity-ribbon` 은 세션 transcript 의 시각화 컴포넌트)
> 카탈로그 매핑 후보: 신규 (현재 `docs/usecases/session/` 폴더 미존재; 첫 SESS UC 가 될 가능성)

- **범위 (Scope)**: Argos 웹 대시보드의 Session Transcript 화면 (`session-activity-ribbon` + `event-list` + `event-detail` 의 시각 일관성 단위).
- **수준 (Level)**: user-goal
- **주 행위자 (Primary Actor)**: Argos 대시보드에서 특정 Claude 세션의 transcript 를 들여다보는 사용자 (보통 프로젝트 OWNER 또는 MEMBER).
- **이해관계자와 관심사 (Stakeholders & Interests)**:
  - 사용자: 긴 세션 안에서 "어디서 skill / subagent 가 호출됐는가" 를 스크롤·클릭 없이 ribbon 한 줄에서 파악하고 싶다.
  - 디자인 시스템 (암묵적 stakeholder): 같은 분류는 어디서 보여지든 같은 색이어야 한다 (event-list / event-detail / ribbon 일관성).
  - 개발자: 분류 로직을 추가하지 않고 기존 `isSkillCall / isAgentCall` 플래그를 그대로 재사용하기를 원한다 (유지보수성).
- **사전조건 (Preconditions)**:
  - 사용자가 인증되어 있고 해당 세션 transcript 를 볼 권한을 가진다.
  - 세션 이벤트 데이터가 로드되어 `buildTimelineGroups()` 가 그룹을 생성한 상태.
- **성공 보장 (Success Guarantees / Postconditions)**:
  - ribbon 의 segment 들 중, 분류상 skill / subagent 호출에 해당하는 segment 는 `bg-chart-4` (앰버/노랑) 배경으로 렌더된다.
  - 같은 분류의 이벤트가 event-list 와 event-detail 에서도 동일한 `bg-chart-4` 강조로 보인다 (이미 충족, 회귀 없음).
- **최소 보장 (Minimal Guarantees)**:
  - 분류 로직 자체는 변경되지 않는다 (`isSkillCall`, `isAgentCall` 플래그의 정의·생성 위치는 그대로). 즉, 색만 바뀌고 어떤 이벤트가 skill/subagent 로 간주되는가는 task 전후 동일.
  - 비-tool 이벤트, 그리고 skill/subagent 가 아닌 tool 이벤트의 시각 표현은 변경 전과 동일.
  - 접힌 머지바의 시각 표현은 변경 전과 동일 (`bg-muted-foreground`).
- **트리거 (Trigger)**: 사용자가 대시보드에서 특정 Claude 세션 페이지 (transcript 가 포함된 화면) 를 연다.
- **주 성공 시나리오 (Main Success Scenario)**:
  1. (User · UI) 사용자가 대시보드에서 특정 세션의 transcript 페이지를 연다.
  2. (System · UI) 페이지가 세션 이벤트 데이터를 로드하고 `buildTimelineGroups()` 로 그룹을 생성한다.
  3. (System · UI) `SessionActivityRibbon` 이 각 그룹/이벤트마다 `segmentVisuals()` 를 호출해 막대 배경 클래스를 결정한다.
  4. (System · UI) `segmentVisuals()` 는 `event.kind === 'tool' && (event.isSkillCall || event.isAgentCall)` 인 이벤트에 대해 `bg-chart-4` 클래스를, 그 외 tool 이벤트에 대해 `bg-muted-foreground` 클래스를 반환한다.
  5. (System · UI) ribbon 이 결정된 클래스로 막대들을 렌더한다 — skill/subagent 호출 구간은 노랑, 일반 tool 은 회색, 비-tool 은 기존 분기 그대로.
  6. (User · UI) 사용자가 ribbon 을 훑으며 노란색 막대 위치만으로 skill/subagent 호출 시점을 식별한다.
- **확장 (Extensions)**:
  - 4a. 이벤트가 동일 toolName 연속 호출이라 머지 그룹의 head 로 표현되는 경우 (skill/subagent 는 정의상 머지되지 않으므로 이 분기는 일반 tool 에만 해당): (System · UI) `bg-muted-foreground` 회색을 그대로 유지하며 머지바로 렌더한다. → 주 시나리오 5 단계로 복귀.
  - 4b. 이벤트가 HUMAN 메시지에서 추출된 슬래시커맨드 합성 `Skill` 이벤트인 경우 (`isSkillCall === true`): (System · UI) 다른 skill 이벤트와 동일하게 `bg-chart-4` 로 렌더한다 — 명시적 분리 없음. → 주 시나리오 5 단계로 복귀.
  - 4c. 그룹이 펼쳐진(expand) 상태로 내부 segment 들이 개별 렌더되는 경우: (System · UI) 각 내부 segment 마다 동일 분기를 적용해 skill/subagent 만 노랑으로 칠한다. → 주 시나리오 5 단계로 복귀.
- **기술/데이터 변형 (Technology & Data Variations)**:
  - V1. skill / subagent 의 출처 차이는 색 결정에 영향을 주지 않는다. 즉 (1) 명시적 `toolName === 'Skill'` 이벤트, (2) `Task` / Agent tool 호출에서 `getSubagentType()` 이 비-null 인 이벤트, (3) HUMAN 메시지의 `<command-name>` 에서 합성된 가짜 `Skill` 이벤트 — 셋 모두 `isSkillCall || isAgentCall` 을 만족하므로 동일하게 노랑.

## 가정 (Assumptions)

- 사용자가 말한 "노란색" 은 디자인 시스템에 이미 정의된 `--chart-4` 토큰 (라이트: `oklch(0.78 0.13 85)`, 다크 대응 정의 존재) 을 가리키며, 별도 톤 조정·신규 토큰은 필요하지 않다.
- ribbon 의 호버/선택/outline 등 다른 시각 상태와 `bg-chart-4` 의 가독성 조합은 event-list / event-detail 에서 이미 검증되어 있어 ribbon 에서도 추가 조정 없이 동작한다 (수동 QA 로 확인).
- skill / subagent 분류의 단일 원천은 `timeline-events.ts` 의 `isSkillCall` / `isAgentCall` 플래그이며, 이 task 에서는 이를 변경하지 않는다.

## 미해결 위험 (Open risks)

- 없음 — 본 task 는 색 토큰 한 곳만 분기하는 변경이고, 분류 로직은 이미 다른 두 컴포넌트(event-list, event-detail)에서 동일 형태로 사용되고 있어 의미·시각 양면에서 검증된 상태.

## 관련 기존 문서

- `packages/web/src/components/dashboard/session-activity-ribbon.tsx` — 본 task 의 유일한 변경 지점 (`segmentVisuals()`).
- `packages/web/src/components/dashboard/event-list.tsx` (line 137~138) — 이미 `bg-chart-4` 로 skill/subagent 강조 중. 시각 일관성의 기준점.
- `packages/web/src/components/dashboard/event-detail.tsx` (line 83~84) — 동일 분류·동일 토큰 사용. 참조용.
- `packages/web/src/lib/timeline-events.ts` — `isSkillCall` / `isAgentCall` 플래그 정의(line 98~112), `buildTimelineGroups` 가 skill/subagent 를 머지 그룹에서 제외하는 분기(line 162). 본 task 에서는 변경하지 않음.
- `packages/web/src/lib/timeline-events.test.ts` — 기존 단위 테스트 위치. `segmentVisuals` 테스트는 동일 디렉터리에 신규 또는 이웃 테스트로 추가.

## 메모 (메인 세션 참고)

- 변경 surface 가 매우 작으므로 (한 줄 분기 + 단위 테스트 1 파일) implement / evaluate 는 한 번에 통과할 가능성이 높다.
- 본 task 의 UC 는 SESS 도메인의 첫 UC 후보. `new-task-usecase` 승격 시 `docs/usecases/session/` 폴더가 신규 생성될 수 있다는 점을 인지할 것.
- e2e 는 본 task 범위가 아님 (`coverage_status: pending`).
