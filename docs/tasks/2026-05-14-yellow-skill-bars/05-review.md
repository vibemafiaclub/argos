## /review 결과 — `2026-05-14-yellow-skill-bars` task

### 변경 요약
- `packages/web/src/components/dashboard/session-ribbon-visuals.ts` 신규 — `segmentVisuals` helper 추출 (skill/subagent 분기 `bg-chart-4` 추가).
- `packages/web/src/components/dashboard/session-ribbon-visuals.test.ts` 신규 — 7 케이스 단위 테스트.
- `packages/web/src/components/dashboard/session-activity-ribbon.tsx` — 인라인 `segmentVisuals` 제거 + named import 로 치환, `type CSSProperties` import 제거.
- `packages/web/src/lib/timeline-events.test.ts` — `buildTimelineGroups` 회귀 테스트 추가 (skill/subagent 가 toolRun merge 에 안 섞임).
- `docs/adr.md` — ADR-023, ADR-024 추가.

### ADR-023 (`bg-chart-4` 단일 토큰) 일관성
- ✅ `session-ribbon-visuals.ts:15-17` 의 조건 `event.kind === 'tool' && (event.isSkillCall || event.isAgentCall)` 가 `event-list.tsx:137-138`, `event-detail.tsx:83-84` 와 **완전히 동일한 술어**다. 세 컴포넌트가 같은 분류에 같은 토큰을 쓴다는 결정과 부합.
- ✅ 신규 토큰(`bg-warning` 등) 미도입. ADR 본문대로.
- ⚠️ **잠재 불일치 1건**: `session-activity-ribbon.tsx:291` 의 collapsed merged-run "hat" 은 `bg-muted-foreground` 하드코드. 현재 `buildTimelineGroups` (timeline-events.ts:162) 가 `!event.isSkillCall && !event.isAgentCall` 만 merge 후보로 받으므로 색은 항상 일치하지만, helper(`segmentVisuals`) 와 별개 경로라 미래에 merge 조건이 완화되면 즉시 ADR-023 위반이 된다. `bg` 를 `segmentVisuals(group.items[0].event).bg` 로 유도하거나, 최소한 "merge 후보는 skill/agent 가 아님이 보장됨" 코멘트가 있으면 회귀 가드가 단단해진다.

### ADR-024 (컴포넌트 인접 `.ts` helper + `import type`) 일관성
- ✅ `session-ribbon-visuals.ts` 가 `packages/web/src/components/dashboard/` 에 거주 (lib/ 아님).
- ✅ `import type { CSSProperties } from 'react'` (line 1), `import type { TimelineEvent } from '../../lib/timeline-events'` (line 2) — 런타임 import 0, alias 미사용 → vitest 가 react 를 끌어오지 않음.
- ✅ `session-ribbon-visuals.test.ts` 도 `import type { ToolEvent, MessageEvent }` (line 2) + `segmentVisuals` 만 값으로 import (line 3). ADR 본문의 "helper 자체 외 런타임 import 없음" 규약과 부합.
- ✅ `vitest.config.ts` 무변경 — `src/**/*.test.ts` include 패턴이 `components/dashboard/` 하위까지 자동 수집.

### 코드 품질 이슈
1. **(nit, lint)** `session-activity-ribbon.tsx:31-32` — `segmentVisuals` 제거 직후 빈 줄 2개 남음. 단일 빈 줄로 정리 권장.
2. **(견고함)** 위에 적은 merged-hat 색 하드코드 — 코멘트 또는 helper 위임으로 단일 출처 보장.
3. **(테스트, 강화 여지)** `timeline-events.test.ts` 의 `buildTimelineGroups` 케이스는 "Skill 이 toolRun 안에 안 들어간다" 만 단언. 보너스로 `groups.length === 3` (Bash run, Skill single, Bash run) 과 첫·셋째 group 이 `kind: 'toolRun'` 임을 단언하면 "Skill 이 두 Bash run 을 분리한다" 라는 핵심 행동까지 못박힌다.
4. **(테스트, mock 정확성)** `session-ribbon-visuals.test.ts` 의 case 3 "isSkillCall && isAgentCall" 은 실제로는 발생하지 않는 조합이다 (timeline-events.ts:73,75 에서 한쪽은 항상 false). 방어적 단언이라 유지해도 무방하지만, 케이스 이름 옆에 "방어적 분기" 라고 표기해두면 reader 가 "현실 시나리오로 오해" 하지 않는다.

### 부수 점검
- ADR-023 본문이 인용한 라인 번호 (`event-list.tsx:137-138`, `event-detail.tsx:83-84`) 모두 실제 코드와 정확히 일치.
- ADR-024 본문이 인용한 `vitest.config.ts` 의 alias 부재 / include 패턴 단일 원천 — 실제와 일치 (8줄 짜리 config, 알리아스 플러그인 없음).
- `session-activity-ribbon.tsx` 가 여전히 `@/lib/timeline-events` alias 를 쓰는 점은 ADR-024 위반 아님 (ADR-024 는 helper `.ts` 와 그 test 만 대상).

### 종합
ADR-023, ADR-024 와 코드가 완전히 정합. 차단 사유 없음. 머지 전 권장 조치는 (1) 빈 줄 1개 정리, (2) merged-hat 색의 단일 출처화(또는 1줄 코멘트), (3) `buildTimelineGroups` 테스트에 group 개수·종류 단언 보강 — 셋 다 옵션이며 ADR 준수 자체에는 영향 없음.
