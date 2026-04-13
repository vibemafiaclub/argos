# Hook System Test Checklist

Argos hook 수집 파이프라인의 기술적 가능성을 검증하는 테스트 목록이다.
각 테스트 결과는 실제 Claude Code 실행 후 `hook-events.jsonl`을 분석해 기록한다.

**테스트 일자**: 2026-04-14  
**전체 결과**: 11/11 검증 완료 (9 PASS, 1 PASS with nuance, 1 IMPORTANT FINDING)

---

## 검증 항목

### T-01: SessionStart 이벤트 수신
- **목적**: Claude Code 세션 시작 시 `SessionStart` hook이 발화되는지 확인
- **상태**: ✅ PASS
- **결과**: 정상 수신. `session_id`, `transcript_path`, `cwd`, `source: "startup"` 포함
- **실제 JSON 구조**:
```json
{
  "session_id": "7db5479b-4520-43d4-9a70-6ed98b165029",
  "transcript_path": "/Users/choesumin/.claude/projects/-Users-choesumin-Desktop-dev-vmc-argos-cc-test/7db5479b-4520-43d4-9a70-6ed98b165029.jsonl",
  "cwd": "/Users/choesumin/Desktop/dev/vmc/argos/cc-test",
  "hook_event_name": "SessionStart",
  "source": "startup"
}
```
- **구현 주의사항**: `permission_mode`가 SessionStart에는 없음. `transcript_path`가 이미 SessionStart에 포함됨.

---

### T-02: PreToolUse 이벤트 수신
- **목적**: 도구 호출 전 `PreToolUse` hook이 발화되는지 확인
- **상태**: ✅ PASS
- **결과**: `tool_name`, `tool_input`, `tool_use_id`, `permission_mode` 모두 포함
- **실제 JSON 구조 (Bash 예)**:
```json
{
  "session_id": "7db5479b-4520-43d4-9a70-6ed98b165029",
  "transcript_path": "...",
  "cwd": "/Users/choesumin/Desktop/dev/vmc/argos/cc-test",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "ls ...",
    "description": "List files in current directory"
  },
  "tool_use_id": "toolu_01Dmchwmvgbya34KXFDVyteo"
}
```
- **구현 주의사항**: `tool_use_id`로 Pre/Post 이벤트 매핑 가능. `tool_input` 구조는 도구마다 다름.

---

### T-03: PostToolUse 이벤트 수신
- **목적**: 도구 호출 완료 후 `PostToolUse` hook이 발화되는지 확인
- **상태**: ✅ PASS
- **결과**: `tool_response` 구조가 도구 유형별로 다름. Pre/PostToolUse가 같은 `tool_use_id` 공유
- **실제 JSON 구조 (Bash 결과)**:
```json
{
  "hook_event_name": "PostToolUse",
  "tool_name": "Bash",
  "tool_response": {
    "stdout": "CLAUDE.md\nTEST_CHECKLIST.md\nhook-events.jsonl\ntest-hook.sh",
    "stderr": "",
    "interrupted": false,
    "isImage": false,
    "noOutputExpected": false
  },
  "tool_use_id": "toolu_01Dmchwmvgbya34KXFDVyteo"
}
```
- **실제 JSON 구조 (Read 결과)**:
```json
{
  "hook_event_name": "PostToolUse",
  "tool_name": "Read",
  "tool_response": {
    "type": "text",
    "file": {
      "filePath": "/path/to/CLAUDE.md",
      "content": "...(full content)...",
      "numLines": 44,
      "startLine": 1,
      "totalLines": 44
    }
  }
}
```
- **구현 주의사항**: `tool_response` 저장 시 크기 제한 필요 (문서 명시된 2000자 제한 유효).

---

### T-04: Stop 이벤트 수신 + transcript_path 존재
- **목적**: 세션 종료 시 `Stop` hook이 발화되고 `transcript_path` 포함되는지 확인
- **상태**: ✅ PASS
- **결과**: `transcript_path`, `stop_hook_active`, `last_assistant_message` 포함
- **실제 JSON 구조**:
```json
{
  "session_id": "7db5479b-4520-43d4-9a70-6ed98b165029",
  "transcript_path": "/Users/choesumin/.claude/projects/-Users-choesumin-Desktop-dev-vmc-argos-cc-test/7db5479b-4520-43d4-9a70-6ed98b165029.jsonl",
  "cwd": "/Users/choesumin/Desktop/dev/vmc/argos/cc-test",
  "permission_mode": "default",
  "hook_event_name": "Stop",
  "stop_hook_active": false,
  "last_assistant_message": "모든 작업 완료했습니다...."
}
```
- **구현 주의사항**: `transcript_path` 경로 형식: `~/.claude/projects/<escaped-cwd>/<session_id>.jsonl`.

---

### T-05: Skill 호출 이벤트 구조 확인
- **목적**: Skill 도구 호출 시 `tool_name = "Skill"`, `tool_input.skill` 구조 확인
- **상태**: ✅ PASS
- **결과**: `tool_name: "Skill"`, `tool_input: {"skill": "hello-test"}` 구조 확인
- **실제 JSON 구조 (PreToolUse)**:
```json
{
  "session_id": "b6de1203-3564-420c-97f3-732ba3ea71c9",
  "transcript_path": "...",
  "cwd": "/Users/choesumin/Desktop/dev/vmc/argos/cc-test",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Skill",
  "tool_input": {"skill": "hello-test"},
  "tool_use_id": "toolu_012RV8NhuvegFPWsFDggN8Kf"
}
```
- **PostToolUse 응답**:
```json
{"tool_response": {"success": true, "commandName": "hello-test"}}
```
- **구현 주의사항**:
  - `/hello-test` slash command 방식으로 실행 시 Skill tool이 발화되지 않음 (내부에서 직접 처리됨)
  - `tool_input`이 `{"skill": "<name>"}` 형태임. Argos 문서 설계와 정확히 일치.
  - Skill 이름은 `tool_input.skill`에서 추출 가능.

---

### T-06: Agent 호출 이벤트 구조 확인
- **목적**: Agent 도구 호출 시 `tool_name = "Agent"`, `subagent_type`, `description` 포함 여부 확인
- **상태**: ✅ PASS
- **결과**: `subagent_type`, `description`, `prompt` 모두 포함
- **실제 JSON 구조 (PreToolUse)**:
```json
{
  "session_id": "3f820579-d46a-447c-8981-693937918ea4",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Agent",
  "tool_input": {
    "description": "Test agent call for hook verification",
    "prompt": "List the files in the current working directory...",
    "subagent_type": "Explore"
  },
  "tool_use_id": "toolu_01L2zHh9gjKaKM9Uv5MXHwE5"
}
```
- **PostToolUse 응답**:
```json
{
  "tool_response": {
    "status": "completed",
    "agentId": "ae10584ef5364062c",
    "agentType": "Explore",
    "content": [{"type": "text", "text": "..."}],
    "totalDurationMs": 4690,
    "totalTokens": 19679,
    "totalToolUseCount": 1,
    "usage": {}
  }
}
```
- **구현 주의사항**:
  - Argos 설계와 정확히 일치: `tool_input.subagent_type`, `tool_input.description` 추출 가능.
  - 서브에이전트 내부 이벤트에는 최상위 이벤트에 없는 `agent_id`, `agent_type` 필드가 추가됨.

---

### T-07: SubagentStop 이벤트 수신
- **목적**: 서브에이전트 종료 시 `SubagentStop` hook이 발화되는지 확인
- **상태**: ✅ PASS
- **결과**: `agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message`, `stop_hook_active` 포함
- **실제 JSON 구조**:
```json
{
  "session_id": "3f820579-d46a-447c-8981-693937918ea4",
  "transcript_path": "...",
  "cwd": "/Users/choesumin/Desktop/dev/vmc/argos/cc-test",
  "permission_mode": "default",
  "agent_id": "ae10584ef5364062c",
  "agent_type": "Explore",
  "hook_event_name": "SubagentStop",
  "stop_hook_active": false,
  "agent_transcript_path": "/Users/choesumin/.claude/projects/-Users-choesumin-Desktop-dev-vmc-argos-cc-test/3f820579-d46a-447c-8981-693937918ea4/subagents/agent-ae10584ef5364062c.jsonl",
  "last_assistant_message": "Here are the files in the current working directory..."
}
```
- **구현 주의사항**:
  - 서브에이전트 토큰 사용량은 `agent_transcript_path`로 별도 파싱 필요.
  - `session_id`는 부모 세션과 동일 — 서브에이전트 이벤트도 같은 세션으로 집계 가능.

---

### T-08: session_id 일관성
- **목적**: 동일 세션 내 모든 이벤트에 동일한 `session_id` 존재 여부 확인
- **상태**: ✅ PASS
- **결과**: T-01~04 테스트의 6개 이벤트 전체가 동일 `session_id: "7db5479b-4520-43d4-9a70-6ed98b165029"` 공유. SubagentStop 포함 Agent 세션(7개 이벤트)도 동일 session_id 공유.
- **구현 주의사항**: `ClaudeSession.id`를 Claude Code의 `session_id`로 PK 사용하는 설계가 정확함.

---

### T-09: hook exit 0 보장 (에러 내성)
- **목적**: hook 스크립트 오류 시 Claude Code 동작 영향 여부 확인
- **상태**: ⚠️ IMPORTANT FINDING (설계 수정 필요)
- **결과**:
  - **exit 1**: Claude Code가 non-blocking error로 처리. 도구 실행은 계속됨. transcript에 `hook_non_blocking_error` 항목 기록.
  - **exit 2**: 문서에 따르면 PreToolUse hook에서 exit 2는 도구 실행을 blocking (차단)함.
  - **exit 0**: 정상. 오류 없음.
- **transcript 내 exit 1 기록**:
```json
{
  "type": "attachment",
  "attachment": {
    "type": "hook_non_blocking_error",
    "hookEvent": "PreToolUse",
    "exitCode": 1,
    "stderr": "Failed with non-blocking status code: No stderr output",
    "stdout": "",
    "durationMs": 377
  }
}
```
- **구현 수정사항**: Argos 문서의 "반드시 exit 0" 요구사항은 여전히 유효. exit 1은 non-blocking이지만 transcript에 오류 기록이 남아 사용자 경험을 저하시킴. **exit 0 유지 필수**.

---

### T-10: transcript JSONL 구조 파악 및 토큰 추출
- **목적**: Stop 이벤트의 `transcript_path`로 토큰 사용량 추출 가능 여부 확인
- **상태**: ✅ PASS
- **결과**: `assistant` 타입 항목의 `message.usage`에 완전한 토큰 데이터 포함
- **실제 JSON 구조 (assistant entry)**:
```json
{
  "type": "assistant",
  "uuid": "...",
  "parentUuid": "...",
  "sessionId": "...",
  "timestamp": "...",
  "message": {
    "role": "assistant",
    "usage": {
      "input_tokens": 1,
      "output_tokens": 130,
      "cache_creation_input_tokens": 167,
      "cache_read_input_tokens": 18164,
      "server_tool_use": {"web_search_requests": 0, "web_fetch_requests": 0},
      "service_tier": "standard",
      "cache_creation": {
        "ephemeral_1h_input_tokens": 167,
        "ephemeral_5m_input_tokens": 0
      },
      "iterations": [{"input_tokens": 1, "output_tokens": 130}]
    }
  }
}
```
- **추출 방법**: transcript JSONL에서 `type == "assistant"` 항목을 필터링하고 `message.usage` 값을 합산.
- **구현 주의사항**:
  - `cache_creation_input_tokens` → Prisma 스키마의 `cacheCreationTokens` 필드에 매핑
  - `cache_read_input_tokens` → `cacheReadTokens` 필드에 매핑
  - `iterations` 배열이 있어 멀티턴 내 각 반복의 토큰도 추적 가능
  - SubagentStop의 경우 `agent_transcript_path` (별도 경로)에서 파싱 필요

---

### T-11: slash command로 호출한 Skill 추적 가능성
- **목적**: `/skill-name` slash command 방식으로 실행 시 transcript에서 skill 호출 여부 감지 가능한지 확인
- **상태**: ✅ PASS — transcript에서 감지 가능
- **결과**: 3가지 위치에서 skill 이름 추출 가능
- **위치 1 — `queue-operation` 엔트리 (가장 이른 감지 시점, 권장)**:
```json
{
  "type": "queue-operation",
  "operation": "enqueue",
  "timestamp": "2026-04-13T17:58:43.198Z",
  "sessionId": "...",
  "content": "/hello-test"
}
```
- **위치 2 — 첫 번째 `user` 엔트리의 XML 태그 (구조적 감지)**:
```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "<command-message>hello-test</command-message>\n<command-name>/hello-test</command-name>"
  }
}
```
- **위치 3 — `isMeta: true` user 엔트리 (skill 경로 포함)**:
```
"Base directory for this skill: /.../.claude/skills/hello-test\n현재 디렉토리의..."
```
- **구현 전략**:
  1. **SessionStart hook** 발화 시 `transcript_path` 즉시 읽기
  2. `type == "queue-operation"` AND `content` starts with `/` 엔트리 탐색
  3. 발견 시 해당 skill 이름을 별도 이벤트로 API 전송
  4. 대안: 첫 번째 `user` 엔트리에서 `<command-name>` 태그 regex 파싱
- **구현 주의사항**:
  - `queue-operation` 엔트리는 SessionStart 발화 시점에 이미 transcript에 기록되어 있음
  - hook 내 transcript 파싱은 Stop 이벤트에서 이미 계획된 작업 — SessionStart에도 재사용 가능
  - slash command가 아닌 일반 메시지 시작 세션과 구별 가능

---

## 전체 결과 요약

| 테스트 | 상태 | 핵심 발견 |
|--------|------|-----------|
| T-01: SessionStart | ✅ PASS | `hook_event_name` 필드명 (not `type`) |
| T-02: PreToolUse | ✅ PASS | `tool_use_id`로 Pre/Post 이벤트 매핑 가능 |
| T-03: PostToolUse | ✅ PASS | `tool_response` 구조가 도구별로 다름 |
| T-04: Stop + transcript_path | ✅ PASS | `last_assistant_message` 포함 |
| T-05: Skill 호출 구조 | ✅ PASS | `tool_input.skill` 필드 확인 |
| T-06: Agent 호출 구조 | ✅ PASS | `subagent_type` + `description` + `prompt` 포함 |
| T-07: SubagentStop | ✅ PASS | `agent_transcript_path` 별도 존재 |
| T-08: session_id 일관성 | ✅ PASS | 전 이벤트 동일 session_id |
| T-09: hook exit 0 보장 | ⚠️ FINDING | exit 1=non-blocking, exit 2=blocking |
| T-10: transcript 토큰 추출 | ✅ PASS | `message.usage` 완전한 토큰 데이터 |
| T-11: slash command 추적 | ✅ PASS | transcript `queue-operation` 엔트리에서 감지 가능 |
| T-11: slash command 추적 | ✅ PASS | transcript `queue-operation` 엔트리에서 감지 가능 |

---

## 구현에 반영해야 할 핵심 발견사항

### 1. 이벤트 타입 필드명: `hook_event_name` (not `type`)
Claude Code는 이벤트 유형을 `hook_event_name` 필드로 전달한다.
```typescript
// argos hook 파싱 코드에서:
const eventType = event.hook_event_name  // "SessionStart" | "PreToolUse" | etc.
```

### 2. `transcript_path`는 모든 이벤트에 포함
Stop 이벤트에만 있을 거라 예상했으나, SessionStart 포함 모든 이벤트에 `transcript_path`가 포함됨.
경로 형식: `~/.claude/projects/<escaped-cwd>/<session_id>.jsonl`

### 3. 서브에이전트 이벤트 구별: `agent_id` + `agent_type` 필드
서브에이전트 내부에서 발생한 PreToolUse/PostToolUse에는 `agent_id`, `agent_type` 필드가 추가됨.
이를 통해 최상위 이벤트와 서브에이전트 이벤트를 구별 가능.

### 4. SubagentStop의 `agent_transcript_path`
서브에이전트 종료 시 별도의 transcript 파일 경로(`agent_transcript_path`)가 제공됨.
위치: `<project-dir>/<session_id>/subagents/agent-<agent_id>.jsonl`
서브에이전트 토큰 사용량 추출 시 이 경로 사용 필요.

### 5. exit code 2 = blocking (Argos exit 0 요건 유지 필수)
exit 1은 non-blocking이지만 transcript에 오류 항목이 남음.
exit 2는 PreToolUse hook에서 도구 실행을 차단함 (Argos가 절대 해서는 안 되는 동작).
exit 0 보장은 선택이 아닌 필수.

### 6. Skill: slash command — transcript 파싱으로 추적 가능
`/skill-name` slash command로 실행 시 Skill tool hook이 발화되지 않음.
하지만 transcript에서 2가지 방법으로 감지 가능:
- **방법 A (권장)**: `type == "queue-operation"` AND `content` starts with `/` 엔트리 탐색 (SessionStart 시점에 이미 기록됨)
- **방법 B (대안)**: 첫 번째 `user` 엔트리의 `<command-name>/skill-name</command-name>` XML 태그 파싱
```typescript
// SessionStart hook에서 transcript 즉시 파싱
const lines = readTranscriptLines(event.transcript_path)
const queueOp = lines.find(l => l.type === 'queue-operation' && l.content?.startsWith('/'))
if (queueOp) {
  const skillName = queueOp.content.slice(1)  // "/hello-test" → "hello-test"
  // isSkillCall = true, skillName, isSlashCommand = true 로 이벤트 전송
}
```

### 7. Agent PostToolUse에 `totalTokens` 포함
Agent 호출의 PostToolUse `tool_response`에 `totalTokens`, `totalDurationMs`, `usage` 필드 포함.
이를 활용하면 Stop 이벤트 없이도 서브에이전트 토큰 사용량 집계 가능 (보완 방법).
