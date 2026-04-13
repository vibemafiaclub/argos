# Phase 10: CLI Eval

## 사전 준비

아래 문서들을 반드시 읽어라:

- `docs/code-architecture.md` — 6번 섹션 CLI (hook.ts 로직, lib 시그니처)
- `docs/flow.md` — Flow 1~8 (상태 전이 다이어그램)
- `docs/adr.md` — ADR-005, ADR-006, ADR-010

이전 phase 산출물을 반드시 확인하라:

- `packages/cli/src/commands/hook.ts`
- `packages/cli/src/commands/default.ts`
- `packages/cli/src/lib/transcript.ts`
- `packages/cli/src/lib/hooks-inject.ts`
- `packages/cli/src/lib/config.ts`
- `packages/cli/src/lib/project.ts`

## 작업 내용

Phase 9 산출물을 fresh eye로 검토하고 수정한다. **새 기능 추가 금지.**

### 검토 체크리스트

#### `commands/hook.ts` — 가장 중요한 검토 대상
- [ ] 최종적으로 항상 `process.exit(0)` 호출 (try-catch 내부 포함, 어떤 경로에서도)
- [ ] `readStdinWithTimeout`: stdin이 TTY면 즉시 null 반환
- [ ] `buildPayload`에서 `hook_event_name` snake_case → `SESSION_START` 형식 변환 정확성:
  - `SessionStart` → `SESSION_START`
  - `PreToolUse` → `PRE_TOOL_USE`
  - `PostToolUse` → `POST_TOOL_USE`
  - `Stop` → `STOP`
  - `SubagentStop` → `SUBAGENT_STOP`
- [ ] API 전송 timeout이 3초 (`AbortSignal.timeout(3000)`)
- [ ] fetch 실패(네트워크 오류, timeout) 시 에러가 catch되고 exit 0
- [ ] `debugLog`가 `ARGOS_DEBUG=1`일 때만 파일에 기록
- [ ] `isSkillCall`: `toolName === 'Skill'` (대소문자 정확)
- [ ] `isAgentCall`: `toolName === 'Agent'` (대소문자 정확)
- [ ] SessionStart에서 detectSlashCommand 호출 후 payload에 반영

#### `lib/transcript.ts`
- [ ] `extractUsageFromTranscript`: `type === 'assistant'` 항목의 `message.usage` 누적합 계산
- [ ] `detectSlashCommand`: `type === 'queue-operation'` 항목의 `content`가 `/`로 시작하는지 확인
- [ ] `extractMessages`: `type === 'human'` | `'assistant'` 항목의 `message.content`에서 text 블록만 추출 (tool_use 제외)
- [ ] message content 50,000자 truncation
- [ ] transcript 파일이 없거나 읽기 실패 시 null/[] 반환 (throw 금지)

#### `lib/hooks-inject.ts`
- [ ] 이미 `argos hook` 명령이 있으면 추가하지 않음 (idempotent)
- [ ] 5개 이벤트 모두: `SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStop`
- [ ] `.claude/settings.json` 없으면 생성
- [ ] 기존 설정을 덮어쓰지 않음 (merge)

#### `commands/default.ts`
- [ ] 4가지 상태 분기가 flow.md의 상태 전이와 일치
- [ ] Flow 4 (모두 준비된 경우): `ensureOrgMembership` 후 status 출력

#### `lib/config.ts`
- [ ] `~/.argos/config.json` 경로 (XDG 아님, HOME 기반)
- [ ] 파일 없으면 null 반환 (throw 금지)
- [ ] `requireAuth`: 없으면 사용자 안내 메시지 출력 후 `process.exit(1)`

#### `lib/project.ts`
- [ ] 현재 디렉토리부터 상위로 탐색 (최대 10단계)
- [ ] `.argos/project.json` 파일 없으면 null 반환

#### 코드 품질 (tidy first)
- [ ] ESM import 경로에 `.js` 확장자 포함 (NodeNext 모듈 해석)
- [ ] 불필요한 console.log 없음 (hook.ts에서 특히 중요 — stdout 오염 금지)
- [ ] `chalk`/`ora`를 hook.ts에서 사용하지 않음 (hook은 silent하게 동작)

### 발견된 문제 수정

즉시 수정하라.

## Acceptance Criteria

```bash
cd /Users/choesumin/Desktop/dev/vmc/argos
pnpm --filter argos-ai build
# 컴파일 에러 없음

node packages/cli/dist/index.js --help
# help 출력

node packages/cli/dist/index.js status
# 상태 출력 (로그인 안 됨 메시지)
```

## AC 검증 방법

위 커맨드 성공 시 `/tasks/1-mvp/index.json`의 phase 10 status를 `"completed"`로 변경하라.
3회 이상 실패 시 `"error"`로, 에러 내용 기록.

## 주의사항

- `hook.ts`에서 stdout에 아무것도 출력하면 안 된다. Claude Code가 hook의 stdout을 해석한다. console.log 금지.
- ESM 패키지(chalk, ora, @inquirer/prompts) import가 올바른지 확인. CJS 환경에서 동적 import가 필요할 수 있다.
- `AbortSignal.timeout(3000)`은 Node.js 17.3+ 기능이다. engines.node >= 18 이면 사용 가능.
