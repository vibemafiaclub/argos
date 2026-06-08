#!/usr/bin/env bash
# goals/0-package-scripts.next-task.sh — advisory hint for goal 0.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if bash "$ROOT/goals/0-package-scripts.gates.sh" >/dev/null 2>&1; then
  cat <<'MSG'
TASK: Goal 0-package-scripts is green.
  - Every workspace package wires into the _meta cross-cutting sweep.
  - Advance the chain: bash scripts/completion-check.sh
  - Add the next mission as goals/1-<name>.{md,gates.sh,next-task.sh}.
MSG
else
  cat <<'MSG'
TASK: Make goal 0-package-scripts green.
  - A workspace package is missing a `lint` or `typecheck` script, so the
    _meta turbo sweep silently skips it.
  - See which package/script: bash goals/0-package-scripts.gates.sh
  - Add the missing script to that package's package.json (do NOT weaken
    the gate). Re-run the gate to confirm.
MSG
fi
