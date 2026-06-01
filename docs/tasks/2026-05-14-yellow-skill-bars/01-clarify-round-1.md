# Clarify Round 1 — 2026-05-14-yellow-skill-bars

## 현재 이해 (코드 확인 기반)

- 대상 컴포넌트: `packages/web/src/components/dashboard/session-activity-ribbon.tsx` 의 `segmentVisuals()`. 현재 tool 이벤트는 종류 불문하고 모두 `bg-muted-foreground` (회색) 로 렌더된다 (42행).
- 타임라인 이벤트 모델: `packages/web/src/lib/timeline-events.ts` 의 `ToolEvent` 는 이미 `isSkillCall: boolean` 과 `isAgentCall: boolean` 플래그를 보유. 따라서 분류 로직은 추가 구현 없이 그대로 사용 가능.
- "skill/subagent 호출 메시지" 의 가장 자연스러운 정의는 `event.kind === 'tool' && (event.isSkillCall || event.isAgentCall)`. 이는 (1) `toolName === 'Skill'` 인 Tool 이벤트, (2) `Task`/`Agent` 계열 tool 호출에서 `getSubagentType()` 이 비-null 을 반환하는 이벤트, (3) HUMAN 메시지에 박힌 `<command-name>/foo</command-name>` 슬래시 커맨드를 합성한 가짜 `Skill` 이벤트를 모두 포함한다 (timeline-events.ts 98~112).
- 디자인 토큰: 이미 `event-list.tsx` (line 137~138) 와 `event-detail.tsx` (line 83~84) 가 동일한 분류로 **`bg-chart-4` = `oklch(0.78 0.13 85)` (앰버/노랑 톤, light·dark 양쪽 정의됨)** 를 사용하고 있다. 즉 디자인 시스템에 "skill/subagent 강조색" 규칙이 이미 존재하며, ribbon 만 이 규칙을 따르지 않고 있는 상태.

위를 종합하면 이 task 는 사실상 **"ribbon 에 기존 chart-4 강조 규칙을 일관 적용"** 으로 축약되며, 다음 4개만 확정되면 finalize 가능.

## 묶음 질문 (4개)

### Q1. 색 토큰: `bg-chart-4` 로 통일 (기존 event-list/event-detail 규칙) — 컨펌만?
- **묻는 이유**: `event-list.tsx` 와 `event-detail.tsx` 가 이미 skill/subagent 를 `bg-chart-4` (앰버/노랑) 로 구분하고 있다. 사용자가 "노란색" 이라 표현한 것은 이 톤을 가리킬 가능성이 매우 높음. 그대로 사용하면 디자인 일관성 + 토큰 추가 없이 끝남.
- **선택지**:
  - (A) `bg-chart-4` 그대로 사용 — 강력 추천 (디자인 일관성).
  - (B) 더 채도 높은 노랑이 필요 (예: 별도 `bg-warning` 또는 yellow-400 신규 토큰). 이 경우 어떤 화면 레퍼런스 때문에 필요한지 알려달라.

### Q2. 분류 정의: "skill/subagent 호출" = `isSkillCall || isAgentCall` 그대로?
- **묻는 이유**: 현행 플래그를 그대로 쓰면 (1) 명시적 `Skill` tool, (2) `Task`/Agent tool 의 서브에이전트 호출, (3) HUMAN 메시지에서 추출된 슬래시커맨드 합성 이벤트 — 세 가지가 모두 노란색이 된다. 이게 의도인지 확인.
- **선택지**:
  - (A) 셋 모두 노란색 (= 추천, 기존 event-list/event-detail 와 동일 분류).
  - (B) (3) 슬래시커맨드 합성 이벤트는 제외하고 싶음 — 이유 알려달라.
  - (C) skill 과 subagent 를 *서로 다른* 색으로 분리하고 싶음 — 그렇다면 subagent 쪽 색 후보를 알려달라.

### Q3. 적용 범위: ribbon 의 **모든 표시 상태** (단일 / 그룹 펼침 / 그룹 접힘 머지바) 에 일관 적용?
- **묻는 이유**: ribbon 은 동일 toolName 연속 호출을 접힌 머지바 (`bg-muted-foreground` 회색 막대) 로 표시하는데 (line 303), `buildTimelineGroups` 가 skill/subagent 는 절대 머지 그룹에 들어가지 않게 분기하고 있어 (timeline-events.ts line 162) — **현재 구조상 머지바는 skill/subagent 가 아닌 일반 tool 들의 묶음** 이다. 따라서 머지바 색은 회색 유지가 자연스럽다. 컨펌만 받으면 됨.
- **선택지**:
  - (A) 머지바는 회색 유지, 단일/그룹 펼침 안의 skill/subagent 만 노란색 — 추천.
  - (B) 머지바도 어떤 조건에서 노란색이 되어야 함. (그러려면 timeline-events 의 그룹핑 정책부터 손대야 함 — 어떤 케이스를 염두에 두고 있는지 알려달라.)

### Q4. 회귀 보호: 시각 회귀 테스트나 스토리북 케이스 필요?
- **묻는 이유**: 이 변경은 한 줄에 가까운 색 분기 추가지만, ribbon 의 호버 / 선택 outline / hover opacity 와 새 노란색의 가독성 조합은 시각적으로만 검증된다. `packages/web/src/lib/timeline-events.test.ts` 는 있지만, ribbon 컴포넌트의 시각 테스트 인프라가 있는지 알려달라.
- **선택지**:
  - (A) 시각 테스트 인프라 없음 — 수동 QA 만으로 충분.
  - (B) 스토리북/Chromatic 등 있음 — 케이스 추가 필요. (있다면 어느 경로?)
  - (C) 단위 테스트로 `segmentVisuals(skillToolEvent).bg === 'bg-chart-4'` 만 보장하면 됨.

## 가정 (사용자 답변 전까지 잠정)

- Q1 = A, Q2 = A, Q3 = A, Q4 = C 로 답이 모이면 곧바로 finalize 가능.
- 변경 범위: `segmentVisuals()` 안 tool 분기 한 곳 + 단위 테스트 1~2건. 새 디자인 토큰 추가 없음.
- 유스케이스는 1개 (사용자 목표: "Transcript 탭에서 한눈에 skill/subagent 호출 막대를 구분한다"). user-goal 수준.

## 메모 (메인 세션 참고)

질문이 모두 컨펌성이라 사용자가 "다 A" 또는 "그대로 진행" 으로 답하면 followup 라운드 생략하고 바로 `mode=finalize` 호출해도 됨. Q2 에서 (C) 분기 (skill 과 subagent 다른 색) 가 나오면 토큰 결정이 추가로 필요하므로 followup 1회 더 권장.
