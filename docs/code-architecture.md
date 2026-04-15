# Code Architecture — Argos

**문서 버전**: 0.1  
**작성일**: 2026-04-14  
**페르소나**: AWS 출신 시니어 소프트웨어 엔지니어 / CTO

---

## 1. 배포 토폴로지

```
┌──────────────────────────────────────────────────────────────────┐
│  개발자 머신                                                      │
│                                                                  │
│  $ argos (CLI, npm: argos-ai)                                    │
│    └─ ~/.argos/config.json  (JWT, apiUrl)                        │
│    └─ .argos/project.json   (projectId, orgId, apiUrl)           │
│    └─ .claude/settings.json (hooks: "argos hook")                │
└────────────────────────┬─────────────────────────────────────────┘
                         │ HTTPS POST /api/events
                         │ HTTPS GET  /api/auth/*
                         ▼
┌────────────────────────────────────┐
│  Railway                           │
│  packages/api  (Hono, Node.js)     │
│  PORT 3001                         │
│  DATABASE_URL → Supabase           │
└────────────────┬───────────────────┘
                 │ Prisma / pg
                 ▼
┌────────────────────────────────────┐
│  Supabase                          │
│  PostgreSQL 15                     │
│  (managed, connection pooling)     │
└────────────────────────────────────┘
                 ▲
                 │ fetch (server-side, API_URL)
┌────────────────┴───────────────────┐
│  Vercel                            │
│  packages/web  (Next.js 15)        │
│  Edge/Node runtime                 │
└────────────────────────────────────┘
```

**통신 규칙**:
- CLI → API: Bearer JWT, HTTPS
- Web (client) → API: Bearer JWT (Auth.js 세션에서 추출), HTTPS
- Web (server) → API: 서비스 내부 호출, `API_URL` env var
- API → DB: Prisma Client, `DATABASE_URL` (Supabase connection string)
- CLI 인증: 이메일/비밀번호 → `POST /api/auth/login` → JWT (브라우저/GitHub 불필요)
- Web 인증: Auth.js v5 Credentials provider → `POST /api/auth/login` → JWT를 세션에 저장

---

## 2. 모노레포 구조

```
argos/
├── packages/
│   ├── shared/                  # 공유 타입 + Zod 스키마
│   ├── api/                     # Hono API 서버 (Railway)
│   ├── web/                     # Next.js 대시보드 (Vercel)
│   └── cli/                     # argos-ai CLI (npm)
├── docs/                        # 설계 문서
├── docker-compose.yml           # 로컬 개발용 (Postgres only)
├── package.json                 # pnpm workspace root
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json           # 공통 TS 설정
```

### 패키지 의존 관계

```
cli  ──▶  shared
api  ──▶  shared
web  ──▶  shared (타입만)

cli  ──▶  api   (HTTP, 빌드 의존성 없음)
web  ──▶  api   (HTTP, 빌드 의존성 없음)
```

`shared`는 runtime 의존성. `api`/`web` 간 빌드 의존성은 없다.
패키지 간 직접 import는 `shared`만 허용한다.

---

## 3. `packages/shared`

### 역할
API 요청/응답 타입, Zod 검증 스키마, 공통 상수를 모든 패키지에 제공한다.
런타임 코드(fetch, DB 접근 등)는 포함하지 않는다.

### 디렉토리
```
packages/shared/
├── package.json          # name: "@argos/shared"
├── tsconfig.json
└── src/
    ├── index.ts          # 전체 re-export
    ├── types/
    │   ├── auth.ts       # User, CliAuthSession, OrgMembership
    │   ├── project.ts    # Organization, Project
    │   ├── events.ts     # ArgosEvent, UsageRecord, EventType
    │   └── dashboard.ts  # DashboardSummary, UsageSeries, etc.
    ├── schemas/
    │   ├── auth.ts       # IngestEventSchema, CreateProjectSchema, etc.
    │   ├── project.ts
    │   ├── events.ts
    │   └── dashboard.ts
    └── constants/
        └── pricing.ts    # MODEL_PRICING: { inputPerM, outputPerM, ... }
```

### `constants/pricing.ts`
```typescript
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-6': {
    inputPerM: 3.00,
    outputPerM: 15.00,
    cacheWritePerM: 3.75,
    cacheReadPerM: 0.30,
  },
  'claude-opus-4-6': {
    inputPerM: 15.00,
    outputPerM: 75.00,
    cacheWritePerM: 18.75,
    cacheReadPerM: 1.50,
  },
  'default': {
    inputPerM: 3.00,
    outputPerM: 15.00,
    cacheWritePerM: 3.75,
    cacheReadPerM: 0.30,
  },
}
```
모델명 매핑 실패 시 `default`를 사용한다.

---

## 4. `packages/api`

### 역할
이벤트 수집, 인증, 대시보드 데이터 집계를 담당하는 REST API 서버.

### 기술 스택
- **Runtime**: Node.js 20 (Railway)
- **Framework**: Hono v4 (TypeScript-first, 경량)
- **ORM**: Prisma v6 + PostgreSQL (Supabase)
- **검증**: Zod (스키마는 `@argos/shared`에서 import)
- **JWT**: jose
- **테스트**: Vitest

### 디렉토리
```
packages/api/
├── package.json
├── tsconfig.json
├── Dockerfile
├── .env.example
├── prisma/
│   ├── schema.prisma         # DB 스키마 (data-schema.md 참조)
│   └── migrations/           # 마이그레이션 파일 (자동 생성)
└── src/
    ├── index.ts              # 서버 진입점 (Hono app + serve)
    ├── app.ts                # Hono 앱 정의 (라우트 등록)
    ├── env.ts                # 환경변수 파싱 + 검증 (Zod)
    ├── db.ts                 # Prisma Client 싱글톤
    ├── middleware/
    │   ├── auth.ts           # Bearer JWT 검증 미들웨어
    │   └── error.ts          # 전역 에러 핸들러
    ├── routes/
    │   ├── health.ts         # GET /health
    │   ├── auth.ts           # /api/auth/*
    │   ├── orgs.ts           # /api/orgs/*
    │   ├── projects.ts       # /api/projects/*
    │   ├── events.ts         # POST /api/events
    │   └── dashboard.ts      # /api/projects/:id/dashboard/*
    └── lib/
        ├── jwt.ts            # JWT 발급 / 검증 헬퍼
        ├── cost.ts           # 토큰 → 비용 계산
        ├── events.ts         # 이벤트 파싱 (isSkillCall 등 파생)
        └── dashboard.ts      # 집계 쿼리 헬퍼
```

### 앱 구조 (`app.ts`)
```typescript
const app = new Hono()

app.use('*', cors())
app.use('*', logger())
app.onError(errorHandler)

app.route('/health', healthRoute)
app.route('/api/auth', authRoute)
app.route('/api/orgs', orgsRoute)          // auth 미들웨어 적용
app.route('/api/projects', projectsRoute)  // auth 미들웨어 적용
app.route('/api/events', eventsRoute)      // auth 미들웨어 적용

export default app
```

### 환경 변수 (`env.ts`)
```
DATABASE_URL           Supabase connection string (required)
DIRECT_URL             Supabase direct connection (마이그레이션 전용, required)
JWT_SECRET             min 32자 랜덤 문자열 (required)
WEB_URL                웹 앱 URL, e.g. https://argos.vercel.app (CORS 허용, required)
PORT                   서버 포트 (optional, default: 3001)
```

### 이벤트 처리 흐름 (`routes/events.ts`)
```
POST /api/events
  1. auth 미들웨어: JWT 검증, userId 추출
  2. Zod: 요청 body 검증 (IngestEventSchema)
     - hook_event_name 필드로 이벤트 유형 판별 (주의: `type` 아님)
  3. 프로젝트 존재 + org 멤버십 확인
  4. ClaudeSession upsert (session_id 기준)
  5. lib/events.ts: 파생 필드 계산
     - isSkillCall: tool_name === "Skill"  → skillName = tool_input.skill
     - isAgentCall: tool_name === "Agent"  → agentType = tool_input.subagent_type
     - agentId: hook payload의 agent_id 필드 (서브에이전트 이벤트 식별)
     - toolInput/toolResponse: JSON → 2,000자 truncation
  6. Event 저장
  7. Stop/SubagentStop 이벤트인 경우:
     a. transcript_path (Stop) 또는 agent_transcript_path (SubagentStop) 파싱
     b. type === "assistant" 항목의 message.usage 합산 → lib/cost.ts로 비용 계산
        → UsageRecord 저장
     c. type === "human" | "assistant" 항목 순서대로 추출
        → Message bulk insert (text 블록만, 50,000자 truncation)
  8. 202 Accepted 반환
```

Stop/SubagentStop의 transcript 파싱 및 Message insert는 응답 후 비동기로 처리해 3초 타임아웃 내 응답을 보장한다.
그 외 DB 쓰기(Event, ClaudeSession upsert)는 단일 트랜잭션으로 처리한다.

### Dockerfile
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/shared ./packages/shared
COPY packages/api ./packages/api
RUN npm install -g pnpm && pnpm install --frozen-lockfile
RUN pnpm --filter @argos/shared build
RUN pnpm --filter @argos/api build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/packages/api/dist ./dist
COPY --from=builder /app/packages/api/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/api/node_modules ./packages/api/node_modules
ENV NODE_ENV=production
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
```

---

## 5. `packages/web`

### 역할
팀 대시보드를 제공하는 Next.js 앱. 이메일/비밀번호 로그인, 데이터 시각화.

### 기술 스택
- **Framework**: Next.js 15 (App Router)
- **Auth**: Auth.js v5 (NextAuth) + Credentials provider (email/password)
- **스타일**: TailwindCSS v4 + shadcn/ui
- **차트**: Recharts v2
- **데이터 페칭**: TanStack Query v5 (client), fetch (server)
- **테스트**: Vitest + Testing Library

### 디렉토리
```
packages/web/
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── components.json           # shadcn/ui 설정
├── .env.example
└── src/
    ├── auth.ts               # Auth.js 설정
    ├── middleware.ts          # 인증 라우트 보호
    ├── app/
    │   ├── layout.tsx         # 루트 레이아웃 (Providers)
    │   ├── page.tsx           # / (랜딩 → /dashboard 리다이렉트)
    │   ├── login/
    │   │   └── page.tsx       # 이메일/비밀번호 로그인 폼
    │   ├── register/
    │   │   └── page.tsx       # 회원가입 폼
    │   ├── api/
    │   │   └── auth/
    │   │       └── [...nextauth]/
    │   │           └── route.ts
    │   ├── settings/
    │   │   ├── page.tsx               # 사용자 설정 (org 목록, 프로젝트 목록)
    │   │   └── orgs/
    │   │       └── new/
    │   │           └── page.tsx       # 새 조직 생성
    │   └── dashboard/
    │       └── [projectId]/
    │           ├── layout.tsx         # 사이드바 + 헤더
    │           ├── page.tsx           # Overview
    │           ├── users/page.tsx
    │           ├── skills/page.tsx
    │           ├── agents/page.tsx
    │           └── sessions/page.tsx
    ├── components/
    │   ├── ui/                # shadcn/ui 컴포넌트 (자동 생성)
    │   ├── layout/
    │   │   ├── sidebar.tsx
    │   │   ├── header.tsx
    │   │   └── project-switcher.tsx
    │   ├── dashboard/
    │   │   ├── stat-card.tsx
    │   │   ├── token-usage-chart.tsx  # Recharts AreaChart
    │   │   ├── skill-bar-chart.tsx    # Recharts BarChart
    │   │   └── date-range-picker.tsx
    │   └── auth/
    │       └── sign-in-button.tsx
    ├── hooks/
    │   ├── use-dashboard-summary.ts
    │   ├── use-dashboard-usage.ts
    │   ├── use-dashboard-users.ts
    │   ├── use-dashboard-skills.ts
    │   ├── use-dashboard-agents.ts
    │   └── use-dashboard-sessions.ts
    └── lib/
        ├── api-client.ts      # fetch wrapper (client-side)
        └── format.ts          # 숫자/날짜/토큰 포맷 유틸
```

### 인증 흐름 (`auth.ts`)
```typescript
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { type: 'email' },
        password: { type: 'password' },
      },
      async authorize({ email, password }) {
        // API 로그인 엔드포인트 호출
        const res = await fetch(`${env.API_URL}/api/auth/login`, {
          method: 'POST',
          body: JSON.stringify({ email, password }),
          headers: { 'Content-Type': 'application/json' },
        })
        if (!res.ok) return null
        const { token, user } = await res.json()
        return { ...user, argosToken: token }  // session에 argosToken 포함
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.argosToken = (user as any).argosToken
      return token
    },
    async session({ session, token }) {
      session.argosToken = token.argosToken as string
      return session
    }
  },
  pages: { signIn: '/login' }
})
```

### 환경 변수 (`.env.example`)
```
AUTH_SECRET=                          # min 32자 (NextAuth)
API_URL=http://localhost:3001         # 서버사이드 API 호출용
NEXT_PUBLIC_API_URL=http://localhost:3001  # 클라이언트사이드 API 호출용
```

### 데이터 페칭 전략
- **대시보드 데이터**: TanStack Query (클라이언트 페칭)
  - 날짜 범위 변경 시 자동 refetch
  - staleTime: 30초 (폴링 없음, 수동 새로고침)
- **초기 렌더링**: Server Components로 첫 데이터 prefetch (선택, 성능 최적화)
- **인증 확인**: `middleware.ts`에서 `/dashboard/*` 보호

---

## 6. `packages/cli`

### 역할
개발자 머신에 설치되는 CLI 도구. 인증, 프로젝트 초기화, hook 이벤트 수집을 담당.

### 기술 스택
- **Runtime**: Node.js 18+ (LTS)
- **CLI 프레임워크**: Commander.js v12
- **인터랙티브 프롬프트**: @inquirer/prompts
- **브라우저 열기**: open
- **스피너**: ora
- **색상**: chalk
- **테스트**: Vitest

### 디렉토리
```
packages/cli/
├── package.json          # name: "argos-ai", bin: { argos: "./dist/index.js" }
├── tsconfig.json
└── src/
    ├── index.ts           # Commander 앱 + 커맨드 등록
    ├── commands/
    │   ├── default.ts     # argos (컨텍스트 감지 메인 커맨드)
    │   ├── hook.ts        # argos hook (Claude Code hooks에서 호출)
    │   ├── status.ts      # argos status
    │   └── logout.ts      # argos logout
    └── lib/
        ├── config.ts      # ~/.argos/config.json 읽기/쓰기
        ├── project.ts     # .argos/project.json 탐색/읽기/쓰기
        ├── hooks-inject.ts # .claude/settings.json hook 주입
        ├── transcript.ts  # transcript.jsonl 토큰 추출 + slash command 감지
        ├── api-client.ts  # fetch wrapper (Authorization 헤더 자동)
        └── auth-flow.ts   # CLI 이메일/비밀번호 인증 인터랙티브 플로우
```

### `lib/config.ts` — 주요 함수 시그니처
```typescript
export function getConfigPath(): string          // ~/.argos/config.json
export function readConfig(): Config | null
export function writeConfig(config: Config): void
export function requireAuth(): Config            // 미로그인 시 에러 출력 후 process.exit(1)
```

### `argos` 커맨드 플래그
```
argos [--api-url <url>]           # API URL 재정의 (셀프호스팅)
argos hook                         # internal (Claude Code hooks에서 호출)
argos status                       # 현재 상태 확인
argos logout                       # 로그아웃
```

`argos` (메인 커맨드)의 하위 플로우에서 사용되는 인터랙티브 프롬프트:
```
? 프로젝트 이름 [현재 디렉토리명]:
? 조직 선택:
  ▸ [기존 org 목록]
    새 조직 만들기
```

### 커맨드 구조 (`index.ts`)
```typescript
const program = new Command()
  .name('argos')
  .description('Claude Code observability for AI-native teams')
  .version(pkg.version)

// argos (인자 없이 실행) → default 커맨드
program.action(defaultCommand)

program
  .command('hook')
  .description('[internal] process Claude Code hook event from stdin')
  .action(hookCommand)

program
  .command('status')
  .description('show current setup status')
  .action(statusCommand)

program
  .command('logout')
  .description('log out and remove local credentials')
  .action(logoutCommand)
```

### `commands/default.ts` — 컨텍스트 감지 로직
```typescript
async function defaultCommand(opts: { apiUrl?: string }) {
  const config = readConfig()         // ~/.argos/config.json
  const project = findProjectConfig() // .argos/project.json (상위 탐색)

  // 4가지 상태 분기
  if (!config && !project) {
    await runFullSetup(opts)          // 로그인 + 프로젝트 생성 + hook 주입
  } else if (!config && project) {
    await runLoginAndJoin(project, opts)  // 로그인 + org 합류
  } else if (config && !project) {
    await runProjectInit(config, opts)    // 프로젝트 생성 + hook 주입
  } else {
    await ensureOrgMembership(config, project)  // 합류 확인 후 status 출력
  }
}
```

### `commands/hook.ts` — 성능 요구사항
```typescript
async function hookCommand() {
  try {
    // stdin 읽기 (100ms 타임아웃 — isTTY면 즉시 종료)
    const raw = await readStdinWithTimeout(100)
    if (!raw) return

    const event = JSON.parse(raw)
    const project = findProjectConfig(process.cwd())
    if (!project) return

    const config = readConfig()
    if (!config) return

    const payload = buildPayload(event, project)

    // SessionStart: transcript에서 slash command 호출 여부 감지
    // /skill-name 방식은 Skill tool hook이 발화되지 않으므로 transcript 파싱으로 보완
    if (event.hook_event_name === 'SessionStart') {
      const slashSkill = await detectSlashCommand(event.transcript_path)
      if (slashSkill) {
        payload.isSkillCall = true
        payload.skillName = slashSkill
        payload.isSlashCommand = true
      }
    }

    // Stop/SubagentStop: transcript에서 토큰 추출
    if (isStopEvent(event)) {
      payload.usage = await extractUsageFromTranscript(event.transcript_path)
    }

    // API 전송 (3초 hard timeout, fire-and-forget)
    await apiRequest(`${resolveApiUrl(project, config)}/api/events`, {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    }, config.token)

  } catch (err) {
    debugLog(err)  // ARGOS_DEBUG=1일 때만 ~/.argos/hook-debug.log 기록
  }
  process.exit(0)  // 반드시 exit 0
}
```

### `lib/hooks-inject.ts` — 멱등성 보장
```typescript
const ARGOS_HOOK_COMMAND = 'argos hook'
const HOOK_EVENTS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop']

export function injectHooks(settingsPath: string): 'injected' | 'already_present' {
  const settings = readJsonOrEmpty(settingsPath)
  let changed = false

  for (const event of HOOK_EVENTS) {
    const hooks: HookEntry[] = settings.hooks?.[event] ?? []
    const alreadyExists = hooks.some(
      h => h.hooks?.some(cmd => cmd.command === ARGOS_HOOK_COMMAND)
    )
    if (!alreadyExists) {
      settings.hooks ??= {}
      settings.hooks[event] ??= []
      settings.hooks[event].push({
        matcher: '',
        hooks: [{ type: 'command', command: ARGOS_HOOK_COMMAND }]
      })
      changed = true
    }
  }

  if (changed) writeJson(settingsPath, settings)
  return changed ? 'injected' : 'already_present'
}
```

### `lib/transcript.ts` — 주요 함수

```typescript
// Stop/SubagentStop: transcript에서 토큰 사용량 합산
// type == "assistant" 항목의 message.usage 값을 모두 더한다
export async function extractUsageFromTranscript(transcriptPath: string): Promise<Usage | null>

// SessionStart: slash command 호출 여부 감지
// transcript의 queue-operation 엔트리에서 content가 '/'로 시작하는 항목을 찾는다
// 반환값: skill 이름 (e.g. "commit") 또는 null (일반 프롬프트 세션)
export async function detectSlashCommand(transcriptPath: string): Promise<string | null> {
  const lines = await readTranscriptLines(transcriptPath)
  const queueOp = lines.find(
    l => l.type === 'queue-operation' && typeof l.content === 'string' && l.content.startsWith('/')
  )
  if (!queueOp) return null
  return queueOp.content.slice(1)  // "/commit" → "commit"
}
```

**transcript 엔트리 타입 (테스트로 확인된 것)**:
- `user` — 사용자 메시지. slash command 시 `message.content`에 `<command-name>/skill-name</command-name>` 태그 포함
- `assistant` — Claude 응답. `message.usage`에 토큰 사용량
- `queue-operation` — 사용자 입력 원문. slash command 시 `content: "/skill-name"` (가장 이른 감지 시점)
- `attachment` — hook 오류(`hook_non_blocking_error`), skill 목록(`skill_listing`) 등
- `last-prompt` — 마지막 프롬프트 메타데이터

---

## 7. 공통 설정

### `tsconfig.base.json` (루트)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

각 패키지의 `tsconfig.json`은 이를 extends하고 `outDir`, `rootDir`만 추가.

### `turbo.json`
```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "dev": { "cache": false, "persistent": true },
    "test": { "dependsOn": ["^build"] },
    "lint": {},
    "type-check": { "dependsOn": ["^build"] }
  }
}
```

`build`의 `dependsOn: ["^build"]`로 shared → api/web/cli 순서 보장.

### `docker-compose.yml` (로컬 개발용)
```yaml
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: argos
      POSTGRES_PASSWORD: argos
      POSTGRES_DB: argos_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U argos"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

로컬 개발 시 DB만 Docker로 띄우고, api/web은 `pnpm dev`로 직접 실행.

---

## 8. API URL 우선순위

셀프호스팅을 위해 API URL은 여러 위치에서 재정의 가능하다.

```
우선순위 (높음 → 낮음):
1. CLI 실행 시 --api-url 플래그
2. .argos/project.json의 apiUrl
3. ~/.argos/config.json의 apiUrl
4. 기본값: https://server.argos-ai.xyz
```

셀프호스팅 팀은 `.argos/project.json`의 `apiUrl`을 자신의 Railway 인스턴스 URL로 설정해 커밋하면, 팀 전원이 자동으로 해당 인스턴스를 사용한다.

---

## 9. 로컬 개발 전체 실행

```bash
# 의존성 설치
pnpm install

# DB 실행
docker-compose up -d

# 환경 변수 설정
cp packages/api/.env.example packages/api/.env
cp packages/web/.env.example packages/web/.env.local
# 각 .env 파일에서 값 채우기 (DATABASE_URL, JWT_SECRET, GitHub OAuth)

# DB 마이그레이션
pnpm --filter @argos/api prisma migrate dev

# 전체 개발 서버 실행
pnpm dev
# → api: http://localhost:3001
# → web: http://localhost:3000

# CLI 로컬 테스트
pnpm --filter argos-ai build
alias argos="node $(pwd)/packages/cli/dist/index.js"
argos --api-url http://localhost:3001
```

---

## 10. 배포

### API (Railway)
1. Railway 프로젝트 생성
2. GitHub 저장소 연결, `packages/api` 서비스 설정
3. Dockerfile 경로: `packages/api/Dockerfile`
4. 환경 변수: `DATABASE_URL`(Supabase), `JWT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `WEB_URL`
5. main 브랜치 push → 자동 배포

### Web (Vercel)
1. Vercel 프로젝트 생성, GitHub 저장소 연결
2. Root Directory: `packages/web`
3. 환경 변수: `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `API_URL`, `NEXT_PUBLIC_API_URL`
4. main 브랜치 push → 자동 배포

### CLI (npm)
```bash
pnpm --filter argos-ai build
pnpm --filter argos-ai publish --access public
```
`npm install -g argos-ai` → `argos` 커맨드 사용 가능

---

## 11. Hook Stdin 스키마

Claude Code가 `argos hook` 프로세스를 spawn할 때 stdin으로 전달하는 JSON 형식.
`hook_event_name` 필드로 이벤트 유형을 판별한다.

### SessionStart
```json
{
  "hook_event_name": "SessionStart",
  "session_id": "abc123",
  "transcript_path": "/Users/jane/.claude/projects/.../transcript.jsonl"
}
```

### PreToolUse
```json
{
  "hook_event_name": "PreToolUse",
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "tool_name": "Bash",
  "tool_input": { "command": "ls -la" }
}
```

### PostToolUse
```json
{
  "hook_event_name": "PostToolUse",
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "tool_name": "Bash",
  "tool_input": { "command": "ls -la" },
  "tool_response": "file1\nfile2\n",
  "exit_code": 0
}
```

`tool_response`는 길 수 있다. API 전송 시 **2,000자로 truncate**한다.

### Stop / SubagentStop
```json
{
  "hook_event_name": "Stop",
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "stop_hook_active": false
}
```

### Skill 호출 (tool_name = "Skill")
```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "Skill",
  "tool_input": {
    "skill": "commit",
    "args": "-m 'fix: resolve null pointer'"
  }
}
```

### Agent 호출 (tool_name = "Agent")
```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "Agent",
  "tool_input": {
    "description": "Branch ship-readiness audit",
    "prompt": "Audit what's left before this branch can ship...",
    "subagent_type": "general-purpose"
  }
}
```

### Transcript JSONL — 토큰 사용량 위치
Stop 이벤트 시 `transcript_path` 파일을 읽어 마지막 `assistant` 엔트리에서 usage 추출:
```jsonl
{"type":"assistant","sessionId":"abc123","message":{"model":"claude-sonnet-4-6","usage":{"input_tokens":1500,"output_tokens":400,"cache_creation_input_tokens":600,"cache_read_input_tokens":200}}}
```

---

## 12. API Reference

Base URL: `http://localhost:3001` (dev) / `https://server.argos-ai.xyz` (prod)  
모든 인증 필요 엔드포인트: `Authorization: Bearer <jwt>` 헤더 필수  
모든 요청/응답: `Content-Type: application/json`

### 에러 응답 형식
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Bearer token is missing or invalid"
  }
}
```

| HTTP | code | 상황 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod 검증 실패 |
| 401 | `UNAUTHORIZED` | 토큰 없음/만료/revoked |
| 403 | `FORBIDDEN` | 권한 없음 (org 미가입 등) |
| 404 | `NOT_FOUND` | 리소스 없음 |
| 409 | `CONFLICT` | slug 중복 등 |
| 410 | `GONE` | CLI auth session 만료 |
| 500 | `INTERNAL_ERROR` | 서버 내부 오류 |

### Rate Limits
- `POST /api/events`: 1,000 req/min per project
- 그 외 엔드포인트: 60 req/min per user
- 응답 헤더: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

### Auth 엔드포인트

#### `POST /api/auth/cli/session`
CLI 인증 세션 시작 (no body 필요).
```json
// Response 201
{ "sessionId": "clx...", "authUrl": "https://.../auth/cli?session=clx...", "expiresAt": "..." }
```

#### `GET /api/auth/cli/session/:sessionId`
polling용. pending → completed → expired(410) 순으로 전이.
```json
// pending
{ "status": "pending" }
// completed
{ "status": "completed", "token": "eyJ...", "user": { "id": "...", "email": "...", "name": "...", "avatarUrl": "..." } }
```

#### `POST /api/auth/github/callback`
Web이 GitHub OAuth 완료 후 호출 (web → API internal).
```json
// Request
{ "sessionId": "clx...", "githubId": "12345", "email": "...", "name": "...", "avatarUrl": "..." }
// Response 200
{ "argosToken": "eyJ..." }
```

#### `DELETE /api/auth/session` (auth required)
현재 토큰 revoke. `{ "ok": true }`

#### `GET /api/auth/me` (auth required)
```json
// Response 200
{
  "id": "usr_...", "email": "...", "name": "...", "avatarUrl": "...",
  "organizations": [{ "id": "org_...", "name": "...", "slug": "...", "role": "OWNER" }]
}
```

---

### Organizations

#### `POST /api/orgs` (auth required)
```json
// Request
{ "name": "Acme Corp", "slug": "acme-corp", "githubOrg": "acme-corp" }
// Response 201
{ "id": "org_...", "name": "Acme Corp", "slug": "acme-corp", "createdAt": "..." }
```

#### `GET /api/orgs/:orgId` (auth + membership)
```json
{ "id": "...", "name": "...", "slug": "...", "memberCount": 5, "projectCount": 3, "createdAt": "..." }
```

#### `POST /api/orgs/:orgId/members` (auth)
기존 project.json을 가진 사용자가 org에 합류할 때 호출.
```json
// Request: (no body — 인증된 사용자를 MEMBER로 추가)
// Response 200
{ "ok": true }
```

#### `GET /api/orgs/:orgId/projects` (auth + membership)
```json
{ "projects": [{ "id": "...", "name": "...", "slug": "...", "createdAt": "..." }] }
```

---

### Projects

#### `POST /api/projects` (auth required)
```json
// Request
{ "orgId": "org_...", "name": "my-app", "slug": "my-app" }
// Response 201
{ "id": "proj_...", "orgId": "...", "name": "my-app", "slug": "my-app", "createdAt": "..." }
```

#### `GET /api/projects/:projectId` (auth + membership)
```json
{ "id": "...", "orgId": "...", "name": "...", "createdAt": "..." }
```

---

### Event Ingestion

#### `POST /api/events` (auth required) — 고빈도 엔드포인트
```json
// Request
{
  "projectId": "proj_...",
  "sessionId": "claude-session-xyz",
  "transcriptPath": "/path/to/transcript.jsonl",
  "hookEventName": "PreToolUse",
  "toolName": "Skill",
  "toolInput": { "skill": "commit", "args": "" },
  "toolResponse": null,
  "exitCode": null,
  "timestamp": "2026-04-14T10:05:00.123Z",
  "usage": null
}
// Stop/SubagentStop일 때 usage 필드 포함:
// "usage": { "inputTokens": 1200, "outputTokens": 340, "cacheCreationTokens": 500, "cacheReadTokens": 800, "model": "claude-sonnet-4-6", "isSubagent": false }
// Response 202
{ "ok": true }
```

서버는 `toolName` + `toolInput`에서 `isSkillCall`, `skillName`, `isAgentCall`, `agentType`, `agentDesc`를 파생해 저장한다.  
`sessionId`는 upsert — 없으면 생성, 있으면 `endedAt` 갱신(Stop 이벤트 시).

---

### Dashboard

모든 대시보드 엔드포인트: auth + org membership 필요.  
공통 query params: `?from=YYYY-MM-DD&to=YYYY-MM-DD` (기본: 최근 30일)

#### `GET /api/projects/:projectId/dashboard/summary`
```json
{
  "totalSessions": 142, "activeUsers": 8,
  "totalInputTokens": 4820000, "totalOutputTokens": 1230000, "totalCacheReadTokens": 2100000,
  "estimatedCostUsd": 47.23,
  "topSkills": [{ "skillName": "commit", "callCount": 89 }],
  "topAgentTypes": [{ "agentType": "general-purpose", "callCount": 56 }]
}
```

#### `GET /api/projects/:projectId/dashboard/usage`
query: `?from&to&userId` (userId로 특정 사용자 필터 가능)
```json
{ "series": [{ "date": "2026-04-01", "inputTokens": 320000, "outputTokens": 85000, "cacheReadTokens": 140000, "estimatedCostUsd": 3.20 }] }
```

#### `GET /api/projects/:projectId/dashboard/users`
```json
{ "users": [{ "userId": "...", "name": "...", "avatarUrl": "...", "sessionCount": 23, "totalInputTokens": 820000, "totalOutputTokens": 210000, "estimatedCostUsd": 8.14, "skillCallCount": 45, "agentCallCount": 12 }] }
```

#### `GET /api/projects/:projectId/dashboard/skills`
```json
{ "skills": [{ "skillName": "commit", "callCount": 89, "uniqueUsers": 5, "lastCalledAt": "..." }] }
```

#### `GET /api/projects/:projectId/dashboard/agents`
```json
{ "agents": [{ "agentType": "general-purpose", "callCount": 56, "uniqueUsers": 6, "descriptions": ["Branch audit", "..."], "lastCalledAt": "..." }] }
```

#### `GET /api/projects/:projectId/dashboard/sessions`
query: `?from&to&userId&limit=50&offset=0`
```json
{ "sessions": [{ "id": "...", "userId": "...", "userName": "...", "startedAt": "...", "endedAt": "...", "eventCount": 47, "inputTokens": 45000, "outputTokens": 12000, "estimatedCostUsd": 0.44 }], "total": 142 }
```

---

## 13. 보안 노트

- **JWT_SECRET**: 최소 32자 이상의 랜덤 문자열. 환경변수로만 관리, 절대 커밋하지 않는다.
- **JWT 유효기간**: 1년 (CLI 편의성). 즉각 무효화는 DB revocation으로 처리.
- **CliAuthSession.token**: 단기 세션(10분)에만 plaintext JWT 저장. TTL이 짧아 보안 리스크 낮음. 프로덕션 하드닝 시 암호화 저장 고려.
- **tokenHash**: `CliToken` 테이블에는 SHA-256(JWT)만 저장. revocation 체크 시 평문 토큰을 DB에 직접 조회하지 않는다.
- **projectId 노출**: `.argos/project.json`이 공개 저장소에 커밋될 수 있다. org 멤버십 없이는 API 접근 불가이므로 보안 리스크 없음.

---

## 14. GitHub OAuth App 설정 (개발 환경)

1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
2. Application name: `Argos Dev`
3. Homepage URL: `http://localhost:3000`
4. Authorization callback URL: `http://localhost:3000/api/auth/callback/github`

### 프로덕션 OAuth App 설정

1. Application name: `Argos`
2. Homepage URL: `https://argos-ai.xyz`
3. Authorization callback URL: `https://argos-ai.xyz/api/auth/callback/github`
5. 발급된 Client ID, Client Secret을 다음 파일에 설정:
   - `packages/api/.env` → `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
   - `packages/web/.env.local` → `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`
