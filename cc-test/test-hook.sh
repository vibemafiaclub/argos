#!/bin/bash
# Argos Test Hook — 모든 hook 이벤트를 JSONL 파일에 기록
#
# Claude Code가 각 hook 이벤트마다 이 스크립트를 실행하며 stdin으로 JSON을 전달한다.
# 이 스크립트는 항상 exit 0으로 종료해야 Claude Code 동작에 영향을 주지 않는다.

LOG_FILE="$(dirname "$0")/hook-events.jsonl"

# stdin에서 JSON 읽기 (타임스탬프와 함께 기록)
INPUT=$(cat)

if [ -n "$INPUT" ]; then
  # 타임스탬프와 함께 JSONL에 append
  echo "$INPUT" >> "$LOG_FILE"
fi

# 항상 exit 0 (Claude Code 작업 흐름을 절대 차단하지 않음)
exit 0
