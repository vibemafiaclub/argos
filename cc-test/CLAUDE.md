# Argos Hook System — Test Environment

이 디렉토리는 **Argos Claude Code Hook 시스템의 동작을 검증하기 위한 테스트 환경**이다.

---

## 이 환경의 목적

Argos는 Claude Code의 hooks 시스템을 활용해 모든 tool 호출 이벤트를 수집한다.
이 테스트 환경은 다음을 검증한다:

1. 각 hook 이벤트 타입(SessionStart, PreToolUse, PostToolUse, Stop, SubagentStop)이 실제로 발화되는지
2. stdin으로 전달되는 JSON의 정확한 구조
3. Skill 호출 시 `tool_name = "Skill"`, `tool_input.skill = "<name>"` 구조 확인
4. Agent 호출 시 `tool_name = "Agent"`, `tool_input.subagent_type`, `tool_input.description` 구조 확인
5. Stop 이벤트의 `transcript_path` 필드 존재 여부
6. hook 스크립트가 항상 exit 0으로 종료되는지

---

## Hook 설정

`.claude/settings.json`에 `test-hook.sh`가 모든 hook 이벤트에 등록되어 있다.
이 스크립트는 stdin으로 들어오는 JSON을 `hook-events.jsonl`에 한 줄씩 기록하고 exit 0으로 종료한다.

---

## 테스트 실행 지침

이 환경에서 Claude Code를 실행할 때는 아래 사항을 따른다:

1. **다양한 도구를 의도적으로 사용한다** — Read, Bash, Glob, Grep 등을 모두 사용해 PreToolUse/PostToolUse 이벤트를 발생시킨다.
2. **Skill 도구를 호출한다** — Skill 호출 시 정확한 이벤트 구조를 확인한다.
3. **Agent 도구를 호출한다** — subagent_type과 description을 포함해 Agent를 호출하고 이벤트를 확인한다.
4. **테스트 태스크를 완료한 뒤 종료한다** — Stop 이벤트가 발화되도록 세션을 정상 종료한다.

---

## 중요 제약

- 이 디렉토리에서 실행되는 Claude Code는 **테스트 목적으로만** 동작한다.
- `hook-events.jsonl` 파일을 수정하지 않는다 (append-only 로그).
- 테스트 중 외부 서비스(GitHub, 실제 API 서버 등)에 접근하지 않는다.
