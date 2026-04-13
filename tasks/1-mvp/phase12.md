# Phase 12: Web Dashboard Pages

## 사전 준비

아래 문서들을 반드시 읽어라:

- `docs/code-architecture.md` — 5번 섹션 web (components, hooks, lib/api-client)
- `docs/flow.md` — Flow 7 (대시보드 탐색 구조, 날짜 범위 필터)

이전 phase 산출물을 반드시 확인하라:

- `packages/web/src/auth.ts`
- `packages/web/src/app/dashboard/[projectId]/layout.tsx`
- `packages/shared/src/types/dashboard.ts` — 모든 응답 타입
- `packages/api/src/routes/dashboard.ts` — API 엔드포인트 URL 확인

## 작업 내용

대시보드 5개 페이지를 구현한다. TanStack Query를 사용한 클라이언트 페칭 방식.

### 1. 의존성 추가

`packages/web/package.json`에 추가:
```json
{
  "dependencies": {
    "@tanstack/react-query": "^5",
    "recharts": "^2",
    "date-fns": "^4"
  }
}
```

### 2. `src/lib/api-client.ts`

클라이언트 사이드 API 요청 헬퍼:
```typescript
// NEXT_PUBLIC_API_URL 기반
// Authorization: Bearer {argosToken} (useSession에서 가져옴)
export async function apiGet<T>(path: string, token: string): Promise<T>
```

### 3. `src/lib/format.ts`

포맷 유틸:
```typescript
export function formatTokens(n: number): string  // 1,234,567 → "1.2M"
export function formatCost(usd: number): string   // 0.00123 → "$0.0012"
export function formatDate(s: string): string     // "2026-04-14" → "Apr 14"
```

### 4. QueryProvider (`src/components/providers.tsx`)

```typescript
'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
// singleton queryClient
```

`src/app/layout.tsx`에서 `<Providers>` 래핑.

### 5. 공통 컴포넌트

**`src/components/dashboard/stat-card.tsx`**:
```typescript
interface StatCardProps { title: string; value: string | number; description?: string; icon?: React.ReactNode }
```
shadcn `Card`를 사용해 깔끔하게 구현.

**`src/components/dashboard/date-range-picker.tsx`**:
- 프리셋: 7일, 30일, 90일 (기본: 30일)
- URL 쿼리 파라미터 `from`/`to`와 동기화 (`useSearchParams`, `useRouter`)
- shadcn `Select` 또는 버튼 그룹으로 구현 (달력 없이 단순하게)

**`src/components/dashboard/token-usage-chart.tsx`**:
- Recharts `AreaChart` (반응형)
- X축: 날짜, Y축: 토큰 수
- inputTokens + outputTokens 두 영역 표시

**`src/components/dashboard/skill-bar-chart.tsx`**:
- Recharts `BarChart` (수평)
- Skill 이름 + 호출 수

### 6. TanStack Query 훅

`src/hooks/use-dashboard-*.ts` — 각 엔드포인트에 대한 훅:

```typescript
// 예시 패턴
export function useDashboardSummary(projectId: string, from: string, to: string) {
  const { data: session } = useSession()
  return useQuery({
    queryKey: ['dashboard', 'summary', projectId, from, to],
    queryFn: () => apiGet<DashboardSummary>(
      `/api/projects/${projectId}/dashboard/summary?from=${from}&to=${to}`,
      session?.argosToken ?? ''
    ),
    staleTime: 30_000,
    enabled: !!session?.argosToken,
  })
}
```

`useSession`은 `next-auth/react`에서 import.

### 7. 대시보드 페이지들

#### `src/app/dashboard/[projectId]/page.tsx` — Overview

- `StatCard` 4개: 세션 수, 활성 유저, 총 토큰, 예상 비용
- `TokenUsageChart` (일별 시계열)
- Top Skills 테이블 (5개)
- `DateRangePicker` 헤더
- 로딩 상태: shadcn `Skeleton`

#### `src/app/dashboard/[projectId]/users/page.tsx` — Users

- 사용자 테이블: 이름, 세션 수, 입력/출력 토큰, 예상 비용, Skill 호출, Agent 호출
- shadcn `Table` 컴포넌트 사용

#### `src/app/dashboard/[projectId]/skills/page.tsx` — Skills

- `SkillBarChart` (상위 10개 skill)
- 테이블: skill 이름, 총 호출, slash command 호출, 마지막 사용일

#### `src/app/dashboard/[projectId]/agents/page.tsx` — Agents

- 테이블: agent 타입, 호출 수, 샘플 설명
- 또는 카드 그리드 형태

#### `src/app/dashboard/[projectId]/sessions/page.tsx` — Sessions

- 세션 테이블: 사용자, 시작/종료 시간, 토큰, 비용, 이벤트 수
- 행 클릭 시 `/dashboard/[projectId]/sessions/[sessionId]`로 이동

#### `src/app/dashboard/[projectId]/sessions/[sessionId]/page.tsx` — Session Detail

- 세션 메타 정보 (StatCard들)
- 전체 대화 렌더링 (HUMAN/ASSISTANT 버블 스타일)
- HUMAN: 왼쪽 정렬, ASSISTANT: 오른쪽 정렬 (또는 색상 구분)

### 8. `src/components/layout/sidebar.tsx` 완성

```typescript
// 링크: Overview (/dashboard/[projectId])
//       Users (/dashboard/[projectId]/users)
//       Skills (/dashboard/[projectId]/skills)
//       Agents (/dashboard/[projectId]/agents)
//       Sessions (/dashboard/[projectId]/sessions)
// 현재 경로에 active 스타일
// 하단: 로그아웃 버튼
```

## Acceptance Criteria

```bash
cd /Users/choesumin/Desktop/dev/vmc/argos
pnpm --filter @argos/web build
# 빌드 에러 없음
```

## AC 검증 방법

빌드 성공 시 `/tasks/1-mvp/index.json`의 phase 12 status를 `"completed"`로 변경하라.
3회 이상 실패 시 `"error"`로, 에러 내용 기록.

## 주의사항

- `useSession`을 사용하는 컴포넌트는 반드시 `'use client'`여야 한다.
- TanStack Query `QueryClientProvider`는 Client Component여야 한다.
- `useSearchParams()`는 Suspense 경계 내에서 사용해야 한다 (Next.js 경고).
- Recharts 컴포넌트는 SSR에서 동작하지 않으므로 `'use client'` + dynamic import 또는 직접 client 컴포넌트로 사용하라.
- `session?.argosToken`이 없을 때 API 호출하지 않도록 `enabled: !!session?.argosToken` 설정.
- 세션 detail 페이지에서 메시지 렌더링 시 XSS 방지: `dangerouslySetInnerHTML` 사용 금지, 텍스트 그대로 렌더링.
