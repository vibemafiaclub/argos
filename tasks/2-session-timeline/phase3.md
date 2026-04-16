# Phase 3: Web 차트 컴포넌트 + 페이지 통합

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `/docs/code-architecture.md`

그리고 이전 phase의 작업물과 현재 코드를 반드시 확인하라:

- `/packages/shared/src/types/dashboard.ts` — Phase 0에서 추가된 `SessionTimelineUsage`, `SessionTimelineTool`, 확장된 `SessionDetail`
- `/packages/web/src/components/dashboard/token-usage-chart.tsx` — 기존 차트 컴포넌트 패턴 참고
- `/packages/web/src/app/dashboard/[projectId]/sessions/[sessionId]/page.tsx` — 세션 상세 페이지
- `/packages/web/src/lib/format.ts` — 기존 포맷 유틸 (`formatTokens`, `formatCost`, `formatDate`)
- `/packages/web/src/hooks/use-dashboard-sessions.ts` — `useSessionDetail` 훅

이전 phase에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업 내용

### 1. `packages/web/src/lib/format.ts` — `formatRelativeTime` 유틸 추가

세션 시작 시각 대비 상대 시간을 표시하는 함수를 추가한다:

```typescript
/**
 * Format a timestamp as relative time from a base timestamp.
 * Examples: "+0m", "+3m", "+1h 5m"
 */
export function formatRelativeTime(timestamp: string, baseTimestamp: string): string
```

- 분 단위로 표시. 1시간 이상이면 `+1h 5m` 형식.
- 0분이면 `+0m`.

### 2. `packages/web/src/components/dashboard/session-timeline-chart.tsx` — 신규 생성

recharts를 사용한 세션 타임라인 차트 컴포넌트를 생성한다.

**Props 인터페이스**:
```typescript
interface SessionTimelineChartProps {
  usageTimeline: SessionTimelineUsage[]
  toolEvents: SessionTimelineTool[]
  sessionStartedAt: string  // ISO 8601 — X축 상대시간 계산 기준
}
```

**차트 구성**:

1. **메인 영역 — Stacked Bar Chart**:
   - recharts `ComposedChart` 사용 (Bar를 메인으로, 하단에 tool 그룹 표시)
   - X축: 세션 시작 기준 상대시간 (`formatRelativeTime` 사용)
   - Y축: 토큰 수 (`formatTokens` 사용)
   - `inputTokens`와 `outputTokens`를 stacked `Bar`로 표시
   - Input: `#8b5cf6` (violet-500), Output: `#3b82f6` (blue-500) — 기존 `token-usage-chart.tsx` 색상과 동일
   - `ResponsiveContainer` width 100%, height 350

2. **Tool Call 그룹 마커**:
   - 각 UsageRecord(= bar) 사이 구간에 속하는 tool call 이벤트들을 그룹핑
   - 그룹핑 로직: 각 usageTimeline[i]의 timestamp 이전, usageTimeline[i-1]의 timestamp 이후에 해당하는 toolEvents를 묶음. 첫 번째 bar 이전의 이벤트는 첫 번째 bar에 연결.
   - POST_TOOL_USE 이벤트만 사용 (PRE_TOOL_USE는 무시 — 완료된 호출만 표시)
   - 그룹 내 tool들을 이름별로 카운트: `"Bash x3, Read x2"` 형식의 문자열로 요약
   - 이 요약 문자열을 각 bar 아래에 작은 텍스트로 표시하거나, 커스텀 XAxis tick으로 표시
   - 텍스트가 너무 길면 최대 3개 tool까지만 표시하고 `+N more` 처리

3. **커스텀 Tooltip**:
   - 기존 `token-usage-chart.tsx`의 `CustomTooltip` 패턴을 따름
   - 표시 항목:
     - 상대시간 (예: `+5m`)
     - Input Tokens: 포맷된 값
     - Output Tokens: 포맷된 값
     - Cost: 포맷된 값 (`formatCost`)
     - Model: 모델명 (있으면)
     - Tools: 해당 구간의 tool 그룹 요약 문자열
   - 배경: 흰색, 테두리: gray-200, 라운드 + 그림자 — 기존 차트 툴팁 스타일 동일

4. **빈 상태 처리**:
   - `usageTimeline`이 비어있으면 차트 대신 "No timeline data available" 텍스트 표시
   - `text-center text-gray-500 py-8` 스타일 — 기존 페이지의 "No messages recorded" 패턴과 동일

**데이터 전처리 로직** (컴포넌트 내부):

```typescript
// usageTimeline을 차트 데이터로 변환
const chartData = usageTimeline.map((u, idx) => ({
  // X축 라벨
  relativeTime: formatRelativeTime(u.timestamp, sessionStartedAt),
  // bar 데이터
  input: u.inputTokens,
  output: u.outputTokens,
  // 툴팁용
  cost: u.estimatedCostUsd,
  model: u.model,
  // tool 그룹 요약 (아래 로직으로 계산)
  toolSummary: getToolSummary(idx),
}))
```

### 3. 세션 상세 페이지에 차트 삽입

`packages/web/src/app/dashboard/[projectId]/sessions/[sessionId]/page.tsx` 수정:

- `SessionTimelineChart`를 import
- 기존 StatCards (2번째 grid) 아래, Conversation 섹션 위에 배치:

```tsx
{/* 기존 StatCards */}
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">...</div>

{/* 신규: Session Timeline Chart */}
<div className="bg-white rounded-lg shadow p-6">
  <h2 className="text-lg font-semibold mb-4">Session Timeline</h2>
  <SessionTimelineChart
    usageTimeline={data.usageTimeline}
    toolEvents={data.toolEvents}
    sessionStartedAt={data.startedAt}
  />
</div>

{/* 기존 Conversation */}
<div className="bg-white rounded-lg shadow p-6">...</div>
```

## Acceptance Criteria

```bash
cd /Users/choesumin/Desktop/dev/vmc/argos && pnpm --filter web build
```

컴파일 에러 없이 빌드 성공해야 한다.

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/2-session-timeline/index.json`의 phase 3 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.
작업 중 사용자 개입이 반드시 필요한 상황이 발생하면 status를 `"blocked"`로, `"blocked_reason"` 필드에 사유를 구체적으로 기록하고 작업을 즉시 중단하라.

## 주의사항

- `'use client'` 디렉티브를 차트 컴포넌트 파일 최상단에 반드시 추가하라. recharts는 클라이언트 컴포넌트에서만 동작한다.
- 기존 `token-usage-chart.tsx`의 import 패턴을 따르라 (recharts 개별 import).
- 기존 페이지의 loading/error/empty 상태 처리 코드를 건드리지 마라.
- 기존 `useSessionDetail` 훅은 수정하지 마라. Phase 2에서 API가 이미 `usageTimeline`과 `toolEvents`를 반환하도록 수정되었으므로, `SessionDetail` 타입이 확장되어 자동으로 데이터가 들어온다.
- recharts에서 `ComposedChart`를 사용하되, 필요한 컴포넌트만 import하라 (tree-shaking).
- Tool 그룹핑 시 POST_TOOL_USE만 사용하라. PRE_TOOL_USE는 "시작됨"을 의미하므로 완료된 호출만 보여주는 것이 정확하다.
- `toolName`이 null인 경우 `'unknown'`으로 표시하라.
