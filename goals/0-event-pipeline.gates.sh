#!/usr/bin/env bash
# goals/0-event-pipeline.gates.sh
# Verifies structural completeness: every EventType declared in the
# Prisma schema AND the shared types union has a matching case in the
# API event handler switch.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=../scripts/_gate-cache.sh
source "$ROOT/scripts/_gate-cache.sh"

GATE_INPUTS=(
  packages/web/prisma/schema.prisma
  packages/shared/src/types/events.ts
  packages/web/src/app/api/events/route.ts
  goals/0-event-pipeline.gates.sh
  goals/0-event-pipeline.md
  scripts/_gate-cache.sh
)

if gate_cache_hit "0-event-pipeline" "${GATE_INPUTS[@]}"; then
  echo "[cache hit] goal 0-event-pipeline inputs unchanged"
  exit 0
fi

PASS=true
HANDLER="packages/web/src/app/api/events/route.ts"

# 0.1 — Prisma enum EventType 의 모든 값이 switch 에 매핑됨
echo "[0.1] every Prisma EventType value has a case in mapHookEventNameToEventType"
# Extract values from the `enum EventType { ... }` block in schema.prisma
IN_BLOCK=0
PRISMA_TYPES=()
while IFS= read -r line; do
  if echo "$line" | grep -q 'enum EventType'; then
    IN_BLOCK=1
    continue
  fi
  if [ "$IN_BLOCK" = "1" ]; then
    if echo "$line" | grep -q '^}'; then
      break
    fi
    val=$(echo "$line" | tr -d ' \t\r')
    [ -n "$val" ] && PRISMA_TYPES+=("$val")
  fi
done < packages/web/prisma/schema.prisma

MISSING_PRISMA=()
for t in "${PRISMA_TYPES[@]}"; do
  if ! grep -qE "case '${t}'" "$HANDLER"; then
    MISSING_PRISMA+=("$t")
  fi
done

if [ "${#MISSING_PRISMA[@]}" -eq 0 ]; then
  echo "    ✓ pass (${#PRISMA_TYPES[@]} types checked)"
else
  echo "    ✗ fail — Prisma EventType values missing from switch:"
  printf '        %s\n' "${MISSING_PRISMA[@]}"
  PASS=false
fi

# 0.2 — shared EventType union 의 모든 리터럴이 switch 에 매핑됨
echo "[0.2] every shared EventType literal has a case in mapHookEventNameToEventType"
# Extract string literals from: export type EventType = 'A' | 'B' | ...
SHARED_TYPES=()
while IFS= read -r literal; do
  SHARED_TYPES+=("$literal")
done < <(
  grep "export type EventType" packages/shared/src/types/events.ts \
    | grep -oE "'[A-Z_]+'" \
    | tr -d "'"
)

MISSING_SHARED=()
for t in "${SHARED_TYPES[@]}"; do
  if ! grep -qE "case '${t}'" "$HANDLER"; then
    MISSING_SHARED+=("$t")
  fi
done

if [ "${#MISSING_SHARED[@]}" -eq 0 ]; then
  echo "    ✓ pass (${#SHARED_TYPES[@]} types checked)"
else
  echo "    ✗ fail — shared EventType literals missing from switch:"
  printf '        %s\n' "${MISSING_SHARED[@]}"
  PASS=false
fi

# 0.3 — Gate rigor self-check
echo "[0.3] gate rigor"
if bash "$ROOT/scripts/check-gate-rigor.sh" "$ROOT/goals/0-event-pipeline.md" >/dev/null 2>&1; then
  echo "    ✓ pass"
else
  echo "    ✗ fail"
  bash "$ROOT/scripts/check-gate-rigor.sh" "$ROOT/goals/0-event-pipeline.md" | sed 's/^/      /'
  PASS=false
fi

if [ "$PASS" = true ]; then
  gate_cache_save "0-event-pipeline" "${GATE_INPUTS[@]}"
  exit 0
fi
exit 1
