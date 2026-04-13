# Phase 7: API Dashboard Routes

## 사전 준비

아래 문서들을 반드시 읽어라:

- `docs/data-schema.md` — 5번 섹션 (핵심 쿼리 패턴) — 쿼리 패턴을 그대로 구현하라
- `docs/code-architecture.md` — packages/api 구조
- `docs/flow.md` — Flow 7 (웹 대시보드 탐색), 날짜 범위 필터

이전 phase 산출물을 반드시 확인하라:

- `packages/api/src/db.ts`
- `packages/api/src/middleware/auth.ts`
- `packages/shared/src/types/dashboard.ts` — 응답 타입

## 작업 내용

대시보드 데이터를 제공하는 6개 API 라우트를 구현한다.

### 공통 사항

모든 dashboard 라우트:
- 경로: `GET /api/projects/:projectId/dashboard/{endpoint}`
- auth 미들웨어 필수
- org 멤버십 확인 필수 (403)
- 공통 query params: `from` (ISO date), `to` (ISO date), 기본값: 최근 30일

### 1. `src/lib/dashboard.ts`

공통 헬퍼:

```typescript
// 프로젝트의 org 멤버십 확인 (없으면 throw)
export async function assertProjectAccess(projectId: string, userId: string): Promise<{ orgId: string }>

// from/to string → Date 파싱 (기본값: 최근 30일)
export function parseDateRange(from?: string, to?: string): { from: Date; to: Date }
```

### 2. `src/routes/dashboard.ts`

#### `GET /api/projects/:projectId/dashboard/summary`

`DashboardSummary` 반환. 병렬로 실행:
```typescript
const [sessionCount, usageTotals, activeUsers, topSkills, topAgents] = await Promise.all([
  db.claudeSession.count({ where: { projectId, startedAt: { gte: from, lte: to } } }),
  db.usageRecord.aggregate({
    where: { projectId, timestamp: { gte: from, lte: to } },
    _sum: { inputTokens: true, outputTokens: true, cacheCreationTokens: true, cacheReadTokens: true, estimatedCostUsd: true },
  }),
  db.usageRecord.groupBy({
    by: ['userId'],
    where: { projectId, timestamp: { gte: from, lte: to } },
  }).then(r => r.length),
  db.event.groupBy({
    by: ['skillName'],
    where: { projectId, isSkillCall: true, skillName: { not: null }, timestamp: { gte: from, lte: to } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 5,
  }),
  db.event.groupBy({
    by: ['agentType'],
    where: { projectId, isAgentCall: true, agentType: { not: null }, timestamp: { gte: from, lte: to } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 5,
  }),
])
```

#### `GET /api/projects/:projectId/dashboard/usage`

`UsageSeries[]` 반환 (일별 시계열). `$queryRaw` 사용:
```sql
SELECT
  DATE_TRUNC('day', timestamp)::date AS date,
  SUM(input_tokens)::int            AS "inputTokens",
  SUM(output_tokens)::int           AS "outputTokens",
  SUM(cache_read_tokens)::int       AS "cacheReadTokens",
  COALESCE(SUM(estimated_cost_usd), 0) AS "estimatedCostUsd"
FROM usage_records
WHERE project_id = ${projectId}
  AND timestamp >= ${from}
  AND timestamp <= ${to}
GROUP BY 1
ORDER BY 1
```

#### `GET /api/projects/:projectId/dashboard/users`

`UserStat[]` 반환. `data-schema.md`의 "사용자별 토큰 집계" 쿼리 패턴 참고.
Prisma `$queryRaw`로 구현하라. 날짜 범위 파라미터를 parameterized query로 전달하라.

#### `GET /api/projects/:projectId/dashboard/skills`

`SkillStat[]` 반환:
```typescript
const skills = await db.event.groupBy({
  by: ['skillName'],
  where: { projectId, isSkillCall: true, skillName: { not: null }, timestamp: { gte: from, lte: to } },
  _count: { id: true },
  orderBy: { _count: { id: 'desc' } },
  take: 50,
})
// 각 skill의 slashCommandCount는 별도 count 쿼리 (isSlashCommand: true)
// lastUsedAt은 각 skill의 max(timestamp)
```

#### `GET /api/projects/:projectId/dashboard/agents`

`AgentStat[]` 반환:
```typescript
const agents = await db.event.groupBy({
  by: ['agentType'],
  where: { projectId, isAgentCall: true, agentType: { not: null }, timestamp: { gte: from, lte: to } },
  _count: { id: true },
  orderBy: { _count: { id: 'desc' } },
  take: 50,
})
// sampleDesc: 해당 agentType의 최근 agentDesc 1개
```

#### `GET /api/projects/:projectId/dashboard/sessions`

`SessionItem[]` 반환:
```typescript
const sessions = await db.claudeSession.findMany({
  where: { projectId, startedAt: { gte: from, lte: to } },
  include: {
    user: { select: { id: true, name: true } },
    usageRecords: {
      select: { inputTokens: true, outputTokens: true, estimatedCostUsd: true },
    },
    _count: { select: { events: true } },
  },
  orderBy: { startedAt: 'desc' },
  take: 100,
})
```

#### `GET /api/projects/:projectId/dashboard/sessions/:sessionId`

`SessionDetail` 반환 (messages 포함):
```typescript
const session = await db.claudeSession.findUnique({
  where: { id: sessionId },
  include: {
    user: { select: { id: true, name: true } },
    usageRecords: true,
    messages: { orderBy: { sequence: 'asc' } },
    _count: { select: { events: true } },
  },
})
```

### 3. `src/app.ts` 업데이트

```typescript
app.route('/api/projects', projectsRoute)  // 이미 있음
// dashboard 라우트는 projectsRoute 내부에 중첩하거나 별도 라우터로 구성
// 권장: /api/projects/:projectId/dashboard/* 를 projectsRoute에 포함
```

## Acceptance Criteria

```bash
cd /Users/choesumin/Desktop/dev/vmc/argos
pnpm --filter @argos/api build
# 컴파일 에러 없음
```

## AC 검증 방법

빌드 성공 시 `/tasks/1-mvp/index.json`의 phase 7 status를 `"completed"`로 변경하라.
3회 이상 실패 시 `"error"`로, 에러 내용 기록.

## 주의사항

- `$queryRaw`에서 SQL injection을 방지하기 위해 Prisma tagged template literal(`Prisma.sql`) 또는 parameterized query를 사용하라. 문자열 interpolation 금지.
- `DATE_TRUNC` 결과는 JavaScript `Date` 객체로 반환된다. 응답 전에 `YYYY-MM-DD` 문자열로 변환하라.
- `_count`로 집계 시 null이 될 수 있는 합계는 `?? 0`으로 fallback.
- skills/agents endpoint의 `slashCommandCount`와 `lastUsedAt`은 추가 쿼리 필요. N+1 방지를 위해 IN 절이나 groupBy로 한번에 가져와라.
- 모든 라우트에서 org 멤버십 확인을 빠뜨리지 마라.
