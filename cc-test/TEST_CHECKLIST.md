# Hook System Test Checklist

Argos hook 수집 파이프라인의 기술적 가능성을 검증하는 테스트 목록이다.
각 테스트 결과는 실제 Claude Code 실행 후 `hook-events.jsonl`을 분석해 기록한다.

---

## 검증 항목

### T-01: SessionStart 이벤트 수신
- **목적**: Claude Code 세션 시작 시 `SessionStart` hook이 발화되는지 확인
- **기대값**: `{"type": "SessionStart", "session_id": "...", ...}` 구조의 JSON
- **상태**: [ ] PENDING
- **결과**: -
- **실제 JSON 구조**: -

---

### T-02: PreToolUse 이벤트 수신
- **목적**: 도구 호출 전 `PreToolUse` hook이 발화되는지 확인
- **기대값**: `tool_name`, `tool_input`, `session_id`가 포함된 JSON
- **상태**: [ ] PENDING
- **결과**: -
- **실제 JSON 구조**: -

---

### T-03: PostToolUse 이벤트 수신
- **목적**: 도구 호출 완료 후 `PostToolUse` hook이 발화되는지 확인
- **기대값**: `tool_name`, `tool_response`, `exit_code`가 포함된 JSON
- **상태**: [ ] PENDING
- **결과**: -
- **실제 JSON 구조**: -

---

### T-04: Stop 이벤트 수신 + transcript_path 존재
- **목적**: 세션 종료 시 `Stop` hook이 발화되고 `transcript_path`가 포함되는지 확인
- **기대값**: `{"type": "Stop", "transcript_path": "/path/to/transcript.jsonl", ...}`
- **상태**: [ ] PENDING
- **결과**: -
- **실제 JSON 구조**: -

---

### T-05: Skill 호출 이벤트 구조 확인
- **목적**: Skill 도구 호출 시 `tool_name = "Skill"`, `tool_input.skill = "<name>"` 구조 확인
- **기대값**: `{"tool_name": "Skill", "tool_input": {"skill": "commit", ...}, ...}`
- **상태**: [ ] PENDING
- **결과**: -
- **실제 JSON 구조**: -

---

### T-06: Agent 호출 이벤트 구조 확인
- **목적**: Agent 도구 호출 시 `tool_name = "Agent"`, `subagent_type`, `description` 포함 여부 확인
- **기대값**: `{"tool_name": "Agent", "tool_input": {"subagent_type": "Explore", "description": "...", ...}, ...}`
- **상태**: [ ] PENDING
- **결과**: -
- **실제 JSON 구조**: -

---

### T-07: SubagentStop 이벤트 수신
- **목적**: 서브에이전트 종료 시 `SubagentStop` hook이 발화되는지 확인
- **기대값**: `{"type": "SubagentStop", "session_id": "...", ...}`
- **상태**: [ ] PENDING
- **결과**: -
- **실제 JSON 구조**: -

---

### T-08: session_id 일관성
- **목적**: 동일 세션 내 모든 이벤트에 동일한 `session_id`가 존재하는지 확인
- **기대값**: 같은 Claude Code 실행 중 수집된 모든 이벤트의 `session_id`가 동일
- **상태**: [ ] PENDING
- **결과**: -
- **실제 데이터**: -

---

### T-09: hook exit 0 보장 (에러 내성)
- **목적**: hook 스크립트에 오류가 발생해도 Claude Code 동작에 영향 없는지 확인
- **방법**: 일시적으로 잘못된 hook 명령으로 바꾼 뒤 Claude Code 정상 동작 여부 확인
- **상태**: [ ] PENDING
- **결과**: -

---

### T-10: transcript JSONL 구조 파악
- **목적**: Stop 이벤트의 `transcript_path`가 가리키는 파일에서 토큰 사용량 추출 가능한지 확인
- **기대값**: transcript.jsonl 내 `usage` 필드 (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`)
- **상태**: [ ] PENDING
- **결과**: -
- **실제 JSON 구조**: -

---

## 전체 결과 요약

| 테스트 | 상태 | 비고 |
|--------|------|------|
| T-01: SessionStart | PENDING | |
| T-02: PreToolUse | PENDING | |
| T-03: PostToolUse | PENDING | |
| T-04: Stop + transcript_path | PENDING | |
| T-05: Skill 호출 구조 | PENDING | |
| T-06: Agent 호출 구조 | PENDING | |
| T-07: SubagentStop | PENDING | |
| T-08: session_id 일관성 | PENDING | |
| T-09: hook exit 0 보장 | PENDING | |
| T-10: transcript 토큰 추출 | PENDING | |

---

## 테스트 방법

```bash
# 1. hook-events.jsonl 초기화
rm -f /Users/choesumin/Desktop/dev/vmc/argos/cc-test/hook-events.jsonl

# 2. cc-test 디렉토리에서 Claude Code 실행 (--print 모드로 비대화형 실행)
cd /Users/choesumin/Desktop/dev/vmc/argos/cc-test && claude --print "..."

# 3. 수집된 이벤트 확인
cat /Users/choesumin/Desktop/dev/vmc/argos/cc-test/hook-events.jsonl | jq '.'
```
