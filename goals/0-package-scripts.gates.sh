#!/usr/bin/env bash
# goals/0-package-scripts.gates.sh — every workspace package declares the
# lint + typecheck scripts that the _meta turbo sweep relies on.
#
# Universal claim ("every workspace package") ⇒ the gate ENUMERATES the
# workspace package set from the filesystem (the packages/* glob that
# pnpm-workspace.yaml defines) instead of naming packages inline.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=../scripts/_gate-cache.sh
source "$ROOT/scripts/_gate-cache.sh"

GATE_INPUTS=(
  packages/*/package.json
  pnpm-workspace.yaml
  goals/0-package-scripts.gates.sh
  goals/0-package-scripts.md
  scripts/_gate-cache.sh
)

if gate_cache_hit "0-package-scripts" "${GATE_INPUTS[@]}"; then
  echo "[cache hit] goal 0-package-scripts inputs unchanged"
  exit 0
fi

PASS=true
REQUIRED_SCRIPTS=(lint typecheck)

# 0.1 — Universal claim: "every workspace package declares lint + typecheck."
# Enumerate the source of truth (the packages/* workspace glob), then assert
# each required script on every package.
echo "[0.1] every workspace package declares: ${REQUIRED_SCRIPTS[*]}"
MISSING=()
FOUND=0
while IFS= read -r pj; do
  FOUND=$((FOUND + 1))
  for s in "${REQUIRED_SCRIPTS[@]}"; do
    if ! node -e "process.exit(((require('./$pj').scripts)||{})['$s'] ? 0 : 1)" 2>/dev/null; then
      MISSING+=("$pj — missing '$s' script")
    fi
  done
done < <(find packages -mindepth 2 -maxdepth 2 -name package.json | sort)

if [ "$FOUND" -eq 0 ]; then
  echo "    ✗ fail — no workspace packages found under packages/*"
  PASS=false
elif [ "${#MISSING[@]}" -eq 0 ]; then
  echo "    ✓ pass ($FOUND packages)"
else
  echo "    ✗ fail:"
  printf '        %s\n' "${MISSING[@]}"
  PASS=false
fi

# 0.2 — Gate rigor self-check: a universal claim in the .md can never ship
# without an enumerating gate.
echo "[0.2] gate rigor"
if bash "$ROOT/scripts/check-gate-rigor.sh" "$ROOT/goals/0-package-scripts.md" >/dev/null 2>&1; then
  echo "    ✓ pass"
else
  echo "    ✗ fail"
  bash "$ROOT/scripts/check-gate-rigor.sh" "$ROOT/goals/0-package-scripts.md" | sed 's/^/      /'
  PASS=false
fi

if [ "$PASS" = true ]; then
  gate_cache_save "0-package-scripts" "${GATE_INPUTS[@]}"
  exit 0
fi
exit 1
