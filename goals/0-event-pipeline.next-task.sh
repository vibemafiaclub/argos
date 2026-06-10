#!/usr/bin/env bash
# goals/0-event-pipeline.next-task.sh — advisory hint

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if bash "$ROOT/goals/0-event-pipeline.gates.sh" >/dev/null 2>&1; then
  cat <<'MSG'
TASK: Goal 0-event-pipeline is green.
  - All EventType values are mapped in the API handler.
  - Run: bash scripts/completion-check.sh to confirm the full chain.
MSG
else
  cat <<'MSG'
TASK: Make goal 0-event-pipeline green.
  - A new EventType value exists in the Prisma schema or shared types
    but is missing a case in mapHookEventNameToEventType.
  - Add the missing case(s) in packages/web/src/app/api/events/route.ts.
  - Re-run: bash goals/0-event-pipeline.gates.sh
MSG
fi
