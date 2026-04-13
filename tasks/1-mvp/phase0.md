# Phase 0: Monorepo + Shared Package

## 사전 준비

아래 문서들을 반드시 읽고 전체 아키텍처를 이해하라:

- `docs/code-architecture.md` — 전체 아키텍처, 패키지 구조, @argos/shared 스펙
- `docs/data-schema.md` — Prisma 스키마, 타입 정의 참고
- `docs/adr.md` — 기술 선택 이유

이전 phase 없음 (첫 번째 phase).

## 작업 내용

argos 모노레포 루트 설정과 `@argos/shared` 패키지를 완전히 구현한다.

### 1. 루트 설정 파일

**`package.json`** (workspace root — 런타임 코드 없음, 빌드 오케스트레이션만):
```json
{
  "name": "argos",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint"
  },
  "devDependencies": {
    "turbo": "^2"
  }
}
```

**`pnpm-workspace.yaml`**:
```yaml
packages:
  - "packages/*"
```

**`turbo.json`**:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

**`tsconfig.base.json`**:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

**`docker-compose.yml`** (로컬 개발용 PostgreSQL):
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: argos
      POSTGRES_PASSWORD: argos
      POSTGRES_DB: argos
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### 2. `packages/shared`

`packages/shared/package.json`:
```json
{
  "name": "@argos/shared",
  "version": "0.1.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "zod": "^3"
  },
  "devDependencies": {
    "typescript": "^5"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

### 3. `packages/shared/src/` 구조

아래 파일들을 구현하라:

#### `src/constants/pricing.ts`
```typescript
export interface ModelPricing {
  inputPerM: number
  outputPerM: number
  cacheWritePerM: number
  cacheReadPerM: number
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-6': { inputPerM: 3.00, outputPerM: 15.00, cacheWritePerM: 3.75, cacheReadPerM: 0.30 },
  'claude-opus-4-6':   { inputPerM: 15.00, outputPerM: 75.00, cacheWritePerM: 18.75, cacheReadPerM: 1.50 },
  'claude-haiku-4-5':  { inputPerM: 0.80, outputPerM: 4.00, cacheWritePerM: 1.00, cacheReadPerM: 0.08 },
  'default':           { inputPerM: 3.00, outputPerM: 15.00, cacheWritePerM: 3.75, cacheReadPerM: 0.30 },
}
```

#### `src/types/auth.ts`
```typescript
export interface User {
  id: string
  email: string
  name: string
  avatarUrl?: string | null
  createdAt: string
}

export interface LoginResponse {
  token: string
  user: User
}

export interface OrgMembership {
  id: string
  userId: string
  orgId: string
  role: 'OWNER' | 'MEMBER'
}
```

#### `src/types/project.ts`
```typescript
export interface Organization {
  id: string
  name: string
  slug: string
  createdAt: string
}

export interface Project {
  id: string
  orgId: string
  name: string
  slug: string
  createdAt: string
}

export interface CreateProjectResponse {
  projectId: string
  orgId: string
  orgName: string
  projectName: string
  projectSlug: string
}
```

#### `src/types/events.ts`
```typescript
export type EventType = 'SESSION_START' | 'PRE_TOOL_USE' | 'POST_TOOL_USE' | 'STOP' | 'SUBAGENT_STOP'
export type MessageRole = 'HUMAN' | 'ASSISTANT'

export interface UsagePayload {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  model?: string
}

export interface MessagePayload {
  role: MessageRole
  content: string   // text 블록만, 50,000자 truncation
  sequence: number  // 0-based
  timestamp: string // ISO 8601
}

// CLI가 POST /api/events로 전송하는 payload
export interface IngestEventPayload {
  sessionId: string
  projectId: string
  hookEventName: EventType
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResponse?: string   // 2,000자 truncation
  exitCode?: number
  agentId?: string        // 서브에이전트 이벤트인 경우
  // Stop/SubagentStop에서 CLI가 transcript에서 추출해서 채워 보냄
  usage?: UsagePayload
  messages?: MessagePayload[]
}
```

#### `src/types/dashboard.ts`
```typescript
export interface DashboardSummary {
  sessionCount: number
  activeUserCount: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheCreationTokens: number
  estimatedCostUsd: number
  topSkills: Array<{ skillName: string; callCount: number }>
  topAgents: Array<{ agentType: string; callCount: number }>
}

export interface UsageSeries {
  date: string  // YYYY-MM-DD
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  estimatedCostUsd: number
}

export interface UserStat {
  userId: string
  name: string
  avatarUrl?: string | null
  sessionCount: number
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
  skillCalls: number
  agentCalls: number
}

export interface SkillStat {
  skillName: string
  callCount: number
  slashCommandCount: number
  lastUsedAt: string
}

export interface AgentStat {
  agentType: string
  callCount: number
  sampleDesc?: string | null
}

export interface SessionItem {
  id: string
  userId: string
  userName: string
  startedAt: string
  endedAt?: string | null
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
  eventCount: number
}

export interface SessionDetail extends SessionItem {
  messages: Array<{ role: MessageRole; content: string; sequence: number; timestamp: string }>
}
```

#### `src/schemas/auth.ts`
Zod 스키마 (API 요청 검증용):
- `LoginRequestSchema`: `{ email: z.string().email(), password: z.string().min(8) }`
- `RegisterRequestSchema`: `{ email, password, name: z.string().min(1) }`

#### `src/schemas/project.ts`
- `CreateProjectSchema`: `{ name: z.string().min(1).max(100), orgId: z.string().optional() }`
- `JoinOrgSchema`: `{ orgId: z.string() }`

#### `src/schemas/events.ts`
`IngestEventSchema`: `IngestEventPayload`를 Zod으로 검증. `hookEventName`은 `z.enum(['SESSION_START', 'PRE_TOOL_USE', 'POST_TOOL_USE', 'STOP', 'SUBAGENT_STOP'])`.

#### `src/index.ts`
모든 타입, 스키마, 상수를 re-export한다:
```typescript
export * from './types/auth'
export * from './types/project'
export * from './types/events'
export * from './types/dashboard'
export * from './schemas/auth'
export * from './schemas/project'
export * from './schemas/events'
export * from './constants/pricing'
```

## Acceptance Criteria

```bash
# 루트에서 실행
cd /Users/choesumin/Desktop/dev/vmc/argos

# 의존성 설치
pnpm install

# shared 빌드
pnpm --filter @argos/shared build
# → packages/shared/dist/ 생성, 에러 없음
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 성공하면 `/tasks/1-mvp/index.json`의 phase 0 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로, `"error_message"` 필드에 에러 내용을 기록하라.

## 주의사항

- `packages/shared`에는 runtime 코드(fetch, DB 접근, 파일 I/O)를 절대 포함하지 마라. 타입, 스키마, 상수만.
- `pnpm-workspace.yaml`이 없으면 `pnpm install`이 monorepo를 인식하지 못한다. 반드시 생성하라.
- `tsconfig.base.json`의 `"module": "NodeNext"`, `"moduleResolution": "NodeNext"` 조합이 중요하다. ESM import에서 `.js` 확장자를 요구한다.
- 아직 `packages/api`, `packages/web`, `packages/cli` 디렉토리를 만들지 마라. 이후 phase에서 생성한다.
