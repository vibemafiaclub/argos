# Argos × Codex 연동 리서치 & 설계

> 목적: 현재 Claude Code 전용인 Argos 를 **OpenAI Codex CLI** 환경에서도 세팅·트래킹할 수 있게 만들기 위한
> 정밀 리서치 + 로컬 검증 + 구현 설계 문서.
>
> 검증 환경: `codex-cli 0.133.0` (`@openai/codex@0.133.0`, darwin-arm64), 2026-05-26.
> 각 사실에는 근거를 표기한다 — **[검증]** = 로컬 codex 로 실제 실행해 확인, **[스키마]** = codex 네이티브 바이너리에
> 임베드된 JSON Schema 에서 추출, **[문서]** = developers.openai.com 공식 문서, **[설계]** = 본 문서의 제안.

---

## 0. TL;DR

- Codex 0.133 에는 **Claude Code 와 거의 호환되는 hooks 시스템**이 내장돼 있다(`hooks` feature, stable·기본 ON). **[검증]**
- hook 설정 파일 `hooks.json` 의 JSON 구조는 Claude Code 와 **동일한 모양**(`{ "hooks": { "<Event>": [{ "matcher", "hooks": [{ "type":"command", "command" }] }] } }`)이다. **[문서/검증]**
- hook 이 stdin 으로 넘기는 payload 도 Claude Code 와 거의 동일하다: `hook_event_name`, `session_id`, `transcript_path`, `tool_name`, `tool_input`, `tool_response`, `tool_use_id` 등. Codex 는 여기에 `model`, `turn_id` 를 추가로 준다. **[스키마]**
- 따라서 `argos hook` 의 **stdin 파싱 로직(`buildPayload`)은 거의 그대로 재사용 가능**하다.
- **결정적 차이 2가지:**
  1. **transcript 포맷이 완전히 다르다.** Codex 의 transcript(rollout JSONL)는 `response_item`/`event_msg` 구조라서, Claude Code 의 `type:"assistant"` 기반 파서(`transcript.ts`)는 **usage·messages 를 하나도 못 뽑는다(검증: usage=null, messages=0)**. Codex 전용 파서가 필요하다. 또한 공식 문서가 *"transcript 포맷은 안정적인 인터페이스가 아니며 바뀔 수 있다"* 고 명시한다. **[검증/문서]**
  2. **hook trust 게이트.** Codex 는 신뢰되지 않은(untrusted) hook 을 `codex exec` 에서 실행하지 않는다. `--dangerously-bypass-hook-trust` 를 줘도 본 검증에선 신규 hook 이 실행되지 않았다. 신뢰는 보통 대화형 TUI 의 `/hooks` 리뷰로 등록되며 `config.toml` 의 `[hooks.state]` 에 해시로 영속된다. → **팀원이 `argos` 한 번으로 끝나던 무마찰 세팅이 Codex 에선 "hook 신뢰" 단계가 추가된다.** **[검증]**

---

## 1. 현재 Argos(Claude Code) 동작 복기

Argos 의 트래킹 파이프라인(현행):

1. `argos` 실행 → 로그인/프로젝트 초기화 → `.argos/project.json` 생성 + **`.claude/settings.json` 에 hook 주입**
   (`packages/cli/src/lib/hooks-inject.ts`).
   주입되는 이벤트: `SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStop`.
2. Claude Code 가 hook 을 쏠 때마다 `argos hook` 이 stdin 으로 이벤트 JSON 을 받는다
   (`packages/cli/src/commands/hook.ts`).
3. `Stop`/`SubagentStop` 시 `transcript_path`(Claude Code 의 `~/.claude/.../*.jsonl`)를 파싱해
   usage·per-turn usage·messages·summary 를 추출한다 (`packages/cli/src/lib/transcript.ts`).
4. 백그라운드 프로세스로 `POST /api/events` 전송 (`packages/cli/src/lib/event-sender.ts`).

핵심 의존: **(a) hook stdin 스키마**, **(b) transcript JSONL 스키마**. Codex 는 (a)는 호환, (b)는 비호환이다.

---

## 2. Codex hooks 시스템

### 2.1 feature 상태 — 기본 ON **[검증]**

```
$ codex features list | grep hook
hooks            stable    true
plugin_hooks     stable    true
```

`hooks` 는 stable·기본 활성. (구 이름 `codex_hooks`. codex ≥0.129 부터 기본 ON.) 명시적으로 켜려면
`codex --enable hooks` 또는 `config.toml` 의 `[features] hooks = true`.

> 검증 메모: `codex exec` 환경에서 신규 hook 을 실제로 발사시키려면 실험적으로 `--enable hooks` 를 명시해야
> 동작이 안정적이었다(미지정 시 일부 케이스에서 hook 단계 로그가 누락). 운영 시에는 기본 ON 에 의존하되,
> CI/자동화에선 `--enable hooks` 를 함께 주는 것을 권장.

### 2.2 discovery 위치 & 우선순위 **[문서]**

```
1. User-level    : ~/.codex/hooks.json          또는 ~/.codex/config.toml 의 inline [hooks]
2. Project-level : <repo>/.codex/hooks.json      또는 <repo>/.codex/config.toml 의 inline [hooks]
3. Plugin-bundled: 플러그인 manifest / 기본 hooks/hooks.json
4. Managed       : requirements.toml (관리자/MDM)
```

- **Project-local hook 은 `.codex/` 레이어가 trust 된 경우에만 로드된다.** User-level hook 은 project trust 와 무관.
- 같은 레이어에서 `hooks.json` 과 inline `[hooks]` 가 둘 다 있으면 merge 하되 경고.

→ **Argos 는 `<repo>/.codex/hooks.json` 에 주입**하는 게 Claude Code 의 `.claude/settings.json` 주입과 대칭적이고
저장소 커밋으로 팀 공유가 된다.

### 2.3 hooks.json 구조 — Claude Code 호환 **[문서/검증]**

공식 예시:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "/usr/bin/python3 \"script.py\"", "statusMessage": "Checking Bash command", "timeout": 30 }
        ]
      }
    ]
  }
}
```

inline TOML 형태도 가능:

```toml
[[hooks.PreToolUse]]
matcher = "^Bash$"
[[hooks.PreToolUse.hooks]]
type = "command"
command = '/usr/bin/python3 "$(git rev-parse --show-toplevel)/.codex/hooks/check.py"'
timeout = 30
```

핸들러 필드: `type`("command"), `command`, `statusMessage`(선택), `timeout`(초, 기본 600). **[문서]**

> 즉 Argos 의 기존 `injectHooks` 가 만들던 `{ matcher, hooks:[{type:"command", command:"argos hook"}] }` 구조를
> **`.codex/hooks.json` 에 그대로 쓸 수 있다.**

### 2.4 이벤트 목록 & 스코프 **[스키마/문서]**

바이너리 임베드 스키마의 `HookEventNameWire` enum 전체:

```
PreToolUse, PermissionRequest, PostToolUse, PreCompact, PostCompact,
SessionStart, UserPromptSubmit, SubagentStart, SubagentStop, Stop
```

| Event | Scope | Matcher |
|---|---|---|
| `SessionStart` | thread/session-start | `source` (startup\|resume\|clear\|compact) |
| `SubagentStart` | subagent-start | `agent_type` |
| `UserPromptSubmit` | turn | (없음) |
| `PreToolUse` | turn | tool name (Bash, apply_patch, MCP …) |
| `PermissionRequest` | turn | tool name |
| `PostToolUse` | turn | tool name |
| `PreCompact` / `PostCompact` | turn | `trigger` (manual\|auto) |
| `SubagentStop` | turn | `agent_type` |
| `Stop` | turn | (없음) |

Argos 가 쓸 이벤트는 Claude Code 와 동일하게 **`SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStop`** 으로
1:1 매핑된다.

### 2.5 hook stdin payload 스키마 (event 별) **[스키마]**

> 근거: codex 네이티브 바이너리에 임베드된 draft-07 JSON Schema (`<event>.command.input`) 에서 직접 추출.

공통 필드(거의 모든 이벤트): `cwd`(string), `hook_event_name`(string), `model`(string),
`permission_mode`(default\|acceptEdits\|plan\|dontAsk\|bypassPermissions), `session_id`(string),
`transcript_path`(string\|null), `turn_id`(turn-scope 이벤트).

| Event | 추가 필드 |
|---|---|
| `SessionStart` | `source`(startup\|resume\|clear\|compact) · *turn_id 없음* |
| `UserPromptSubmit` | `prompt`(string) |
| `PreToolUse` | `tool_name`, `tool_input`(any), `tool_use_id` |
| `PostToolUse` | `tool_name`, `tool_input`(any), `tool_response`(any), `tool_use_id` |
| `PreCompact`/`PostCompact` | `trigger`(manual\|auto) |
| `Stop` / `SubagentStop` | `stop_hook_active`(bool), `agent_id`, `agent_type`, `agent_transcript_path`(string\|null), `last_assistant_message`(string\|null) |

### 2.6 Claude Code vs Codex hook stdin 호환 매트릭스

`packages/cli/src/commands/hook.ts` 의 `HookStdinPayload` / `buildPayload` 기준:

| argos 가 읽는 필드 | Claude Code | Codex | 비고 |
|---|---|---|---|
| `hook_event_name` | ✅ (PascalCase) | ✅ (PascalCase) | 동일. `convertEventType` 그대로 동작 |
| `session_id` | ✅ | ✅ | |
| `transcript_path` | ✅ | ✅ (nullable) | **가리키는 파일 포맷이 다름** (§3) |
| `agent_id` | ✅ | ✅ (Stop/SubagentStop) | subagent 스킵 로직 그대로 |
| `agent_transcript_path` | ✅ | ✅ | |
| `tool_name` / `tool_input` / `tool_response` / `tool_use_id` | ✅ | ✅ | 동일 |
| `exit_code` | ✅ | ❌ | Codex 는 미제공 (PostToolUse 는 `tool_response` 로 결과 전달) |
| `model` | ❌ | ✅ | **Codex 신규** — transcript 파싱 없이 모델명 확보 가능 |
| `turn_id` | ❌ | ✅ | per-turn 식별자 |

→ **stdin 레벨에서는 `argos hook` 가 코드 수정 거의 없이 Codex payload 를 받을 수 있다.**
`exit_code` 부재만 옵셔널 처리하면 됨(이미 `if (event.exit_code !== undefined)` 가드 있음).

### 2.7 hook 출력(반환) 규약 **[문서/스키마]**

stdout 으로 JSON 을 돌려주면 codex 가 흐름을 제어할 수 있다(`continue`, `stopReason`, `systemMessage`,
`suppressOutput`, PreToolUse 의 permission decision 등). **Argos 는 fire-and-forget 이므로 출력 없이 exit 0** 이면 된다
(Claude Code 와 동일 정책). exit code: `0`=성공, `2`=block/deny, 그 외=error. **[문서]**

### 2.8 hook trust 게이트 — **가장 중요한 운영 제약** **[검증]**

Codex 는 비관리(non-managed) command hook 을 실행 전에 **신뢰(trust)** 받도록 요구한다.

- 신뢰는 보통 **대화형 TUI 의 `/hooks` 리뷰**에서 등록되고, `~/.codex/config.toml`(또는 project config)의
  `[hooks.state]` 에 다음과 같이 해시로 영속된다:
  ```toml
  [hooks.state."/path/.codex/hooks.json:session_start:0:0"]
  trusted_hash = "sha256:…"
  ```
  (키 = `<hooks.json 절대경로>:<event_snake>:<group_idx>:<hook_idx>`. 해시는 installation 별로 위조 곤란하게 설계.)
- **검증 결과:**
  - 이미 신뢰된 hook(예: 글로벌 `~/.codex/hooks.json`)은 `codex exec` 에서 정상 발사됨
    (`hook: SessionStart … Completed` 로그 확인).
  - **격리 환경(새 `CODEX_HOME`)에 새로 만든 user-level hook 은 `--enable hooks --dangerously-bypass-hook-trust`
    를 줘도 `codex exec` 에서 발사되지 않았다** (hook 단계 로그·side-effect 모두 없음).
  - project-level `.codex/hooks.json` 도 동일하게, 신뢰 전에는 미발사.
- 결론: **`--dangerously-bypass-hook-trust` 만으로 신규 hook 을 exec 에서 자동 실행시키는 건 0.133 에서는 신뢰 불가**
  (대화형 신뢰가 사실상 필수). 관련 공개 이슈도 존재(repo-local hook 미발사 #17532 등).

> 운영 함의: Argos 의 Codex 세팅은 "파일을 깔면 끝"이 아니라 **"`.codex/hooks.json` 주입 → 사용자가 codex 를 한 번 띄워
> `/hooks` 에서 argos hook 들을 trust"** 라는 1-step 이 더 필요하다. 세팅 안내문에 이걸 명시해야 한다.

### 2.9 (대안) `notify` 콜백 **[검증/문서]**

`config.toml` 의 `notify = ["program", "arg", …]` 는 **turn 종료 시** 외부 프로그램을 호출하는 레거시 콜백이다
(hook trust 와 무관, 인자/JSON 으로 turn 정보 전달). 단, 이벤트 종류가 turn-completion 중심으로 제한적이라
`PreToolUse`/`PostToolUse` 단위 트래킹은 불가. **Stop 류만 필요하면 trust 없는 fallback 으로 고려 가능**하나,
Argos 의 tool-call 트래킹 요구를 다 못 채우므로 보조 수단으로만.

---

## 3. Codex 세션 rollout(transcript) 포맷

### 3.1 위치 & transcript_path **[검증]**

- 위치: `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl`
  (`CODEX_HOME` 기본값 `~/.codex`).
- `codex` 로그에서 `rollout_path: Some("…/sessions/…/rollout-….jsonl")` 확인. hook stdin 의 `transcript_path` 가
  이 파일을 가리킨다. **[검증]**
- ⚠️ 공식 문서: *"transcript_path 는 편의상 제공되지만 transcript 포맷은 hook 의 안정적 인터페이스가 아니며 바뀔 수 있다."* **[문서]**

### 3.2 라인 타입 **[검증]**

각 줄은 `{ "timestamp", "type", "payload" }`. `type` 값:

| type | 의미 |
|---|---|
| `session_meta` | 세션 메타(id, cwd, cli_version, model_provider, base_instructions …) |
| `turn_context` | 턴 컨텍스트(turn_id, cwd, model, approval_policy, sandbox_policy …) |
| `event_msg` | 이벤트 스트림. `payload.type` 으로 세분화 |
| `response_item` | 모델 입출력 아이템(메시지/툴콜/추론) |

`event_msg.payload.type` 분포(실세션): `token_count`, `agent_message`, `task_started`, `task_complete`,
`patch_apply_end`, `user_message`, `context_compacted`, `turn_aborted`, `thread_goal_updated`.

`response_item.payload.type`: `message`(role user/assistant/developer, content blocks `input_text`/`output_text`),
`function_call` / `function_call_output`(툴콜), `custom_tool_call` / `custom_tool_call_output`, `reasoning`.

### 3.3 usage 추출 — `event_msg` / `token_count` **[검증]**

```json
{"type":"event_msg","payload":{"type":"token_count","info":{
  "total_token_usage":{"input_tokens":33123,"cached_input_tokens":19200,"output_tokens":477,"reasoning_output_tokens":95,"total_tokens":33600},
  "last_token_usage":{"input_tokens":18284,"cached_input_tokens":14720,"output_tokens":129,"reasoning_output_tokens":0,"total_tokens":18413},
  "model_context_window":258400},
  "rate_limits":{...,"plan_type":"pro"}}}
```

- `total_token_usage` 는 **세션 누적**(검증: turn1.total = turn1.last, turn2.total = turn1+turn2 …),
  `last_token_usage` 는 **해당 턴 델타**. → 세션 총합은 **마지막 token_count 의 `total_token_usage`**,
  per-turn 은 각 token_count 의 `last_token_usage`.
- **⚠️ 토큰 convention 차이:** Codex 의 `input_tokens` **는 `cached_input_tokens` 를 포함**한다(전체 입력).
  Claude Code 는 `input_tokens`(non-cache) 와 `cache_read_input_tokens` 가 분리. → Argos 매핑 시
  `inputTokens = input_tokens − cached_input_tokens`, `cacheReadTokens = cached_input_tokens`,
  `outputTokens = output_tokens`, `cacheCreationTokens = 0`(Codex 엔 cache-write 개념 없음),
  `reasoning_output_tokens` 는 별도 보존하거나 output 에 합산(정책 결정 필요).
- model 명은 `turn_context.model` 또는 `session_meta` 에서. hook stdin 의 `model` 로도 확보 가능.

### 3.4 messages 추출 — `response_item` **[검증]**

| Codex | → Argos MessageRole |
|---|---|
| `message` role=user (그리고 `event_msg` `user_message`) | `HUMAN` |
| `message` role=assistant (그리고 `event_msg` `agent_message`) | `ASSISTANT` |
| `function_call` / `custom_tool_call` (`name`, `arguments`) | `TOOL` (toolName, toolInput) |
| `function_call_output` / `custom_tool_call_output` | 직전 TOOL 의 결과(content) backfill |
| `reasoning` | (선택) ASSISTANT 추론 — 저장 정책 결정 필요 |

`developer` role 메시지(샌드박스/권한 지시문 등)는 시스템성이라 제외 권장.

---

## 4. 검증 로그 (로컬 codex 0.133.0)

재현에 사용한 핵심 절차와 결과:

1. **hook 발사 확인.** 임시 프로젝트 + `.codex/hooks.json` + `codex exec --enable hooks --dangerously-bypass-hook-trust
   -s workspace-write` 로 실행. 이미 신뢰된 글로벌 hook 은 `hook: SessionStart/UserPromptSubmit/Stop … Completed`
   로그로 발사 확인. **신규/미신뢰 hook 은 발사되지 않음** → §2.8 trust 게이트 결론.
2. **stdin 스키마 추출.** codex 네이티브 바이너리(`@openai/codex-darwin-arm64/.../bin/codex`)에 임베드된
   `*.command.input` draft-07 JSON Schema 를 직접 디코드 → §2.5 표.
3. **transcript 포맷.** 실제 rollout JSONL(`~/.codex/sessions/...`) 직접 분석 → §3.
4. **파서 호환성 검증.** 실제 Codex rollout(5.6MB, gpt-5.5 세션)에 대해:
   - 현행 Claude Code 파서: `extractUsage ⇒ null`, `extractMessages ⇒ 0 messages` (**완전 비호환 확인**).
   - 프로토타입 Codex 파서: `usage ⇒ {inputTokens, cacheReadTokens, outputTokens, reasoningTokens, model:"gpt-5.5"}`,
     `messages ⇒ 590 (HUMAN 3 / ASSISTANT 90 / TOOL 497)` (**정상 추출 확인**).

---

## 5. Argos 변경 — **구현 완료** (이 task 에서 적용)

> 상태: ✅ 구현 + 단위테스트 + 빌드/린트 통과. `argos hook --agent codex` 경로를 실제 Codex rollout 으로 검증(§5.6).

### 5.1 CLI — `.codex/hooks.json` 주입 ✅
- `packages/cli/src/lib/hooks-inject.ts`: `injectHooks(path, agent='claude'|'codex')` 로 일반화.
  `.claude/settings.json` 과 `.codex/hooks.json` 은 JSON 구조가 동일해 동일 로직을 공유하고, command 만
  `argos hook` ↔ `argos hook --agent codex` 로 분기. idempotency 판정은 `cmd.includes('argos hook')`.
- `packages/cli/src/lib/inject-agent-hooks.ts`(신규): 두 에이전트 hook 을 모두 주입 + 결과/trust 안내 출력.
- `setup.ts` / `default.ts` / `status.ts`: 위 헬퍼로 교체, 커밋 안내에 `.codex/hooks.json` 포함,
  Codex trust 안내문 출력.

### 5.2 `argos hook` — 에이전트 판별 & 분기 ✅
- `packages/cli/src/commands/hook.ts` 의 `detectAgent(options, event)`:
  1. `--agent` 플래그(주입된 hook command 가 전달) — 최우선.
  2. `transcript_path`/`agent_transcript_path` 에 `/.codex/` 포함 → codex.
  3. 그 외 → claude(기존 동작).
- Stop/SubagentStop 에서 agent 에 따라 CC 파서 ↔ Codex 파서 선택. SessionStart slash 감지·summary 추출은 claude 에서만.
- usage.model 이 transcript 에서 안 나오면 hook stdin 의 `model` 로 보강.

### 5.3 신규 모듈 — `lib/transcript-codex.ts` ✅
- §3.3/§3.4 매핑 구현: `extractUsageFromCodexTranscript`, `extractUsagePerTurnFromCodexTranscript`,
  `extractMessagesFromCodexTranscript`. 파싱 실패 시 throw 없이 null/[] 반환(포맷 불안정 대비).
- `detectSlashCommand`/`extractSummary` 의 Codex 대응은 미구현(스코프 밖) — Codex 엔 정확 대응 개념이 없음.

### 5.4 shared — OpenAI 모델 pricing ✅
- `packages/shared/src/constants/pricing.ts`: gpt-5.x 단가(공식) + prefix fallback 추가.
  cacheWrite=0, cached input → cacheRead 매핑. `normalizeModelName` 은 `.`→`-` 정규화로 그대로 동작
  (키는 `gpt-5-5` 등 dash 형태). `gpt-4` 등 미지원 모델은 기존대로 `default`(Sonnet).

### 5.5 web/server — 변경 없음(호환) ✅
- `IngestEventPayload` 는 model-agnostic(usage/messages/model) — 스키마 변경 불필요.
- 비용 계산은 `packages/web/src/lib/server/cost.ts` 가 shared 의 `getModelPricing` 을 그대로 사용 →
  pricing.ts 에 OpenAI 단가를 추가한 것만으로 Codex 세션 비용이 계산됨. (회귀 테스트 추가: cost.test.ts)
- (선택·미구현) 대시보드에서 세션 출처(Claude/Codex)를 구분 표기하려면 이벤트에 `agent` 필드 추가 고려.

### 5.6 구현물 검증 **[검증]**
- `packages/cli/src/lib/transcript-codex.test.ts` — 합성 fixture 단위테스트(usage/per-turn/messages/backfill).
- `hook-command.test.ts` — `detectAgent` + Codex 분기(파서 선택, model 보강, slash 미시도) 테스트.
- `hooks-inject.test.ts` — `.codex/hooks.json` 에 `argos hook --agent codex` 주입 + 멱등성.
- **빌드된** `dist/lib/transcript-codex.js` 를 실제 rollout(gpt-5.5 세션)으로 실행 →
  usage `{input 662931, output 90662, cacheRead 63990016, model "gpt-5.5"}`, per-turn 508건, messages 727건
  (ASSISTANT 107 / TOOL 620, tool input·output·durationMs 정상) 추출 확인.
- CLI 전체 테스트 139 passed, typecheck/lint/build 통과. web cost 테스트 20 passed.

### 5.6 리스크 / 오픈 이슈
- **trust 마찰**: 팀원 무마찰 온보딩이 약화. 안내·문서로 보완하거나, 보조로 `notify` fallback(§2.9) 검토.
- **transcript 포맷 불안정**(문서 명시) → 버전업 시 파서 깨질 수 있음. hook stdin 으로 얻는 정보(model/tool)에
  최대한 의존하고 transcript 의존은 usage/messages 로 한정. 통합 테스트에 실제 rollout fixture 고정.
- **subagent**: Codex 도 `agent_id`/`SubagentStop` 제공 → 기존 "메인 세션만 트래킹" 정책 그대로 적용 가능.
- **exec vs TUI**: 본 검증은 주로 `codex exec` 기준. 대화형 TUI 에서의 발사/페이로드도 별도 확인 권장.

---

## 6. 참고 링크

- Codex Hooks: https://developers.openai.com/codex/hooks
- Codex Advanced Configuration: https://developers.openai.com/codex/config-advanced
- Codex Config Reference: https://developers.openai.com/codex/config-reference
- 이슈: repo-local hooks 미발사 #17532 — https://github.com/openai/codex/issues/17532
- 이슈: Desktop 업데이트 후 hooks 미동작 #21639 — https://github.com/openai/codex/issues/21639
