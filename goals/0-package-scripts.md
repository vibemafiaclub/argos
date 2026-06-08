# Goal 0 — every workspace package wires into the `_meta` sweep

> 이 goal을 active로 잡은 에이전트는 먼저 `guidelines/goal-iteration.md`를
> 읽어 iteration 프로토콜을 확인할 것.

## Mission

The `_meta` gate enforces "every package typechecks / lints / tests /
builds" by running `pnpm turbo <task>` and `pnpm -r --if-present test`.
But turbo and `pnpm -r` **silently no-op** a task in any package that does
not declare the matching script. So a package can join the workspace and
quietly escape the cross-cutting sweep — `_meta` stays green while covering
nothing for it.

This goal is the **structural anchor** that closes that hole: every
workspace package must declare the scripts that make the `_meta` claims
real for it.

## Completion Conditions

1. **Every** workspace package (every `package.json` matched by the
   `packages/*` glob in `pnpm-workspace.yaml`) declares a `lint` script.
2. **Every** workspace package declares a `typecheck` script.
3. This goal's gate passes `scripts/check-gate-rigor.sh`: the universal
   claims above force the gate to **enumerate** the workspace package set
   rather than sample one package.

> Scope note: `lint` and `typecheck` are the two checks that run in the
> fast inner loop and apply to every package (including `shared`, which has
> no tests). `test`/`build` are intentionally **not** required of every
> package — `pnpm -r --if-present test` already enumerates only the
> packages that opt in, and not every package is independently buildable.

## Sources Of Truth

- Workspace package set: `find packages -mindepth 2 -maxdepth 2 -name package.json`
  (matching the `packages/*` glob in `pnpm-workspace.yaml`).
- Required scripts per package: `lint`, `typecheck`.

## Verification

```
bash goals/0-package-scripts.gates.sh
bash scripts/completion-check.sh
```
