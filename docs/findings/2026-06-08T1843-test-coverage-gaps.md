---
title: "Critical API routes lack test coverage (only ~6% test-to-code ratio)"
created_at: 2026-06-08T18:43:00Z
resolved: false
priority: P2
related:
  - goals/_meta.md
---

# Critical API routes lack test coverage (only ~6% test-to-code ratio)

## TL;DR

227 TypeScript source files in `packages/web/src` are supported by only 13 test files (~6% coverage by file count). Large handler functions (e.g., `src/app/api/events/route.ts` with 285 lines) have no corresponding tests, creating silent regression risk for core business logic.

## Body

### Current State

**Code**: 227 `.ts` / `.tsx` files in `packages/web/src` (excluding node_modules, dist, etc.)  
**Tests**: 13 test files in `packages/web/__tests__` and scattered `.test.ts` files

**High-risk uncovered routes**:

1. **`src/app/api/events/route.ts`** (285 lines)
   - POST /api/events – ingests telemetry data, writes to DB
   - No tests. Risk: Malformed event data silently corrupts analytics.

2. **`src/app/api/orgs/[orgSlug]/projects/route.ts`** (>100 lines)
   - GET/POST projects – core resource CRUD
   - No tests. Risk: Access control bugs go unnoticed until prod.

3. **`src/app/api/orgs/[orgSlug]/members/route.ts`**
   - GET/POST members – org membership management
   - No tests. Risk: Permission escalation or member deletion bugs.

4. **`src/lib/server/daily-rollup.ts`** (>200 lines)
   - Aggregates stats, transforms Prisma JSON columns
   - No tests. Risk: Silent data corruption from double casts (see related finding).

5. **`src/auth.ts`** (auth configuration)
   - NextAuth config, session management
   - No tests. Risk: Auth bypass or session leaks.

### Why This Matters

- **Silent regressions**: A refactor to `daily-rollup.ts` might break calculation logic without any test failure.
- **Data integrity**: Events route writes raw data to DB; no schema validation tests mean garbage in, garbage out.
- **Security**: Member/org routes control access; without tests, IDOR bugs (Insecure Direct Object References) are invisible.
- **Onboarding friction**: New developers can't safely refactor core logic without fearing breakage.

## Options / Recommendation

- **(A) Unit + integration test suite (recommended).** Recommended. Create:
  1. **Unit tests** for business logic (`daily-rollup.test.ts`, etc.)
  2. **Integration tests** for API routes (mock DB, test request/response)
  3. **E2E tests** for critical user flows (create org → invite member → accept)

- **(B) Snapshot tests (quick win for coverage metric)**:
  ```typescript
  // __tests__/api/events.snap.test.ts
  it('normalizes event payload', async () => {
    const result = normalizeEventPayload(mockEvent)
    expect(result).toMatchSnapshot()
  })
  ```
  **Pros**: Fast to write, catches regressions.  
  **Cons**: Doesn't validate behavior, only prevents accidental changes.

- **(C) Property-based testing** for data transformations:
  ```typescript
  // daily-rollup generative tests
  fc.assert(
    fc.property(fc.array(fc.object()), (userStats) => {
      const rollup = computeRollup(userStats)
      expect(rollup.total).toBeLessThanOrEqual(userStats.length * MAX_COUNT_PER_USER)
    })
  )
  ```
  **Pros**: Catches edge cases (empty arrays, NaN, etc.).  
  **Cons**: Steeper learning curve.

## Acceptance signal

1. **Test files created** (initially RED, then GREEN after implementation):
   - `__tests__/api/events.test.ts` – POST with valid/invalid payloads, DB writes
   - `__tests__/lib/daily-rollup.test.ts` – stat aggregation, edge cases
   - `__tests__/api/orgs/[orgSlug]/members.test.ts` – CRUD + access control
   - `__tests__/api/auth.test.ts` – session management

2. **Coverage metrics**:
   - At least 80% line coverage for `src/app/api/**` routes
   - At least 80% line coverage for `src/lib/server/**` utilities
   - All data transformation code (daily-rollup, serializers) at 90%+

3. **CI integration**: `pnpm test --coverage` runs on every PR; coverage reports block merge if below threshold.

## Migration plan

### Phase 1: Foundation (Week 1)

1. **Add test tooling** (if not present):
   - Vitest config with coverage thresholds
   - Mock factories for common test data (users, orgs, events)
   - Test database seeding utilities

2. **Identify critical paths** (already done in Body above):
   - List top 10 routes by business importance
   - Annotate each with "auth", "data write", "calculation" risk tags

### Phase 2: Core coverage (Weeks 2–3)

3. **Write integration tests** for top-3 routes:
   - `events/route.ts` – POST valid/invalid events, assert DB writes
   - `daily-rollup.ts` – aggregation logic with mocked Prisma
   - `members/route.ts` – CRUD with access control checks

4. **Write unit tests** for utilities:
   - `daily-rollup.ts` – parsers, transformers
   - `auth.ts` – session validation
   - `lib/server/` helpers

### Phase 3: Expand & maintain (Weeks 4+)

5. **Automate test creation** for new routes:
   - Add a lint rule or pre-commit hook that warns if a new route handler in `app/api/**` has no corresponding test.
   - Update `CONTRIBUTING.md` to require ≥80% coverage for new code.

6. **Set coverage thresholds** in `vitest.config.ts`:
   ```typescript
   coverage: {
     all: true,
     lines: 80,
     functions: 80,
     branches: 75,
     include: ['src/**'],
     exclude: ['src/**/*.d.ts', 'src/env.ts']
   }
   ```

**Success metric**: Coverage badge shows ≥80%; no new routes merge without corresponding tests.

## Notes

- Start with routes that write data or enforce access control; read-only routes can be lower priority initially.
- Use `pnpm test --ui` for interactive test debugging during development.
- Consider adding visual regression tests (Playwright) for the web dashboard once API tests are stable.
