#!/usr/bin/env python3
"""
new-task 파이프라인용 메인 세션 대화 기록기.

활성 task가 있을 때만 동작한다:
  - 활성 task slug는 .claude/state/active-task 에 저장된다 (new-task SKILL.md가 관리)
  - 활성 task가 없으면 즉시 종료 (모든 세션에서 hook이 발동되므로 가드 필수)

기록 대상:
  - UserPromptSubmit: 사용자 발화 텍스트
  - Stop: 메인 세션 어시스턴트 최종 텍스트 (transcript JSONL 마지막 assistant 메시지)

기록 위치:
  - docs/tasks/<slug>/_conversation.md (append)

실패 시에도 메인 세션 흐름을 막지 않도록 항상 exit 0.
"""
import sys
import os
import json
import pathlib
import datetime
import traceback


def main() -> int:
    try:
        raw = sys.stdin.read()
        if not raw:
            return 0
        data = json.loads(raw)
    except Exception:
        return 0

    event = data.get("hook_event_name") or data.get("event") or ""

    here = pathlib.Path(__file__).resolve()
    claude_dir = here.parent.parent
    project_root = claude_dir.parent
    state_file = claude_dir / "state" / "active-task"
    if not state_file.exists():
        return 0
    slug = state_file.read_text().strip()
    if not slug:
        return 0

    conv_file = project_root / "docs" / "tasks" / slug / "_conversation.md"
    try:
        conv_file.parent.mkdir(parents=True, exist_ok=True)
    except Exception:
        return 0

    ts = datetime.datetime.now().isoformat(timespec="seconds")

    if event == "UserPromptSubmit":
        prompt = (data.get("prompt") or "").strip()
        if not prompt:
            return 0
        with conv_file.open("a", encoding="utf-8") as f:
            f.write(f"\n---\n## USER · {ts}\n\n{prompt}\n")
        return 0

    if event == "Stop":
        transcript_path = data.get("transcript_path")
        if not transcript_path or not os.path.exists(transcript_path):
            return 0
        text = extract_last_assistant_text(transcript_path)
        if not text:
            return 0
        with conv_file.open("a", encoding="utf-8") as f:
            f.write(f"\n## ASSISTANT · {ts}\n\n{text}\n")
        return 0

    return 0


def extract_last_assistant_text(transcript_path: str) -> str:
    """JSONL transcript 파일에서 마지막 assistant 메시지의 text content 만 추출."""
    try:
        with open(transcript_path, "r", encoding="utf-8") as tf:
            lines = tf.readlines()
    except Exception:
        return ""

    for line in reversed(lines):
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except Exception:
            continue

        msg = entry.get("message") if isinstance(entry.get("message"), dict) else entry
        role = msg.get("role")
        if role != "assistant":
            continue

        content = msg.get("content")
        parts = []
        if isinstance(content, list):
            for c in content:
                if isinstance(c, dict) and c.get("type") == "text":
                    t = c.get("text") or ""
                    if t:
                        parts.append(t)
        elif isinstance(content, str):
            parts.append(content)

        text = "\n".join(parts).strip()
        if text:
            return text
    return ""


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        # 절대 메인 세션 차단하지 않는다
        try:
            sys.stderr.write(traceback.format_exc())
        except Exception:
            pass
        sys.exit(0)
