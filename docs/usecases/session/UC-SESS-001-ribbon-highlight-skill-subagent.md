---
id: UC-SESS-001
name: Transcript ribbon 에서 skill / subagent 호출 구간을 한눈에 식별한다
level: user-goal
scope: Argos 웹 대시보드 Session Transcript 화면 (session-activity-ribbon + event-list + event-detail)
primary_actor: 세션 transcript 를 들여다보는 프로젝트 OWNER 또는 MEMBER
status: active
includes: []
related: []
e2e: []
coverage_status: pending
sources:
  - docs/tasks/2026-05-14-yellow-skill-bars/01-clarify.md
  - docs/tasks/2026-05-14-yellow-skill-bars/03-plan.md
last_reviewed: 2026-05-14
---

## 이해관계자와 관심사

- **세션을 분석하는 사용자**: 긴 세션 안에서 "어디서 skill / subagent 가 호출됐는가" 를 스크롤·클릭 없이 ribbon 한 줄에서 파악하고 싶다.
- **디자인 시스템 (암묵적 stakeholder)**: 같은 분류는 ribbon / event-list / event-detail 어디서 보여지든 같은 색이어야 한다.
- **개발자**: 분류 로직을 새로 만들지 않고 기존 `isSkillCall / isAgentCall` 플래그를 그대로 재사용해, 분류의 단일 원천이 `timeline-events.ts` 에 남아있기를 원한다.

## 사전조건

- P1. 사용자가 인증되어 있고 해당 세션 transcript 를 볼 권한 (프로젝트 OWNER 또는 MEMBER) 을 가진다.
- P2. 세션 이벤트 데이터가 백엔드에서 로드 완료되어 timeline 그룹화가 가능한 상태다.

## 트리거

- T1. 사용자가 대시보드에서 특정 Claude 세션 페이지 (transcript 가 포함된 화면) 를 연다.

## 성공 보장 (Postconditions)

- G1. ribbon 의 segment 들 중, `event.kind === 'tool' && (event.isSkillCall || event.isAgentCall)` 분류에 해당하는 segment 는 `bg-chart-4` (앰버) 배경으로 렌더된다.
- G2. 위 분류를 만족하지 않는 tool 이벤트의 segment 는 `bg-muted-foreground` (회색) 배경으로 렌더된다.
- G3. 같은 분류의 이벤트가 event-list 와 event-detail 에서도 동일한 `bg-chart-4` 강조로 보인다 (시각 일관성).
- G4. 비-tool 이벤트 (HUMAN / ASSISTANT 메시지) 의 segment 색 분기는 변경 전과 동일하다 (HUMAN → `bg-brand`, ASSISTANT → `bg-brand-2`).
- G5. 동일 toolName 연속 호출을 묶은 머지바 head 의 배경은 `bg-muted-foreground` 회색을 유지한다.

## 최소 보장

- M1. 분류 로직 자체 (`isSkillCall`, `isAgentCall` 플래그의 정의·생성 위치) 는 변경되지 않는다 — 어떤 이벤트가 skill/subagent 로 간주되는가는 task 전후 동일.
- M2. skill / subagent 는 timeline 그룹화 단계에서 머지 그룹의 child 로 들어가지 않는다 — 즉 머지바 head 색 결정 경로에는 skill/subagent 이벤트가 도달하지 않는다.

## 주 성공 시나리오

1. (User · UI) 사용자가 대시보드에서 특정 세션의 transcript 페이지를 연다.
2. (System · UI) ribbon 이 로드된 세션 이벤트 데이터를 받아 timeline 그룹 (단일 이벤트 segment 와 동일 toolName 머지 그룹) 을 화면에 배치한다.
3. (System · UI) 각 segment 에 대해 분류를 평가한다 — `event.kind === 'tool' && (event.isSkillCall || event.isAgentCall)` 인 이벤트의 막대에는 `bg-chart-4` 클래스를, 그 외 tool 이벤트의 막대에는 `bg-muted-foreground` 클래스를 부여한다.
4. (System · UI) HUMAN 메시지 segment 는 `bg-brand`, ASSISTANT 메시지 segment 는 `bg-brand-2` 클래스로 렌더한다 (기존 분기 유지).
5. (System · UI) 동일 toolName 연속 호출을 묶은 머지바 head 는 `bg-muted-foreground` 회색으로 렌더한다.
6. (User · UI) 사용자가 ribbon 을 훑으며 노란색 (`bg-chart-4`) 막대 위치만으로 skill / subagent 호출 시점을 식별한다.

## 확장 (Extensions)

- 3a. 이벤트가 HUMAN 메시지에서 추출된 슬래시커맨드 합성 `Skill` 이벤트인 경우 (`isSkillCall === true`):
  - 3a.1. (System · UI) 다른 skill 이벤트와 동일하게 `bg-chart-4` 로 렌더한다 — 출처 (명시적 toolName vs. 합성 이벤트) 와 무관하게 같은 색. → 주 시나리오 4 단계로 복귀.
- 3b. 그룹이 펼쳐진 (expand) 상태로 내부 segment 들이 개별 렌더되는 경우:
  - 3b.1. (System · UI) 각 내부 segment 마다 동일 분기를 적용해 skill / subagent 만 `bg-chart-4` 로 칠하고, 일반 tool 은 `bg-muted-foreground` 회색을 유지한다. → 주 시나리오 4 단계로 복귀.

## 기술/데이터 변형

- V1. skill / subagent 의 출처 차이는 색 결정에 영향을 주지 않는다. 다음 세 출처 모두 `isSkillCall || isAgentCall` 을 만족하므로 동일하게 `bg-chart-4`:
  - (1) 명시적 `toolName === 'Skill'` 이벤트
  - (2) `Task` / Agent tool 호출에서 `getSubagentType()` 이 비-null 인 이벤트
  - (3) HUMAN 메시지의 `<command-name>` 에서 합성된 가짜 `Skill` 이벤트
- V2. ASSISTANT 메시지 segment 의 `flex-grow` 는 `Math.max(outputTokens, 1)` 로 결정된다 — `outputTokens === 0` 일 때도 최소 grow=1 을 보장 (회귀 없음).

## 참고

- `packages/web/src/components/dashboard/session-activity-ribbon.tsx` — ribbon 컴포넌트 (segment 렌더링 + 머지바 head).
- `packages/web/src/components/dashboard/session-ribbon-visuals.ts` — `segmentVisuals` 순수 helper (색 분기의 단일 원천).
- `packages/web/src/components/dashboard/session-ribbon-visuals.test.ts` — `segmentVisuals` 의 7 케이스 단위 테스트 (skill / subagent / 일반 tool / HUMAN / ASSISTANT / ASSISTANT outputTokens=0 / 방어적 둘 다 true).
- `packages/web/src/components/dashboard/event-list.tsx` (line 137-138), `packages/web/src/components/dashboard/event-detail.tsx` (line 83-84) — 동일 분류·동일 `bg-chart-4` 강조 사용처. 시각 일관성의 기준점.
- `packages/web/src/lib/timeline-events.ts` — `isSkillCall` / `isAgentCall` 플래그 정의, `buildTimelineGroups` 의 skill/subagent 머지 제외 분기.
- ADR-013 (`bg-chart-4` 단일 토큰), ADR-014 (컴포넌트 인접 `.ts` helper + `import type`) — `docs/adr.md`.
