# Data Schema — Argos

**문서 버전**: 0.1  
**작성일**: 2026-04-14  
**페르소나**: AWS 출신 시니어 소프트웨어 엔지니어 / CTO

---

## 1. ERD

```
Organization ──< OrgMembership >── User ──< CliToken
     │
     └──< Project ──< ClaudeSession ──< Event
                           ├──< UsageRecord
                           └──< Message
```

- Organization : OrgMembership = 1 : N
- User : OrgMembership = 1 : N
- Organization : Project = 1 : N
- Project : ClaudeSession = 1 : N
- User : ClaudeSession = 1 : N
- ClaudeSession : Event = 1 : N
- ClaudeSession : UsageRecord = 1 : N
- ClaudeSession : Message = 1 : N

---

## 2. Prisma 스키마

파일 위치: `packages/api/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")  // Supabase: connection pooling 우회용 (마이그레이션 시)
}

// ─── Organization ──────────────────────────────────────────────────────────

model Organization {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  githubOrg String?  @unique
  avatarUrl String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  memberships OrgMembership[]
  projects    Project[]

  @@map("organizations")
}

// ─── User ──────────────────────────────────────────────────────────────────

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String   // bcrypt hash
  name         String
  avatarUrl    String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  memberships  OrgMembership[]
  cliTokens    CliToken[]
  sessions     ClaudeSession[]
  events       Event[]
  usageRecords UsageRecord[]

  @@map("users")
}

// ─── OrgMembership ─────────────────────────────────────────────────────────

model OrgMembership {
  id        String   @id @default(cuid())
  userId    String
  orgId     String
  role      OrgRole  @default(MEMBER)
  createdAt DateTime @default(now())

  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@unique([userId, orgId])
  @@map("org_memberships")
}

enum OrgRole {
  OWNER
  MEMBER
}

// ─── CliToken ──────────────────────────────────────────────────────────────
// ~/.argos/config.json에 저장된 장기 JWT의 revocation 관리

model CliToken {
  id         String    @id @default(cuid())
  userId     String
  tokenHash  String    @unique  // SHA-256(JWT), revocation 체크용
  createdAt  DateTime  @default(now())
  lastUsedAt DateTime?
  revokedAt  DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("cli_tokens")
}

// ─── Project ───────────────────────────────────────────────────────────────

model Project {
  id        String   @id @default(cuid())
  orgId     String
  name      String
  slug      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  organization Organization  @relation(fields: [orgId], references: [id], onDelete: Cascade)
  sessions     ClaudeSession[]
  events       Event[]
  usageRecords UsageRecord[]

  @@unique([orgId, slug])
  @@map("projects")
}

// ─── ClaudeSession ─────────────────────────────────────────────────────────
// Claude Code 세션 하나 = 하나의 row
// id는 Claude Code의 session_id를 그대로 사용 (중복 방지)

model ClaudeSession {
  id             String    @id  // Claude Code session_id
  projectId      String
  userId         String
  transcriptPath String?
  startedAt      DateTime  @default(now())
  endedAt        DateTime?

  project      Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  events       Event[]
  usageRecords UsageRecord[]

  @@index([projectId, startedAt])
  @@index([userId, startedAt])
  @@map("claude_sessions")
}

// ─── Event ─────────────────────────────────────────────────────────────────
// Claude Code hook 이벤트 하나 = 하나의 row
// 고빈도 테이블 (팀 10명, 하루 수천 건)

model Event {
  id           String    @id @default(cuid())
  sessionId    String
  userId       String
  projectId    String
  eventType    EventType
  toolName     String?
  toolInput    Json?
  toolResponse String?
  exitCode     Int?

  // 파생 필드 (쿼리 성능을 위해 저장 시 계산)
  isSkillCall    Boolean @default(false)
  skillName      String?
  isSlashCommand Boolean @default(false)  // slash command(/skill-name) vs Skill tool 직접 호출 구분
  isAgentCall    Boolean @default(false)
  agentType      String?
  agentDesc      String?
  agentId        String? // 서브에이전트 이벤트인 경우 agent_id 값 (최상위 이벤트는 null)

  timestamp DateTime @default(now())

  session ClaudeSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  user    User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  project Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId, timestamp])
  @@index([userId, timestamp])
  @@index([sessionId])
  @@index([projectId, isSkillCall, timestamp])
  @@index([projectId, isAgentCall, timestamp])
  @@map("events")
}

enum EventType {
  SESSION_START
  PRE_TOOL_USE
  POST_TOOL_USE
  STOP
  SUBAGENT_STOP
}

// ─── UsageRecord ───────────────────────────────────────────────────────────
// Stop/SubagentStop 이벤트 시 transcript에서 추출한 토큰 사용량
// 집계 쿼리의 주 대상 테이블

model UsageRecord {
  id                  String   @id @default(cuid())
  sessionId           String
  userId              String
  projectId           String
  inputTokens         Int      @default(0)
  outputTokens        Int      @default(0)
  cacheCreationTokens Int      @default(0)
  cacheReadTokens     Int      @default(0)
  estimatedCostUsd    Float?
  model               String?
  isSubagent          Boolean  @default(false)
  timestamp           DateTime @default(now())

  session ClaudeSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  user    User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  project Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId, timestamp])
  @@index([userId, timestamp])
  @@map("usage_records")
}

// ─── Message ───────────────────────────────────────────────────────────────
// 세션별 전체 대화 이력 (transcript.jsonl 파싱 결과)
// Stop/SubagentStop 이벤트 시 bulk insert
// 팀 차원의 프롬프트 패턴 분석 및 세션 상세 조회에 사용

model Message {
  id        String      @id @default(cuid())
  sessionId String
  role      MessageRole // HUMAN | ASSISTANT
  content   String      // text 블록만 저장 (tool_use 제외), 50,000자 truncation
  sequence  Int         // 세션 내 메시지 순서 (0-based)
  timestamp DateTime    // transcript 원본 타임스탬프

  session ClaudeSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId, sequence])
  @@map("messages")
}

enum MessageRole {
  HUMAN
  ASSISTANT
}
```

---

## 3. 테이블별 설계 의도

### `ClaudeSession.id`
Claude Code가 제공하는 `session_id`를 PK로 그대로 사용한다.
동일 세션의 이벤트가 여러 번 도달해도 `upsert`로 안전하게 처리된다.
cuid() 대신 외부 ID를 쓰는 이유: 이벤트가 도달하기 전에 세션이 이미 존재할 수 있고, 동시에 여러 이벤트가 같은 session_id로 오더라도 중복 생성을 방지한다.

### `Event.toolInput` (Json)
PostgreSQL JSONB로 저장된다. Skill의 `args`, Agent의 `prompt`처럼 스키마가 tool마다 다르기 때문에 구조화하지 않는다.
단, 자주 조회되는 필드(`skillName`, `agentType`)는 파생 컬럼으로 별도 저장해 인덱스를 활용한다.

### `Event.isSlashCommand`
Skill 호출 경로를 구분하는 플래그.
- `isSkillCall = true, isSlashCommand = false`: Claude가 `Skill` tool을 명시적으로 호출 (PreToolUse hook)
- `isSkillCall = true, isSlashCommand = true`: 사용자가 `/skill-name` slash command로 직접 호출 (SessionStart hook 시 transcript `queue-operation` 엔트리에서 감지)

slash command 방식은 `Skill` tool hook이 발화되지 않으므로 transcript 파싱으로 보완 수집한다.
대시보드에서 "Claude가 자율적으로 호출한 skill"과 "사용자가 직접 실행한 skill"을 분리 분석할 수 있다.

### `Event.toolResponse`
`PostToolUse` 이벤트에서 도구 실행 결과를 저장한다. 텍스트가 매우 길 수 있으므로 MVP에서는 처음 2,000자만 저장한다 (API에서 truncation 처리).

### `UsageRecord` 분리
토큰 사용량을 `Event` 테이블에 넣지 않고 별도 테이블로 분리한 이유:
- 집계 쿼리(`SUM`, `GROUP BY DATE`)가 핵심이며, 작은 테이블에서 훨씬 빠르다.
- `Stop`/`SubagentStop` 이벤트에만 존재하는 데이터로, Event 행의 대부분은 null이 될 것이다.

### `OrgRole` 단순화
MVP에서는 `OWNER`와 `MEMBER` 두 가지만 사용한다.
`OWNER`는 프로젝트/org 삭제 권한, `MEMBER`는 읽기 전용 (대시보드 조회만 가능).

---

## 4. 인덱스 전략

| 테이블 | 인덱스 | 사용 쿼리 |
|---|---|---|
| `claude_sessions` | `(projectId, startedAt)` | 프로젝트 세션 목록, 기간 필터 |
| `claude_sessions` | `(userId, startedAt)` | 사용자별 세션 목록 |
| `events` | `(projectId, timestamp)` | 프로젝트 이벤트 타임라인 |
| `events` | `(userId, timestamp)` | 사용자별 이벤트 |
| `events` | `(sessionId)` | 세션의 이벤트 목록 |
| `events` | `(projectId, isSkillCall, timestamp)` | Skill 호출 빈도 집계 |
| `events` | `(projectId, isAgentCall, timestamp)` | Agent 호출 빈도 집계 |
| `usage_records` | `(projectId, timestamp)` | 일별 토큰 사용량 시계열 |
| `usage_records` | `(userId, timestamp)` | 사용자별 토큰 집계 |

---

## 5. 핵심 쿼리 패턴

### 일별 토큰 사용량 시계열
```sql
SELECT
  DATE_TRUNC('day', timestamp)::date AS date,
  SUM(input_tokens)           AS input_tokens,
  SUM(output_tokens)          AS output_tokens,
  SUM(cache_read_tokens)      AS cache_read_tokens,
  SUM(estimated_cost_usd)     AS estimated_cost_usd
FROM usage_records
WHERE project_id = $1
  AND timestamp >= $2
  AND timestamp <= $3
GROUP BY 1
ORDER BY 1
```
→ Prisma `$queryRaw` 사용. `(projectId, timestamp)` 인덱스로 처리.

### 사용자별 토큰 집계
```sql
SELECT
  u.id, u.name, u.avatar_url,
  COUNT(DISTINCT s.id)         AS session_count,
  SUM(ur.input_tokens)         AS input_tokens,
  SUM(ur.output_tokens)        AS output_tokens,
  SUM(ur.estimated_cost_usd)   AS cost_usd,
  COUNT(CASE WHEN e.is_skill_call THEN 1 END) AS skill_calls,
  COUNT(CASE WHEN e.is_agent_call THEN 1 END) AS agent_calls
FROM users u
JOIN org_memberships om ON om.user_id = u.id AND om.org_id = $org_id
LEFT JOIN usage_records ur ON ur.user_id = u.id AND ur.project_id = $project_id
  AND ur.timestamp BETWEEN $from AND $to
LEFT JOIN claude_sessions s ON s.user_id = u.id AND s.project_id = $project_id
  AND s.started_at BETWEEN $from AND $to
LEFT JOIN events e ON e.user_id = u.id AND e.project_id = $project_id
  AND e.timestamp BETWEEN $from AND $to
GROUP BY u.id, u.name, u.avatar_url
```

### Skill 호출 빈도
```typescript
// Prisma groupBy 사용 가능
await prisma.event.groupBy({
  by: ['skillName'],
  where: {
    projectId,
    isSkillCall: true,
    skillName: { not: null },
    timestamp: { gte: from, lte: to },
  },
  _count: { id: true },
  orderBy: { _count: { id: 'desc' } },
  take: 50,
})
```

### 프로젝트 요약 (병렬 실행)
```typescript
const [sessionCount, usageTotals, activeUserCount, topSkills, topAgents] =
  await Promise.all([
    prisma.claudeSession.count({ where: { projectId, startedAt: { gte: from, lte: to } } }),
    prisma.usageRecord.aggregate({
      where: { projectId, timestamp: { gte: from, lte: to } },
      _sum: { inputTokens: true, outputTokens: true, cacheCreationTokens: true, cacheReadTokens: true, estimatedCostUsd: true },
    }),
    prisma.usageRecord.groupBy({
      by: ['userId'],
      where: { projectId, timestamp: { gte: from, lte: to } },
    }).then(r => r.length),
    // ... topSkills, topAgents
  ])
```

---

## 6. 마이그레이션 전략

### 로컬 개발
```bash
pnpm --filter @argos/api prisma migrate dev --name <이름>
```
마이그레이션 파일이 `prisma/migrations/`에 생성되고 git에 커밋된다.

### 프로덕션 (Railway 배포 시)
Dockerfile의 CMD에 `prisma migrate deploy`를 포함한다:
```dockerfile
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
```
배포 시 자동으로 pending 마이그레이션이 적용된다.

### Supabase 연결 설정
Supabase는 connection pooling(PgBouncer)을 사용하므로 두 개의 URL이 필요하다:
- `DATABASE_URL`: 풀링 URL (런타임 쿼리용, `?pgbouncer=true`)
- `DIRECT_URL`: 직접 연결 URL (마이그레이션 전용)

```env
DATABASE_URL="postgresql://postgres.[project]:[password]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[project]:[password]@aws-0-ap-northeast-2.supabase.com:5432/postgres"
```

---

## 7. 데이터 볼륨 추정 (팀 10명, 1일 기준)

| 테이블 | 예상 행/일 | 누적 1년 |
|---|---|---|
| `events` | ~5,000 | ~1.8M |
| `usage_records` | ~200 | ~73K |
| `claude_sessions` | ~100 | ~36K |
| `messages` | ~5,000 | ~1.8M |

`events`와 `messages` 테이블이 주 볼륨 (세션당 평균 50개 메시지 기준). 총 3.6M 행/년은 PostgreSQL에서 인덱스 기반 쿼리로 충분히 처리 가능한 규모다. MVP에서 파티셔닝이나 아카이빙은 불필요.
