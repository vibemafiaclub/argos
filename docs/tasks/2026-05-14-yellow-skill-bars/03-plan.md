# Plan — 2026-05-14-yellow-skill-bars

## 개요

Session Activity Ribbon 의 `segmentVisuals()` 가 tool 이벤트를 무조건 회색(`bg-muted-foreground`)으로 칠하는 분기를, skill / subagent 호출(`isSkillCall || isAgentCall`)일 때만 `bg-chart-4` (앰버) 로 분기시키도록 한 줄 수정. event-list / event-detail 이 이미 쓰는 강조 규칙을 ribbon 에 일관 적용한다. 회귀 방지를 위해 `segmentVisuals` 를 `packages/web/src/components/dashboard/session-ribbon-visuals.ts` 로 추출(ribbon 인접 위치, 순수 `.ts`, JSX/React-runtime 의존 없음)한 뒤 인접 vitest 단위 테스트로 케이스(skill / subagent / 일반 tool / 비-tool)를 보장한다.

## 아키텍처/접근 선택

- **선택지 A (채택)**: `segmentVisuals` 를 `packages/web/src/components/dashboard/session-ribbon-visuals.ts` 로 추출(순수 `.ts`, ribbon 과 같은 폴더). ribbon `.tsx` 는 이 함수를 같은 폴더 상대경로(`./session-ribbon-visuals`) 로 named import. 단위 테스트는 `packages/web/src/components/dashboard/session-ribbon-visuals.test.ts` 에 거주.
- 선택지 B (거절): `segmentVisuals` 를 ribbon `.tsx` 안에 남기고 `export` 만 추가, 테스트는 ribbon 인접 `.test.ts` 에 거주.
  - 거절 사유: (1) `packages/web/vitest.config.ts` 가 `defineConfig` 만 사용하고 path alias(`@/*`) 해석 플러그인(`vite-tsconfig-paths` 등) 이 없다. ribbon `.tsx` 의 `@/lib/timeline-events`, `@/lib/format` import 가 vitest 에서 resolve 실패한다. (2) ribbon 모듈 top-level 이 `react` (`useMemo`, `useState`, `useRef`) 와 `'use client'` 디렉티브를 평가시키며, Node env 에서 동작은 가능하나 import 의 평가 비용·향후 부수효과 추가시의 회귀 위험을 만든다. → A 가 더 안정적.
- 선택지 C (거절): helper 를 `packages/web/src/lib/` 에 둠.
  - 거절 사유: ribbon 전용 Tailwind/style 결정이 도메인 lib 처럼 보이게 되어, event-list/detail 등이 재사용하면서 시각 결합도가 lib 전반으로 퍼질 위험. helper 의 소유권은 ribbon 컴포넌트에 머물러야 함 (round 2 critique 반영).
- 선택지 D (거절): react-testing-library 로 ribbon 을 렌더하여 DOM 클래스 단언. → jsdom, @testing-library/react 의존 + vitest config 환경 전환 필요. clarify 의 비범위.
- 채택 사유: A 는 vitest config 변경 0, 신규 의존 0, 테스트 입력이 pure TS function 으로 가장 단순. helper 가 ribbon 폴더에 거주하여 "ribbon 전용" 소유권이 파일 위치로 명시되고, 동시에 vitest include `src/**/*.test.ts` 가 `components/dashboard/` 하위도 수집하므로 위치 변경에 따른 tooling 추가 비용 없음.

## Work Units

### WU-1: `segmentVisuals` 순수 helper 추출 + 색 분기 추가 + 단위 테스트

- **수정/생성 파일** (절대 경로):
  - `/Users/choesumin/Desktop/dev/vmc/argos/.claude/worktrees/twinkly-baking-finch/packages/web/src/components/dashboard/session-ribbon-visuals.ts` (생성, 순수 helper, ribbon 인접)
  - `/Users/choesumin/Desktop/dev/vmc/argos/.claude/worktrees/twinkly-baking-finch/packages/web/src/components/dashboard/session-ribbon-visuals.test.ts` (생성, vitest 단위 테스트)
  - `/Users/choesumin/Desktop/dev/vmc/argos/.claude/worktrees/twinkly-baking-finch/packages/web/src/components/dashboard/session-activity-ribbon.tsx` (수정: 내부 `segmentVisuals` 삭제, `./session-ribbon-visuals` 상대경로 named import 로 교체)
  - `/Users/choesumin/Desktop/dev/vmc/argos/.claude/worktrees/twinkly-baking-finch/packages/web/src/lib/timeline-events.test.ts` (수정: CP-4(b) 의 skill/subagent 머지 제외 회귀 케이스 1 추가. `timeline-events.ts` 자체는 수정하지 않음.)
- **입력 계약**:
  - `segmentVisuals(event: TimelineEvent): { bg: string; style: CSSProperties }` 의 단일 인자 `event`.
  - 분기 키: `event.kind === 'tool'` 그리고 그 내부에서 `event.isSkillCall || event.isAgentCall`.
  - 모듈 import 라인은 `import type { TimelineEvent } from '../../lib/timeline-events'` 와 `import type { CSSProperties } from 'react'` 두 개의 **type-only** import 만 사용. 런타임 import 없음. TypeScript 의 type-only import 는 JS emit 단계에서 제거되며, 값으로 오용하면 `isolatedModules: true` (packages/web/tsconfig.json 확인됨) 하에서 컴파일 에러로 즉시 드러난다. 런타임 import 부재 자체는 vitest 실행이 react 런타임을 끌어오지 않는 것으로 간접 확인된다 (CP-1 stop condition).
- **출력 계약**:
  - tool & (skill||subagent) → `bg === 'bg-chart-4'`, `style.flex === '0 0 8px'`.
  - tool & 그 외 → `bg === 'bg-muted-foreground'`, `style.flex === '0 0 8px'` (기존 동일).
  - HUMAN message → `bg === 'bg-brand'`, `style.flex === '0 0 3px'` (기존 동일).
  - ASSISTANT message → `bg === 'bg-brand-2'`, `style.flex === `${Math.max(outputTokens, 1)} 0 6px`` (기존 동일).
  - pure function: 외부 mutation, IO, console 호출 모두 없음. 머지바 head 의 `bg-muted-foreground` 하드코딩(ribbon line 303) 은 변경하지 않음.
- **의존**: 없음 (단일 work unit).
- **검증 방법**:
  - `pnpm --filter @argos/web exec vitest run src/components/dashboard/session-ribbon-visuals.test.ts` 통과.
  - `pnpm --filter @argos/web exec vitest run` 전체 스위트 회귀 0.
  - `pnpm --filter @argos/web exec tsc --noEmit` 타입체크 통과 (특히 `event.kind === 'tool'` narrowing 인정 여부).
  - `pnpm --filter @argos/web build` Next 프로덕션 빌드 통과 (ribbon 의 import 변경이 빌드 그래프에 무해함을 최종 확인).
  - `pnpm --filter @argos/web lint` 통과 (`packages/web/package.json` 의 `lint` 스크립트 `eslint src` 가 존재함을 확인 완료).
  - 수동 QA 는 evaluate-qa 단계에서 진행.
- **예상 LOC**: helper ~18 LOC, 테스트 ~80 LOC, ribbon `.tsx` 의 함수 삭제 + import 추가 ~-10/+2 LOC.

#### 구현 세부 (4 하위 체크포인트)

1. **CP-1 (helper 생성)**: `packages/web/src/components/dashboard/session-ribbon-visuals.ts` 신규 작성.

   ```ts
   import type { CSSProperties } from 'react'
   import type { TimelineEvent } from '../../lib/timeline-events'

   export function segmentVisuals(event: TimelineEvent): {
     bg: string
     style: CSSProperties
   } {
     if (event.kind === 'message' && event.role === 'HUMAN') {
       return { bg: 'bg-brand', style: { flex: '0 0 3px' } }
     }
     if (event.kind === 'message' && event.role === 'ASSISTANT') {
       const grow = Math.max(event.outputTokens, 1)
       return { bg: 'bg-brand-2', style: { flex: `${grow} 0 6px` } }
     }
     if (event.kind === 'tool' && (event.isSkillCall || event.isAgentCall)) {
       return { bg: 'bg-chart-4', style: { flex: '0 0 8px' } }
     }
     return { bg: 'bg-muted-foreground', style: { flex: '0 0 8px' } }
   }
   ```

   - Stop condition: `tsc --noEmit` 통과해야 다음 CP 로 진행. type narrowing 실패시 보강.

2. **CP-2 (ribbon 수정)**: `session-activity-ribbon.tsx`
   - 기존 line 31-43 의 함수 정의(`function segmentVisuals(...)`) 를 통째로 삭제.
   - 상단 import 블록(line 3-9 부근)에 `import { segmentVisuals } from './session-ribbon-visuals'` 추가 (같은 폴더 상대경로).
   - 함수 호출부는 그대로 (named import 로 같은 식별자 사용).
   - `import type { CSSProperties } from 'react'` 는 ribbon 자체가 더 이상 직접 쓰지 않으면 제거 (사용처 grep 후 결정).
   - Stop condition: `tsc --noEmit` + `pnpm --filter @argos/web build` 통과.

3. **CP-3 (테스트 작성)**: `packages/web/src/components/dashboard/session-ribbon-visuals.test.ts`
   - **값 import 는 `./session-ribbon-visuals` 의 `segmentVisuals` 단 하나로 제한**. 타입은 `import type { ToolEvent, MessageEvent } from '../../lib/timeline-events'` 로 type-only import. 이렇게 해야 vitest 가 `timeline-events.ts` 런타임 모듈을 평가하지 않아 helper 추출의 목적이 유지된다. (round 2 critique minor #4 반영.)
   - `@/*` alias 미사용 (vitest config 에 resolver 없음).
   - 헬퍼: `makeTool(overrides: Partial<ToolEvent>): ToolEvent`, `makeMessage(overrides: Partial<MessageEvent>): MessageEvent`. baseline 필드는 실제 `ToolEvent` / `MessageEvent` 타입의 **모든 required 필드** 를 채워야 하며 `as any` / `as unknown as ...` 등 타입 우회 금지.
     - `ToolEvent` baseline: `kind: 'tool'`, `toolName: 'Bash'`, `toolInput: null`, `content: ''`, `durationMs: null`, `timestamp: '2026-05-14T00:00:00.000Z'`, `sequence: 0`, `isSkillCall: false`, `skillName: null`, `isAgentCall: false`, `agentType: null`.
     - `MessageEvent` baseline: `kind: 'message'`, `role: 'HUMAN'`, `content: ''`, `timestamp: '2026-05-14T00:00:00.000Z'`, `sequence: 0`, `outputTokens: 0`, `inputTokens: 0`, `estimatedCostUsd: 0`, `model: null`.
   - 케이스:
     - **case 1 (skill)**: `makeTool({ toolName: 'Skill', isSkillCall: true, skillName: 'foo' })` → `bg === 'bg-chart-4'`, `style.flex === '0 0 8px'`.
     - **case 2 (subagent)**: `makeTool({ toolName: 'Task', isAgentCall: true, agentType: 'Explore' })` → `bg === 'bg-chart-4'`.
     - **case 3 (둘 다)**: `makeTool({ isSkillCall: true, isAgentCall: true })` → `bg === 'bg-chart-4'` (OR 분기 가드).
     - **case 4 (일반 tool)**: `makeTool({ toolName: 'Bash' })` → `bg === 'bg-muted-foreground'`.
     - **case 5 (HUMAN)**: `makeMessage({ role: 'HUMAN' })` → `bg === 'bg-brand'`, `style.flex === '0 0 3px'`.
     - **case 6 (ASSISTANT)**: `makeMessage({ role: 'ASSISTANT', outputTokens: 100 })` → `bg === 'bg-brand-2'`, `style.flex === '100 0 6px'`.
     - **case 7 (ASSISTANT, outputTokens 0)**: → `style.flex === '1 0 6px'` (grow=max(0,1)=1 보장).
   - Stop condition: 모든 케이스 통과.

4. **CP-4 (회귀 + 머지 분류 가드)**: 성공 기준 4(접힌 머지바 head 회색 유지) 는 ribbon `.tsx` line 303 의 하드코딩이므로 `segmentVisuals` 단위 테스트로는 직접 검증되지 않는다. 두 갈래로 보강:
   - (a) **정적 grep 가드**: implement worker 가 `rg "bg-muted-foreground" packages/web/src/components/dashboard/session-activity-ribbon.tsx` 결과에서 line 303 의 머지바 head 가 그대로 남아 있음을 확인하고 final commit 직전에 git diff 가 그 라인을 건드리지 않음을 확인.
   - (b) **분류 회귀 테스트**: 기존 `packages/web/src/lib/timeline-events.test.ts` 에 1 케이스 추가 — 동일 toolName 의 연속 호출 중 하나가 `isSkillCall=true` 면 `buildTimelineGroups` 의 결과 그룹에 그 이벤트가 merged item 으로 포함되지 않음을 단언. (성공 기준 4 의 전제 "skill/subagent 는 머지되지 않음" 을 가드.)
   - Stop condition: vitest 통과 + 정적 grep 확인.

#### Fallback (CP-1/CP-2 실패시)

- CP-1 의 `import type` 가 어떤 이유로 emit 되어 vitest 가 react 를 끌어와 실패하면, helper 의 반환 타입을 `{ bg: string; style: { flex: string } }` 으로 좁혀 react 의존을 제거.
- CP-2 후 `pnpm --filter @argos/web build` 가 깨지면 (예: client component 가 lib 모듈을 import 하는 것이 next 빌드 규칙과 충돌) — 가능성 낮음이지만 — ribbon 내부에 다시 함수 정의를 두고 helper 는 helper 대로 유지(같은 로직 두 곳, 임시) 한 뒤 별도 후속 task 로 정리. 단, 본 plan 의 1차 시도는 깨끗한 추출이다.

## 병렬 실행 그룹

- **Group A (단일 그룹, 단일 work unit)**: WU-1.
- 본 task 는 surface 가 매우 작아 work unit 분할 이득 없음 → 단일 워커 직선 실행. WU-1 내부의 CP-1~CP-4 가 순차 체크포인트로 실패 원인 분리를 담당.
- 파일 경로 충돌 검증: 단일 WU 이므로 충돌 없음. CP-4(b) 의 `timeline-events.test.ts` 추가는 같은 워커 안에서 직렬 수정이므로 충돌 없음.

## Negative Space 재확인

context.md 의 negative space 를 implement worker 가 절대 건드리지 않도록 재명시:

- `packages/web/src/components/dashboard/event-list.tsx`, `event-detail.tsx` — 이미 `bg-chart-4` 동일 분류로 일관됨. 수정 금지.
- `packages/web/src/lib/timeline-events.ts` 의 `isSkillCall` / `isAgentCall` 생성 로직(line 70-112) 및 `buildTimelineGroups` 의 머지 제외 분기(line 162) — 분류 정의의 단일 원천. **로직 수정 금지** (CP-4(b) 는 timeline-events.ts 가 아니라 그 **테스트 파일** 에만 케이스 추가).
- `packages/web/src/app/globals.css` 의 `--chart-4` 토큰 값(line 46, 104, 156) — 톤 조정 금지.
- `session-activity-ribbon.tsx` line 303 의 머지바 head `bg-muted-foreground` 하드코딩 — clarify 가 회색 유지를 못박음. 수정 금지.
- `session-activity-ribbon.tsx` 의 호버/선택/outline 스타일(line 218-222 등) — 본 task 의 시각 상태 범위 밖. 수정 금지.
- `packages/web/vitest.config.ts` — include 패턴 / alias 설정 변경 금지. 새 테스트는 `.test.ts` 확장자 + `./` 상대 import 로 작성하여 기존 패턴과 호환.

## 검증 시나리오 (Evaluate 단계 입력용)

### 자동 검증

순서대로 실행. 각 단계 실패시 stop, 원인 분류:

1. `pnpm --filter @argos/web exec tsc --noEmit` — 타입체크 통과. 실패시 narrowing/type 우회 코드 점검.
2. `pnpm --filter @argos/web exec vitest run src/components/dashboard/session-ribbon-visuals.test.ts` — 신규 7 케이스 모두 통과. 실패시 case 별 단언 점검.
3. `pnpm --filter @argos/web exec vitest run` — 기존 `timeline-events.test.ts` / `slash-command.test.ts` / `events.test.ts` / `dashboard-row-mapping.test.ts` / `rbac.test.ts` + CP-4(b) 추가 케이스까지 모두 통과.
4. `pnpm --filter @argos/web lint` — `eslint src` 통과 (`packages/web/package.json` 의 `lint: eslint src` 존재 확인 완료).
5. `pnpm --filter @argos/web build` — Next 프로덕션 빌드 통과. ribbon 모듈이 새로 인접 helper 를 import 해도 client/server 경계 규칙을 깨지 않음을 최종 검증.
6. **사용 경계 grep**: `rg "session-ribbon-visuals" packages/web/src` 결과를 점검하여 다음 허용 파일 목록 외 import 가 없음을 확인 — 허용: (a) `packages/web/src/components/dashboard/session-activity-ribbon.tsx` (b) `packages/web/src/components/dashboard/session-ribbon-visuals.ts` (자기 자신; export 라인) (c) `packages/web/src/components/dashboard/session-ribbon-visuals.test.ts`. 그 외 모든 매치는 위반. (alias / 상대경로 어떤 import 형태든 잡히도록 substring 검색 사용 — round 2 critique minor #2 반영.)

### QA 시나리오 (evaluate-qa 가 수행)

재현 가능하도록 fixture 조건을 구체화:

1. 로컬 dev 서버(`pnpm --filter @argos/web dev`) 기동, 인증된 사용자로 진입.
2. **fixture 조건**: 다음 6 종 이벤트를 모두 포함한 단일 세션 transcript 를 사용한다 (실제 데이터에서 검색하거나 dev fixture 시드로 주입):
   - (a) 명시적 `toolName === 'Skill'` 이벤트 1개
   - (b) `Task` + `subagent_type` 이 있는 이벤트 1개
   - (c) 일반 tool 이벤트 (`Bash` 또는 `Read`) 1개
   - (d) HUMAN 메시지 1개
   - (e) ASSISTANT 메시지 1개
   - (f) 동일 toolName 의 연속 호출 3개 이상 (`buildTimelineGroups` 가 merged group 으로 묶는 케이스)
3. 라이트 모드에서 ribbon 막대 색을 확인:
   - (a)(b) 막대가 `--chart-4` 앰버
   - (c) 막대가 `bg-muted-foreground` 회색
   - (d) `bg-brand`, (e) `bg-brand-2`
   - (f) 머지바 head 는 `bg-muted-foreground` 회색
4. 다크 모드 토글 후 동일 검증 — `--chart-4` 의 다크 매핑이 가독성 유지하는지.
5. event-list / event-detail 사이드 패널에서 (a)(b) 이벤트 색이 ribbon 막대 색과 시각적으로 동일한 앰버임을 비교 확인.
6. 호버/선택 상태 토글 시 색이 깨지지 않음을 확인 (negative space 가 지켜졌는지 회귀 가드).

## Decision Log

- **Decision-1: skill / subagent 막대 색을 신규 토큰이 아닌 기존 `bg-chart-4` 로 통일한다.**
  - 컨텍스트: event-list (line 137-138) 와 event-detail (line 83-84) 이 이미 동일 분류에 `bg-chart-4` 를 쓰고 있어, ribbon 만 회색으로 다른 상태였다.
  - 대안과 거절 사유: 신규 `bg-warning` / yellow-400 토큰 도입 → 동일 의미에 두 토큰을 가지는 디자인 시스템 분기를 만듦. clarify 가 명시적으로 비범위.
  - 트레이드오프: skill 과 subagent 를 시각적으로 분리할 여지를 포기. clarify 가 "둘 다 같은 노랑" 못박았으므로 수용.
  - 태그: `area:web`, `area:design-system`, `library:tailwindcss`

- **Decision-2: 분류 키는 신규 헬퍼가 아니라 기존 `isSkillCall || isAgentCall` 플래그 OR 조합을 helper 내부에서 인라인으로 평가한다.**
  - 컨텍스트: event-list / event-detail 도 두 플래그의 OR 를 인라인으로 평가. 패턴 일관성 확보.
  - 대안과 거절 사유: `timeline-events.ts` 에 `isHighlightedTool(event)` 헬퍼 추가 → 3 곳 갱신 필요 + clarify 의 negative space(timeline-events.ts 변경 금지) 와 충돌.
  - 트레이드오프: 향후 강조 분류 확장 시 3 곳 동시 변경 부담. 본 task 범위 밖.
  - 태그: `area:web`, `language:typescript`

- **Decision-3: `segmentVisuals` 를 ribbon `.tsx` 에서 `export` 하지 않고, ribbon 인접 위치(`packages/web/src/components/dashboard/session-ribbon-visuals.ts`) 로 추출한다.**
  - 컨텍스트: `packages/web/vitest.config.ts` 는 `defineConfig({ test: { environment: 'node', include: ['src/**/*.test.ts'] } })` 만 설정하고 `vite-tsconfig-paths` 등 alias 플러그인이 없다. ribbon `.tsx` 의 `@/lib/...` import 는 vitest 에서 resolve 실패한다. 또한 ribbon 모듈은 `'use client'` 디렉티브와 `react` 훅 named import 를 top-level 에 두고 있다. `'use client'` 자체는 Vitest/Vite 에서 런타임 동작을 만들지 않는 directive prologue 일 뿐이고, 실제 위험은 ribbon `.tsx` 의 top-level import 가 Node env 에서 평가되는 데서 온다.
  - 대안과 거절 사유:
    - (B) export 만 추가하고 `.tsx` 를 그대로 import → alias 미해결로 vitest 실패. vitest config 변경(즉 plugin 추가) 은 본 task 의 surface 와 위험 외연을 넓힘.
    - (C) `vite-tsconfig-paths` 플러그인 추가 → 신규 dev 의존 + config 변경 + ribbon 의 react 의존 평가 위험 미해결.
    - (D) helper 를 `packages/web/src/lib/` 에 둠 → ribbon 전용 Tailwind/style 결정이 도메인 lib 로 보이고 향후 event-list/detail 이 재사용하면서 결합도가 lib 전반에 퍼지는 위험. helper 소유권은 ribbon 컴포넌트에 머물러야 함. (round 2 critique major 반영.)
  - 트레이드오프: 모듈 파일 1개 추가. ribbon `.tsx` 는 함수 정의가 빠지고 같은 폴더 상대경로 named import 1줄이 들어간다. 시각적 응집도는 약간 분산되지만 helper 가 ribbon 폴더에 거주하여 "ribbon 전용" 소유권이 파일 위치로 명시되고, 사용 경계 grep(자동검증 #6) 으로 코드 그래프 차원의 가드 추가.
  - 보강 근거:
    - helper 는 pure TS, top-level 런타임 import 없음 — `import type` 만 사용. TypeScript 의 type-only import 는 JS emit 에서 제거된다. 값으로 오용하면 `isolatedModules: true` 하에서 컴파일 에러로 즉시 드러난다 (CP-1 stop condition). 런타임 import 부재 자체는 vitest 가 react 를 끌어오지 않고 실행되는 것으로 간접 확인된다. (현 repo 에 `verbatimModuleSyntax` 설정은 없으나, 설정 여부와 무관하게 type-only import 의 emit 제거 의미론은 동일.)
  - 태그: `area:web`, `language:typescript`, `tooling:vitest`

- **Decision-4: 테스트 파일은 `.test.ts` (NOT `.test.tsx`) 로 작성하고 helper 와 같은 디렉터리(`packages/web/src/components/dashboard/`) 에 둔다.**
  - 컨텍스트: `vitest.config.ts` include 가 `src/**/*.test.ts` 이므로 `components/dashboard/` 하위의 `.test.ts` 도 자동 수집된다. 테스트 파일이 helper 와 같은 폴더에 있어야 import 가 `./session-ribbon-visuals` 로 깨끗하게 정리된다.
  - 대안과 거절 사유: include 패턴 확장 (`.tsx` 포함) → 본 task 의 surface 외 정책 결정 부담. 별도 task.
  - 트레이드오프: 향후 component 렌더 테스트는 별도 인프라(vitest config 확장, jsdom) 가 필요. 본 task 범위 밖.
  - 태그: `tooling:vitest`, `area:web`

- **Decision-5: 성공 기준 4 (머지바 head 회색 유지) 는 `segmentVisuals` 단위 테스트로 직접 검증하지 않고, (a) ribbon `.tsx` line 303 의 정적 grep + (b) `buildTimelineGroups` 의 skill/subagent 머지 제외 회귀 테스트 로 보강한다.**
  - 컨텍스트: 머지바 head 는 ribbon JSX 안의 하드코딩 클래스이지 `segmentVisuals` 의 반환값이 아니다. 따라서 helper 단위 테스트의 도달 범위 밖.
  - 대안과 거절 사유: react-testing-library 를 도입해 ribbon 을 렌더 후 DOM 단언 → 의존 + config 변경. 본 task 비범위.
  - 트레이드오프: 자동 검증의 도달 범위가 100% 가 아니라 95% (수동 QA 가 머지바 head 시각 확인을 담당). 단, CP-4(a) grep 가드와 CP-4(b) 분류 회귀 테스트로 의도 한 단계 위에서 가드. 충분.
  - 태그: `area:web`, `tooling:vitest`

- **Decision-6: 본 task 의 tooling risk (alias / TSX import / client-module import 실패) 를 제품 risk 와 분리하여 인지한다.**
  - 컨텍스트: clarify 는 "Open risks 없음" 으로 제품 risk 를 평가했지만, 테스트 접근 방식을 결정하는 과정에서 toolchain risk 가 드러났다.
  - 대안과 거절 사유: risk 무시하고 export-only 접근(선택지 B) 채택 → 실행 단계에서 vitest resolve 실패로 워커가 막혀 ping-pong 발생.
  - 트레이드오프: helper 추출로 risk 를 미리 해소하지만 파일 1개 추가. 수용 가능.
  - Fallback: 만약 CP-1 후 어떤 이유로든 (사용 실수 등) vitest 실행에서 react 가 끌려오거나 alias 미해결이 발생하면 → helper 반환 타입을 react `CSSProperties` 가 아닌 `{ flex: string }` 로 좁혀 react 의존을 완전히 제거. ribbon 측은 `CSSProperties` 와 구조적으로 호환되므로 호출부 영향 없음.
  - 태그: `tooling:vitest`, `area:web`

## Critique Reflection

### Round 1 (codex critique-1)

- **major #1 (helper 추출 권고)**: 수용. 아키텍처를 선택지 A 로 전환, `segmentVisuals` 를 `packages/web/src/lib/session-ribbon-visuals.ts` 로 추출. Decision-3 에 상세 근거 추가.
- **major #2 (alias 해석 검증 누락)**: 수용. helper 가 `@/*` 를 쓰지 않고 상대경로만 쓰므로 alias 검증 자체가 필요 없게 설계. Decision-3 의 컨텍스트 항목에 vitest config 의 alias 부재 사실을 명시.
- **major #3 (성공기준 4 자동검증 누락)**: 수용. Decision-5 와 CP-4(a)/(b) 로 정적 grep + `buildTimelineGroups` 분류 회귀 테스트 보강.
- **major #4 (`use client` directive 근거 불충분)**: 부분 수용. helper 추출로 ribbon `.tsx` 를 import 하지 않게 되어 `'use client'` 평가 자체가 발생하지 않음 → 근거 충분 여부가 더 이상 critical path 가 아님. Decision-3 의 컨텍스트에 directive risk 분리 기록.
- **minor #5 (export 사용 경계 명시)**: 수용. 자동 검증 #6 (사용 경계 grep) 으로 helper 가 ribbon 외에서 import 되지 않음을 강제.
- **minor #6 (WU 내부 체크포인트 분리)**: 수용. CP-1~CP-4 로 순차 stop condition 분리, CP-1 실패시 fallback 명시.
- **minor #7 (QA fixture 재현 불가능)**: 수용. 검증 시나리오/QA 항목 2 에 fixture 6 종 (a)~(f) 와 다크모드 비교 명시.
- **minor #8 (test fixture 타입 우회 위험)**: 수용. CP-3 의 `makeTool` / `makeMessage` baseline 필드를 모든 required 필드 포함으로 명시, `as any` 금지 명문화.
- **minor #9 (`pnpm lint` 모호)**: 수용. `packages/web/package.json` 확인 결과 `lint: eslint src` 가 존재함을 확인하고 자동 검증 #4 에 명시.

### Round 2 (codex critique-2)

- **major #1 (helper 위치: lib/ → components/dashboard/)**: 수용. 선택지 A 의 helper 경로를 `packages/web/src/components/dashboard/session-ribbon-visuals.ts` 로 이동, 테스트도 동일 폴더. 선택지 C(lib 배치) 를 거절 사유와 함께 명시. 개요 / 아키텍처 / WU-1 파일 목록 / CP-1 / CP-2 / CP-3 / 자동검증 / Decision-3 / Decision-4 모두 갱신.
- **minor #2 (사용 경계 grep 정밀도)**: 수용. 자동검증 #6 의 grep 을 `rg "session-ribbon-visuals" packages/web/src` substring 검색으로 바꾸고 허용 파일 목록 3개를 명시.
- **minor #3 (`import type` emit 표현 정확화)**: 수용. Decision-3 의 보강 근거 문장을 "TypeScript 의 type-only import 는 JS emit 에서 제거된다. 값으로 오용하면 `isolatedModules` 하에서 컴파일 에러로 즉시 드러난다. 런타임 import 부재 자체는 vitest 실행으로 간접 확인" 으로 교정. `verbatimModuleSyntax` 미설정 사실 명시. WU-1 입력 계약 문장도 동일하게 정리.
- **minor #4 (테스트의 timeline-events 값 import 위험)**: 수용. CP-3 에서 "값 import 는 `./session-ribbon-visuals` 의 `segmentVisuals` 단 하나, 나머지 (`ToolEvent`, `MessageEvent`) 는 type-only import" 로 명시.

### 종료 사유

Round 1+2 의 critical 0 개, major 5 개(round1 4 + round2 1), minor 9 개(round1 5 + round2 4) 모두 반영 완료. Round 2 결과 critical 0 개이고 모든 major/minor 가 actionable 한 표현/위치 조정 수준 — plan 구조나 work unit 분해에 추가 변경 필요 없음. 추가 라운드의 한계 효용이 낮으므로 Round 3 생략하고 plan v3 로 확정.
