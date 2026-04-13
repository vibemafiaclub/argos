# Phase 9: CLI (argos-ai)

## 사전 준비

아래 문서들을 반드시 읽어라:

- `docs/code-architecture.md` — 6번 섹션 `packages/cli` 전체 (디렉토리, 함수 시그니처, hook.ts 로직)
- `docs/flow.md` — Flow 1~8 (전체 CLI 플로우)
- `docs/adr.md` — ADR-005, ADR-006, ADR-007, ADR-010

이전 phase 산출물을 반드시 확인하라:

- `packages/shared/src/types/events.ts` — IngestEventPayload
- `packages/shared/src/types/auth.ts` — LoginResponse
- `packages/shared/src/types/project.ts` — CreateProjectResponse

## 작업 내용

`argos-ai` CLI 패키지 전체를 구현한다.

### 1. `packages/cli/package.json`

```json
{
  "name": "argos-ai",
  "version": "0.1.0",
  "bin": { "argos": "./dist/index.js" },
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "prepublishOnly": "pnpm build"
  },
  "dependencies": {
    "@argos/shared": "workspace:*",
    "@inquirer/prompts": "^7",
    "chalk": "^5",
    "commander": "^12",
    "ora": "^8"
  },
  "devDependencies": {
    "@types/node": "^20",
    "typescript": "^5"
  },
  "engines": { "node": ">=18" }
}
```

### 2. `packages/cli/tsconfig.json`

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

빌드 후 dist/index.js 첫 줄에 `#!/usr/bin/env node` shebang 추가가 필요하다. `package.json`의 `build` 스크립트에 `&& echo '#!/usr/bin/env node' | cat - dist/index.js > tmp && mv tmp dist/index.js` 추가하거나, `index.ts` 파일 최상단에 `#!/usr/bin/env node` 주석을 포함하라.

### 3. `src/lib/config.ts`

파일 위치: `~/.argos/config.json`

```typescript
interface Config {
  token: string
  apiUrl: string
  userId: string
  email: string
}

export function getConfigPath(): string
export function readConfig(): Config | null
export function writeConfig(config: Config): void
export function deleteConfig(): void
export function requireAuth(): Config  // 없으면 에러 출력 후 process.exit(1)
```

### 4. `src/lib/project.ts`

파일 위치: `.argos/project.json` (현재 디렉토리부터 상위 탐색)

```typescript
interface ProjectConfig {
  projectId: string
  orgId: string
  orgName: string
  projectName: string
  apiUrl: string
}

export function findProjectConfig(startDir?: string): ProjectConfig | null
// process.cwd()부터 상위 디렉토리로 탐색, 최대 10단계
export function writeProjectConfig(config: ProjectConfig, dir?: string): void
// dir/.argos/project.json에 저장
// dir/.argos/.gitignore에 "# argos 설정 (gitignore 하지 않음)" 주석 추가 (파일 자체는 gitignore 안 함)
```

### 5. `src/lib/api-client.ts`

```typescript
// baseUrl은 config 또는 project.json에서 읽음
// Authorization: Bearer {token} 헤더 자동 추가
// timeout: 10초 (hook 제외)
// 에러 시 적절한 메시지와 함께 throw

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { token?: string; baseUrl?: string }
): Promise<T>
```

### 6. `src/lib/hooks-inject.ts`

`docs/code-architecture.md`의 `lib/hooks-inject.ts` 시그니처를 그대로 구현:

```typescript
const ARGOS_HOOK_COMMAND = 'argos hook'
const HOOK_EVENTS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop']

export function injectHooks(settingsPath: string): 'injected' | 'already_present'
// 이미 'argos hook'이 있으면 추가하지 않음 (idempotent)
// settings.json 없으면 생성
```

`.claude/settings.json` 구조:
```json
{
  "hooks": {
    "SessionStart": [{ "matcher": "", "hooks": [{ "type": "command", "command": "argos hook" }] }],
    "PreToolUse": [{ "matcher": "", "hooks": [{ "type": "command", "command": "argos hook" }] }],
    ...
  }
}
```

### 7. `src/lib/transcript.ts`

```typescript
import type { UsagePayload, MessagePayload } from '@argos/shared'

// transcript.jsonl 파일을 읽어 라인별로 파싱
export async function readTranscriptLines(path: string): Promise<any[]>

// Stop/SubagentStop: type==="assistant" 항목의 message.usage를 합산
export async function extractUsageFromTranscript(transcriptPath: string): Promise<UsagePayload | null>

// SessionStart: queue-operation 엔트리에서 slash command 감지
// content가 '/'로 시작하면 '/commit' → 'commit' 반환
export async function detectSlashCommand(transcriptPath: string): Promise<string | null>

// 전체 대화에서 HUMAN/ASSISTANT 메시지 추출 (text 블록만, 50k truncation)
export async function extractMessages(transcriptPath: string): Promise<MessagePayload[]>
```

transcript 라인 타입:
- `type === 'assistant'`: `message.usage` 에 토큰 사용량
- `type === 'human'` / `type === 'assistant'`: `message.content` 배열에 text 블록
- `type === 'queue-operation'`: `content` 필드에 slash command 문자열

### 8. `src/lib/auth-flow.ts`

```typescript
// inquirer/prompts로 이메일/비밀번호 인터랙티브 입력
// POST /api/auth/login 호출
// 실패 시 "argos register를 먼저 실행하세요" 안내
export async function runLoginFlow(apiUrl: string): Promise<{ token: string; user: User }>
export async function runRegisterFlow(apiUrl: string): Promise<{ token: string; user: User }>
```

### 9. `src/commands/default.ts`

`docs/code-architecture.md`의 `commands/default.ts` 컨텍스트 감지 로직을 구현:

```typescript
// 4가지 상태 분기:
// 1. !config && !project → runFullSetup (로그인 + 프로젝트 생성 + hook 주입)
// 2. !config && project  → runLoginAndJoin (로그인 + org 합류)
// 3. config && !project  → runProjectInit (프로젝트 생성 + hook 주입)
// 4. config && project   → ensureOrgMembership + status 출력
```

Flow 1~4의 완료 메시지를 `docs/flow.md`와 동일하게 구현.

### 10. `src/commands/hook.ts`

`docs/code-architecture.md`의 `commands/hook.ts` 를 그대로 구현:

```typescript
async function hookCommand() {
  try {
    const raw = await readStdinWithTimeout(100)
    if (!raw) return

    const event = JSON.parse(raw)
    const project = findProjectConfig(process.cwd())
    if (!project) return

    const config = readConfig()
    if (!config) return

    // 파생 필드 계산
    const payload: IngestEventPayload = buildPayload(event, project, config)

    // SessionStart: slash command 감지
    if (event.hook_event_name === 'SessionStart' && event.transcript_path) {
      const slashSkill = await detectSlashCommand(event.transcript_path)
      if (slashSkill) {
        payload.isSkillCall = true
        payload.skillName = slashSkill
        payload.isSlashCommand = true
      }
    }

    // Stop/SubagentStop: transcript에서 데이터 추출
    if (['Stop', 'SubagentStop'].includes(event.hook_event_name)) {
      const transcriptPath = event.transcript_path || event.agent_transcript_path
      if (transcriptPath) {
        payload.usage = await extractUsageFromTranscript(transcriptPath) || undefined
        payload.messages = await extractMessages(transcriptPath)
      }
    }

    // API 전송 (3초 hard timeout)
    const apiUrl = project.apiUrl || config.apiUrl
    await fetch(`${apiUrl}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    })

  } catch (err) {
    debugLog(err)  // ARGOS_DEBUG=1일 때만 ~/.argos/hook-debug.log에 기록
  }
  process.exit(0)  // 반드시 exit 0
}
```

`buildPayload`:
- `hook_event_name` → `hookEventName` (camelCase 변환)
- `tool_name` → `toolName`
- `tool_input` → `toolInput`
- `session_id` → `sessionId`
- `agent_id` → `agentId`
- isSkillCall/isAgentCall 등은 여기서 계산 (API의 deriveFields와 동일 로직 중복)

**`readStdinWithTimeout(ms)`**: stdin이 TTY면 즉시 null 반환. 아니면 `ms` 내에 데이터 읽음.

**`debugLog(err)`**: `ARGOS_DEBUG=1` 환경변수가 있을 때만 `~/.argos/hook-debug.log`에 append.

### 11. `src/commands/status.ts`

현재 상태를 보기 좋게 출력:
- 로그인 여부 (email, apiUrl)
- 프로젝트 여부 (projectName, orgName)
- hooks 설치 여부 (.claude/settings.json)

### 12. `src/commands/logout.ts`

```typescript
// POST /api/auth/logout (token revoke)
// deleteConfig()
// 완료 메시지
```

### 13. `src/index.ts`

Commander 앱 설정:
```typescript
#!/usr/bin/env node
const program = new Command()
  .name('argos')
  .description('Claude Code observability for AI-native teams')
  .version(pkg.version)
  .option('--api-url <url>', 'API URL override (for self-hosting)')

program.action(defaultCommand)
program.command('hook').description('[internal] process hook event from stdin').action(hookCommand)
program.command('status').description('show current setup status').action(statusCommand)
program.command('logout').description('log out and remove local credentials').action(logoutCommand)

program.parseAsync(process.argv)
```

## Acceptance Criteria

```bash
cd /Users/choesumin/Desktop/dev/vmc/argos
pnpm --filter argos-ai build
# 컴파일 에러 없음, dist/index.js 생성됨

node packages/cli/dist/index.js --help
# argos CLI help 출력됨
```

## AC 검증 방법

위 커맨드 성공 시 `/tasks/1-mvp/index.json`의 phase 9 status를 `"completed"`로 변경하라.
3회 이상 실패 시 `"error"`로, 에러 내용 기록.

## 주의사항

- `hookCommand`는 반드시 마지막에 `process.exit(0)`를 호출한다. try-catch 어디서든 exit 0이 보장되어야 한다.
- `readStdinWithTimeout`에서 process.stdin이 TTY일 때 즉시 null 반환 — 사용자가 `argos hook`을 직접 실행하면 즉시 종료해야 한다.
- `buildPayload` 시 `hook_event_name`을 snake_case에서 `SESSION_START` 등 enum 형식으로 변환하라: `'SessionStart' → 'SESSION_START'`
- CLI에서 chalk, ora는 TTY에서만 사용 (파이프된 환경에서 ANSI escape 코드가 출력되지 않도록).
- `chalk` v5, `ora` v8은 ESM-only 패키지다. `tsconfig.json`의 `module: NodeNext`와 package.json의 `"type": "module"` 설정이 필요할 수 있다. 빌드 방식을 고려하라.
- `@inquirer/prompts`도 ESM이다. CommonJS로 빌드한다면 `require()`가 동작하지 않는다. ESM으로 통일하거나 CJS 대안을 사용하라.
- `packages/cli/package.json`에 `"type": "module"` 추가 권장.
