"""persuasion-review 5a0 UX probe 어댑터 (argos).

packages/web (Next.js dev server) 를 free port 로 띄우고, 페르소나가 랜딩 →
가입 → 대시보드까지 직접 조작해볼 수 있도록 base_url / 자격 / 태스크를 넘긴다.

계약은 .claude/skills/persuasion-review/SKILL.md Section 4.5 참조.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

from probe_harness import (
    free_port,
    spawn_and_wait_ready,
    stop_by_pidfile,
)


REPO_ROOT = Path(__file__).resolve().parent.parent
PROBE_TASKS = Path(__file__).resolve().parent / "probe_tasks.md"
READY_TIMEOUT_SEC = 90.0  # next dev 첫 컴파일은 오래 걸릴 수 있음


def start(run_dir: Path) -> dict:
    port = int(os.environ.get("ARGOS_PROBE_PORT") or free_port())
    base_url = f"http://127.0.0.1:{port}"

    env = os.environ.copy()
    env["PORT"] = str(port)
    env["BROWSER"] = "none"
    env["NEXT_TELEMETRY_DISABLED"] = "1"

    pidfile = run_dir / "web.pid"
    run_dir.mkdir(parents=True, exist_ok=True)

    spawn_and_wait_ready(
        cmd=["npm", "run", "dev", "--workspace", "packages/web", "--silent"],
        env=env,
        cwd=str(REPO_ROOT),
        ready_url=f"{base_url}/",
        timeout_sec=READY_TIMEOUT_SEC,
        pidfile=pidfile,
    )

    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    email = f"probe+{ts}@example.com"
    password = "ProbeRun-9f4a!"

    return {
        "base_url": base_url,
        "python_bin": os.environ.get("ARGOS_PROBE_PYTHON") or "python3",
        "credentials": {
            "signup_email": email,
            "signup_password": password,
            "note": (
                "This is a fresh persona probe account. Sign up at /register "
                "with these creds if the task requires an authenticated view."
            ),
        },
        "context": {
            "landing_url": f"{base_url}/",
            "register_url": f"{base_url}/register",
            "login_url": f"{base_url}/login",
        },
        "tasks_markdown": PROBE_TASKS.read_text(encoding="utf-8").strip(),
    }


def stop(run_dir: Path) -> None:
    try:
        stop_by_pidfile(run_dir / "web.pid")
    except Exception:
        # 계약상 stop 은 raise 금지.
        pass
