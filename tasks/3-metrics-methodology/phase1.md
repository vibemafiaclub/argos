# Phase 1: 구현 (공유타입 + API + UI + methodology 페이지)

## 배경 (독립 session용 컨텍스트)

Phase 0에서 docs 업데이트가 완료됐다. 이 phase는 코드를 작성한다.

**작업 목표**:
1. Skills/Agents 대시보드 API에 `userCount`, `medianDurationMs` 컬럼 추가.
2. Skills/Agents 페이지 테이블에 두 컬럼 노출 + 컬럼 헤더에 InfoTooltip(공학적 정의).
3. `/docs/metrics-methodology` public 정적 페이지 신설.
4. 순수 매핑 함수 `mapSkillRow`/`mapAgentRow`를 추출해 Vitest 단위 테스트.

**핵심 설계 원칙 (CTO 판정 조건부 조건 6개 — 모두 준수해야 함)**:

1. `medianDurationMs` 샘플 **임계값은 3**이고, 휴리스틱임을 methodology 페이지 + 타입 주석 + API SQL에 **모두** 명시.
2. `messages.tool_input` JSON 추출 쿼리는 반드시 `tool_name IN ('Skill','Agent')` 선행 필터를 WHERE에 두고, 결과를 CTE로 묶은 뒤 GROUP BY. 성장 시 부분 인덱스는 별도 백로그(지금 만들지 말 것).
3. `InfoTooltip`은 `alert-dialog.tsx`의 기존 `@base-ui/react` 패턴(`data-slot`, `cn` util)을 그대로 따른다. 새 스타일 시스템 도입 금지.
4. methodology 페이지에 **"Claude Code가 PostToolUse exit_code를 모든 내장 도구에 제공하기 시작하면 successRate 재도입"**을 명시적 트리거 문장으로 박아둔다.
5. "세션 종료 후 반영"(messages 재빌드 지연) 문구는 methodology 페이지 + Skills/Agents 페이지 헤더 InfoTooltip **양쪽**에 반영.
6. `userCount`는 반드시 `events` 테이블에서 `COUNT(DISTINCT user_id)` 로 집계. `messages` 쪽에서 뽑지 말 것.

## 사전 준비

먼저 아래 문서를 정독하라:

- `/docs/spec.md`, `/docs/code-architecture.md`, `/docs/data-schema.md`
- `/docs/mission.md`, `/docs/testing.md`
- `/docs/user-intervention.md` (Phase 0가 추가한 "Skill/Agent successRate 도입 보류" 섹션)
- `/tasks/3-metrics-methodology/docs-diff.md` (Phase 0 문서 변경 기록 — run-phases가 자동 생성)
- `/iterations/3-20260424_152703/requirement.md`

그리고 Phase 0에서 수정된 파일을 반드시 확인:
- `/docs/data-schema.md` — 추가된 Skills/Agents 집계 SQL 섹션
- `/docs/user-intervention.md` — successRate 대체 기록
- `/docs/spec.md` — metrics-methodology 포인터 1줄

구현의 설계 의도를 파악하기 위해 아래 기존 파일들도 전부 정독:

- `/packages/shared/src/types/dashboard.ts` — SkillStat, AgentStat
- `/packages/web/src/app/api/orgs/[orgSlug]/dashboard/skills/route.ts`
- `/packages/web/src/app/api/orgs/[orgSlug]/dashboard/agents/route.ts`
- `/packages/web/src/app/dashboard/[orgSlug]/skills/page.tsx`
- `/packages/web/src/app/dashboard/[orgSlug]/agents/page.tsx`
- `/packages/web/src/components/ui/alert-dialog.tsx` — InfoTooltip이 따라야 할 `@base-ui/react` 패턴(data-slot + cn)
- `/packages/web/src/lib/slash-command.ts` + `slash-command.test.ts` — 순수 함수 단위 테스트의 코드 스타일 레퍼런스
- `/packages/web/prisma/schema.prisma` — Event, Message, ClaudeSession 모델 확인
- `/packages/web/package.json` — 신규 의존성 0개 확인 (`@base-ui/react`, `lucide-react`, `react-markdown` 모두 이미 설치되어 있음)
- `/packages/web/src/middleware.ts` — `/docs/*`는 보호 대상 아님(public 접근 허용)

## 작업 내용

### 1) `packages/shared/src/types/dashboard.ts` — SkillStat / AgentStat 확장

두 인터페이스에 아래 두 필드를 **optional 아닌 required**로 추가:

```ts
/** 집계 기간 내 이 skill을 호출한 distinct user_id 수 (events 테이블 기준) */
userCount: number
/**
 * 이 skill의 tool_completion 시간 중앙값(ms). messages.duration_ms 의 p50.
 * 샘플 < 3건이면 통계 신뢰성 휴리스틱으로 null을 반환한다.
 * "샘플 3" 임계값은 의도적으로 낮은 휴리스틱이며 통계적 유의수준이 아니다.
 */
medianDurationMs: number | null
```

AgentStat에도 동일 필드 추가(문구 "skill"→"agent"로 치환).

### 2) 순수 매핑 함수 + Vitest — `packages/web/src/lib/server/dashboard-row-mapping.ts` 신설

```ts
export const DURATION_SAMPLE_THRESHOLD = 3  // 휴리스틱. methodology 페이지에도 동일 숫자 하드코딩됨.

export interface RawSkillRow {
  skill_name: string
  call_count: bigint
  session_count: bigint
  user_count: bigint
  last_used_at: Date
  median_duration_ms: number | null       // percentile_cont 결과 (PG는 double precision)
  duration_sample_count: bigint           // COUNT(m.duration_ms)
}

export function mapSkillRow(row: RawSkillRow): SkillStat
// median은 duration_sample_count >= DURATION_SAMPLE_THRESHOLD 일 때만 number,
// 그 외 null. bigint→number 변환은 기존 route 스타일(Number(...)) 유지.
```

AgentStat용 `mapAgentRow(row: RawAgentRow): AgentStat` 도 같은 파일에 구현(`sample_desc` 필드 유지).

**같은 디렉토리에 `dashboard-row-mapping.test.ts`** — Vitest 3 케이스:
1. `duration_sample_count=0` → `medianDurationMs === null`
2. `duration_sample_count=2, median_duration_ms=100` → `medianDurationMs === null` (임계값 미달)
3. `duration_sample_count=3, median_duration_ms=100` → `medianDurationMs === 100`

테스트는 `packages/web/src/lib/slash-command.test.ts` 의 패턴을 그대로 따른다(describe/it, Vitest).

### 3) API 라우트 — `packages/web/src/app/api/orgs/[orgSlug]/dashboard/skills/route.ts`

기존 1개 CTE-less 쿼리를 2 CTE + LEFT JOIN 구조로 확장. `docs/data-schema.md`의 Phase 0 섹션에 명시된 SQL을 그대로 따른다(단, skill_name 버전).

핵심:
- `skill_events` CTE: 기존 집계 + `COUNT(DISTINCT user_id) AS user_count` 추가.
- `skill_durations` CTE: `messages` 테이블에서 `role='TOOL' AND tool_name='Skill' AND duration_ms IS NOT NULL` 필터 + `claude_sessions` JOIN으로 projectId 스코핑, `tool_input->>'skill'` 그룹화, `COUNT(m.duration_ms) AS duration_sample_count`, `percentile_cont(0.5) WITHIN GROUP (ORDER BY m.duration_ms) AS median_duration_ms`.
- 최종 SELECT: 두 CTE를 `skill_name` 기준 `LEFT JOIN`. 임계값 적용은 매핑 함수로 위임(CASE WHEN도 받아들이지만, 테스트 단순화를 위해 매핑 함수에서 처리).
- `skills.map(row => mapSkillRow(row))` 로 응답 변환.

`agents/route.ts`도 동일 패턴(`tool_name='Agent'`, `tool_input->>'subagent_type'`). 기존 agent_samples CTE는 유지.

**WHERE 절 순서**: `tool_name='Skill'`(또는 `'Agent'`) 를 WHERE 앞쪽에 두어 인덱스/옵티마이저 친화적으로 작성.

### 4) InfoTooltip 공용 컴포넌트 — `packages/web/src/components/ui/info-tooltip.tsx`

- `@base-ui/react/tooltip`의 `Tooltip.Root`, `Trigger`, `Positioner`, `Popup` 사용.
- 시그니처:
  ```ts
  export function InfoTooltip({ content, className }: { content: React.ReactNode; className?: string }): JSX.Element
  ```
- 트리거: `lucide-react`의 `Info` 아이콘(size=12, `text-muted-foreground/70`).
- 팝업 스타일: `alert-dialog.tsx`의 tokens 재사용 — `rounded-md bg-popover text-popover-foreground ring-1 ring-foreground/10 shadow-md px-3 py-2 text-xs max-w-xs`. `data-open`/`data-closed` 애니메이션은 alert-dialog와 동일 계열.
- `data-slot="info-tooltip-popup"` 부여(일관성).
- `Tooltip.Provider`는 `app/layout.tsx` 루트에 이미 없으므로, InfoTooltip 내부에서 local Provider(또는 Base UI API 기준으로 `Tooltip.Root` 직접 사용 — Base UI는 별도 Provider 불요)만으로 동작하게 구성. Base UI `Tooltip` docs 기준: `Tooltip.Provider`가 있는 경우와 없는 경우 모두 호환. 루트에 Provider를 추가하지 말 것(스코프 과확장 방지).

### 5) UI — Skills/Agents 페이지

`packages/web/src/app/dashboard/[orgSlug]/skills/page.tsx`:
- 테이블 헤더에 **Users**, **Median duration** 컬럼 추가. 각 헤더 텍스트 옆에 `<InfoTooltip content={...} />`.
- **Users 툴팁**: `"집계 기간 내 이 skill을 한 번이라도 호출한 distinct user_id 수 (events 테이블 기준, COUNT(DISTINCT user_id))."`
- **Median duration 툴팁**: `"이 skill의 tool 완료 시간 중앙값 — messages.duration_ms 의 p50. durationMs는 세션 종료(Stop) 시 transcript 기반으로 재빌드되므로 진행 중인 세션은 포함되지 않는다. 샘플 < 3건일 땐 —(대시) 표시."`
- 셀 렌더링:
  - Users: `skill.userCount.toLocaleString()`
  - Median duration: `skill.medianDurationMs != null ? formatDurationMs(skill.medianDurationMs) : '—'`
- `formatDurationMs` 는 `/packages/web/src/lib/format.ts` 에 아래처럼 추가 (또는 기존 유틸 활용):
  - < 1000: `${Math.round(ms)}ms`
  - < 60_000: `${(ms/1000).toFixed(ms<10_000 ? 1 : 0)}s`
  - >= 60_000: `${Math.round(ms/60_000)}min`

`/packages/web/src/app/dashboard/[orgSlug]/agents/page.tsx`: 동일 패턴(skill → agent 치환).

### 6) `/docs/metrics-methodology` 정적 페이지

`packages/web/src/app/docs/layout.tsx` 및 `packages/web/src/app/docs/metrics-methodology/page.tsx` 신설.

**`layout.tsx`**: 로그인 불요. 심플한 max-width 컨테이너 + prose 타이포. `middleware.ts`는 이미 `/docs/*`를 보호하지 않으므로 그대로 public.

**`page.tsx`**: 하드코딩 JSX + Tailwind prose. MDX/CMS 도입 **금지**. React-markdown 사용 선택적(본문이 길면 가독성을 위해 허용, 단일 페이지라 JSX 직접 작성이 더 안전).

페이지 구조(반드시 포함 — 누락 시 AC fail):

1. **제목**: "Argos 지표 방법론 (Metrics Methodology)"
2. **요약 한 단락**: 왜 이 페이지가 존재하는가 — "모든 대시보드 숫자의 공학적 정의를 단일 원천으로 공개. 혹시 결과가 당신의 기대와 다르면 정의를 확인하거나 support로 연락해달라."
3. **지표 섹션** (각 지표마다: 정의 / SQL / 해석 가이드):
   - `callCount` — 호출 수
   - `sessionCount` — 호출된 세션 수
   - `userCount` — 호출한 distinct user 수
   - `medianDurationMs` — tool 완료 시간 중앙값 (messages 테이블 기준, 샘플 >= 3 임계값 명시)
   - 토큰 지표(inputTokens/outputTokens/cacheReadTokens/cacheCreationTokens) — usage_records 테이블
   - `estimatedCostUsd` — `packages/shared/src/constants/pricing.ts` 참조
4. **"죽은 skill/agent" 판별 예시 임계값 섹션** — 예: "최근 30일 callCount == 0 AND userCount <= 1". UI에서 **자동 라벨/경고/색상 표시는 하지 않음**을 명시(판단은 조직 몫).
5. **"successRate를 노출하지 않는 이유" 섹션** — Phase 0 user-intervention.md 요지 인용. 재도입 트리거 문장: "**Claude Code hook이 Skill/Agent 도구에 대해 PostToolUse + exit_code를 제공하기 시작하면 즉시 재도입 검토.**"
6. **제한(Limitations) 섹션** —
   - toolInput/toolResponse는 지표 집계에 사용되지 않음(메타데이터만). privacy 보장 관점.
   - messages.duration_ms는 세션 종료(Stop) 후 transcript 재빌드 시 채워지므로 진행 중 세션의 tool call은 집계 지연 가능.
   - 샘플 < 3 휴리스틱의 의미(통계적 유의수준 아님, 빈약 데이터 숨김).
7. **피드백 창구 한 문장** — "데이터가 예상과 다르면 support@argos-ai.xyz 로 연락."

**데이터 링크/소스 파일 하단 footer**: "이 페이지는 `packages/web/src/app/docs/metrics-methodology/page.tsx`. 수정은 PR로."

### 7) TanStack Query hook 변경 불요

`useDashboardSkills`/`useDashboardAgents`는 타입만 `@argos/shared`를 재수입하므로 자동 반영. 별도 수정 없음.

### 8) `@argos/shared` rebuild 순서

shared 패키지는 workspace. pnpm typecheck 전에 `pnpm --filter @argos/shared build` 가 필요하면 AC 스크립트에서 먼저 실행. 또는 `pnpm -w typecheck` 가 workspace 의존성 자동 해결.

## Acceptance Criteria

```bash
# workspace 루트에서 실행
# 1) shared 재빌드(타입 갱신)
pnpm --filter @argos/shared build

# 2) web typecheck + lint + test + build 전부 통과
cd packages/web
pnpm typecheck
pnpm lint
pnpm test              # 신규 dashboard-row-mapping.test.ts 3 케이스 포함
pnpm build             # Next.js 프로덕션 빌드 성공

# 3) 신규 파일이 실제로 생성되었는지 확인
test -f src/lib/server/dashboard-row-mapping.ts
test -f src/lib/server/dashboard-row-mapping.test.ts
test -f src/components/ui/info-tooltip.tsx
test -f src/app/docs/metrics-methodology/page.tsx

# 4) methodology 페이지가 필수 내용 포함
grep -q "callCount" src/app/docs/metrics-methodology/page.tsx
grep -q "userCount" src/app/docs/metrics-methodology/page.tsx
grep -q "medianDurationMs" src/app/docs/metrics-methodology/page.tsx
grep -q "죽은" src/app/docs/metrics-methodology/page.tsx
grep -q "successRate" src/app/docs/metrics-methodology/page.tsx
grep -q "재도입" src/app/docs/metrics-methodology/page.tsx
grep -q "support" src/app/docs/metrics-methodology/page.tsx

# 5) 임계값 3이 SQL/매핑/methodology 3곳에 모두 존재
grep -q "DURATION_SAMPLE_THRESHOLD = 3" src/lib/server/dashboard-row-mapping.ts
grep -rq "3" src/app/api/orgs/\[orgSlug\]/dashboard/skills/route.ts
# (위 grep은 너무 러프 — 수동 확인 체크: route.ts의 percentile_cont 쿼리에서 샘플 수 >= 3 조건이 SQL 또는 매핑 함수 어느 쪽에 있는지 명확히 문서화)

# 6) Skills/Agents 페이지에 Users/Median duration 컬럼이 렌더됨
grep -q "Median duration" src/app/dashboard/\[orgSlug\]/skills/page.tsx
grep -q "Median duration" src/app/dashboard/\[orgSlug\]/agents/page.tsx
grep -q "Users" src/app/dashboard/\[orgSlug\]/skills/page.tsx
grep -q "Users" src/app/dashboard/\[orgSlug\]/agents/page.tsx
```

## AC 검증 방법

위 AC 전체 통과 시 `/tasks/3-metrics-methodology/index.json`의 phase 1 status를 `"completed"`로 변경한다. 3회 이상 실패하면 `"error"`로 변경하고 `error_message` 필드에 사유 기록.

**수동 확인 권장 체크리스트 (자동 실패 시 손으로 한 번 더)**:
- `pnpm --filter @argos/web dev` 후 Skills/Agents 페이지에서 Users/Median duration 컬럼이 렌더되고 InfoTooltip이 hover에 열리는지.
- `/docs/metrics-methodology` 를 비로그인 상태로 접근해도 200.
- Median duration 값: `commit` skill 등 duration_sample_count >= 3 인 row는 숫자, 나머지는 `—`.

## 주의사항

- **의존성 추가 금지**: `@base-ui/react`, `lucide-react`, `react-markdown` 이미 설치됨. `npm install`/`pnpm add` 호출 금지.
- **Prisma 마이그레이션 금지**: 스키마 변경 없음. schema.prisma 건드리지 말 것.
- **`is_skill_call`/`is_agent_call`/`skill_name`/`agent_type` 컬럼 의미 그대로 사용**. 새 파생 컬럼 도입 금지.
- **`messages.duration_ms`의 시맨틱 왜곡 금지**: p95/p99가 아니라 p50만 쓴다. 이유는 샘플 수가 작고 이상치 민감도를 낮추기 위함 — methodology에도 같은 이유 명시.
- **successRate 컬럼을 절대 추가하지 마라**. 요구사항 원안이 언급하지만 Phase 0 사전조사 결과 수집 불가가 확정됐다. UI에도, 타입에도, API에도 들어가면 안 된다.
- **"—" 대시 표시**: `medianDurationMs === null` 일 때만. `0`은 "0ms" 로 표시(null과 0을 구분).
- **Tooltip Provider를 루트 layout에 추가하지 마라**. InfoTooltip 내부에서만 처리.
- **기존 테스트를 깨뜨리지 마라**: `pnpm test` 는 기존 test 파일도 전부 통과해야 한다.
- **brand color / theme token 변경 금지**. 기존 shadcn 토큰(bg-popover, text-popover-foreground, ring-foreground/10 등)만 사용.
- **commit 규칙**: 공통 프리앰블 지시에 따라 `feat(metrics-methodology): phase 1 — impl` 형식으로 단일 커밋.
