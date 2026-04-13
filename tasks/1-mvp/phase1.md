# Phase 1: API Foundation (Prisma + Hono Skeleton)

## 사전 준비

아래 문서들을 반드시 읽어라:

- `docs/data-schema.md` — Prisma 스키마 전체 (8개 모델, 인덱스 전략)
- `docs/code-architecture.md` — packages/api 구조, Dockerfile, 환경변수
- `docs/adr.md` — ADR-009 (Supabase), ADR-002 (Hono), ADR-001 (Monorepo)

이전 phase 산출물을 반드시 확인하라:

- `packages/shared/src/` — 공유 타입 및 스키마
- `packages/shared/package.json`
- `package.json`, `pnpm-workspace.yaml`, `turbo.json`

## 작업 내용

`packages/api`를 초기화하고, Prisma schema를 생성 후 Supabase에 migration을 적용한다. Hono 앱의 뼈대도 구현한다.

### 1. `packages/api/package.json`

```json
{
  "name": "@argos/api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc && tsc-alias",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@argos/shared": "workspace:*",
    "@hono/node-server": "^1",
    "@prisma/client": "^6",
    "hono": "^4",
    "jose": "^5",
    "bcryptjs": "^2",
    "zod": "^3"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2",
    "@types/node": "^20",
    "prisma": "^6",
    "tsc-alias": "^1",
    "tsx": "^4",
    "typescript": "^5"
  }
}
```

### 2. `packages/api/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

### 3. `packages/api/prisma/schema.prisma`

`docs/data-schema.md`의 Prisma 스키마 섹션을 그대로 사용하라. 모든 모델, 인덱스, enum이 문서와 **정확히 일치**해야 한다.

핵심 규칙:
- `datasource db`에 `url = env("DATABASE_URL")`와 `directUrl = env("DIRECT_URL")` 모두 포함
- `ClaudeSession.id`는 `@id`만 (cuid() 없음 — Claude Code session_id를 그대로 사용)
- `Event.toolInput`은 `Json?` (JSONB)
- `Event.isSlashCommand Boolean @default(false)` 포함
- 모든 인덱스: `@@index([projectId, timestamp])`, `@@index([userId, timestamp])`, `@@index([sessionId])`, `@@index([projectId, isSkillCall, timestamp])`, `@@index([projectId, isAgentCall, timestamp])`
- `messages` 테이블 `@@index([sessionId, sequence])`

### 4. `packages/api/.env.example`

```env
DATABASE_URL="postgresql://postgres.[project]:[password]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[project]:[password]@db.uwxfseowdzuuepeeudrx.supabase.co:5432/postgres"
JWT_SECRET="replace-with-32-char-minimum-random-string"
WEB_URL="http://localhost:3000"
PORT=3001
```

### 5. Prisma Migration 적용

로컬에서 migration을 생성하고 Supabase에 적용하라.

```bash
cd packages/api
# migration 생성 (DIRECT_URL 필요, .env에 실제 값 설정 후)
pnpm prisma migrate dev --name init
```

실제 Supabase 연결을 위해 `.env` 파일에 실제 DATABASE_URL과 DIRECT_URL을 설정해야 한다.
Supabase 프로젝트 ID: `uwxfseowdzuuepeeudrx`
Supabase URL: `https://uwxfseowdzuuepeeudrx.supabase.co`

Supabase 대시보드에서 DB 비밀번호와 연결 문자열을 확인하라.
연결이 안 된다면 `packages/api/.env`에 실제 값을 채우고 migration을 적용하는 작업을 **blocked**로 표시하지 말고, `prisma migrate dev`로 migration SQL 파일만 생성하고 `prisma db push`로 스키마를 직접 푸시하는 것도 고려하라.

migration 파일은 `packages/api/prisma/migrations/` 에 생성된다. git에 커밋하라.

### 6. Hono 앱 뼈대

**`src/env.ts`** — Zod로 환경변수 파싱:
```typescript
import { z } from 'zod'
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  WEB_URL: z.string().url(),
  PORT: z.coerce.number().default(3001),
})
export const env = EnvSchema.parse(process.env)
```

**`src/db.ts`** — Prisma Client 싱글톤:
```typescript
import { PrismaClient } from '@prisma/client'
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
export const db = globalForPrisma.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
```

**`src/middleware/auth.ts`** — Bearer JWT 검증 미들웨어 (skeleton):
```typescript
// JWT 검증 후 c.set('userId', userId) 설정
// CliToken revocation 체크 (DB lookup)
// 실패 시 401 반환
```

**`src/middleware/error.ts`** — 전역 에러 핸들러:
```typescript
// ZodError → 400 { error: 'Validation error', details: ... }
// 그 외 → 500 { error: 'Internal server error' }
// 에러 메시지에 스택 트레이스 노출 금지
```

**`src/routes/health.ts`**:
```typescript
// GET /health → 200 { status: 'ok', timestamp: new Date().toISOString() }
```

**`src/app.ts`**:
```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { errorHandler } from './middleware/error'
import { healthRoute } from './routes/health'

const app = new Hono()
app.use('*', cors({ origin: env.WEB_URL }))
app.use('*', logger())
app.onError(errorHandler)
app.route('/health', healthRoute)
// TODO: 이후 phase에서 라우트 추가
export default app
```

**`src/index.ts`**:
```typescript
import { serve } from '@hono/node-server'
import app from './app'
import { env } from './env'
serve({ fetch: app.fetch, port: env.PORT }, () => {
  console.log(`API server running on port ${env.PORT}`)
})
```

## Acceptance Criteria

```bash
cd /Users/choesumin/Desktop/dev/vmc/argos

# 빌드 확인
pnpm --filter @argos/api build
# → packages/api/dist/ 생성, 컴파일 에러 없음

# Prisma migration 파일 존재 확인
ls packages/api/prisma/migrations/
# → migration 디렉토리 존재
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 성공하면 `/tasks/1-mvp/index.json`의 phase 1 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로, 에러 내용을 `"error_message"`에 기록하라.
Supabase 연결 정보가 없어 migration을 적용할 수 없는 경우, 빌드만 통과시키고 migration 파일 생성만 완료한 뒤 `"completed"`로 처리하라 (Supabase 연결은 eval phase에서 확인).

## 주의사항

- `prisma/schema.prisma`는 `docs/data-schema.md`와 **한 글자도 다르지 않게** 구현하라.
- `DIRECT_URL` 없이 migration을 실행하면 Supabase PgBouncer 연결에서 실패한다. 반드시 두 URL 모두 설정하라.
- `src/env.ts`에서 `JWT_SECRET` 길이를 최소 32자로 검증해야 한다.
- `@argos/shared`를 workspace 의존성으로 추가했으므로, `pnpm install` 후 shared가 먼저 빌드되어야 한다. turbo build 순서를 확인하라.
- Hono의 `cors()` 미들웨어에 `origin: env.WEB_URL`을 설정하라. wildcard `*`는 프로덕션에서 보안 문제가 된다.
