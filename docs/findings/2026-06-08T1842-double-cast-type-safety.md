---
title: "Double type casts (as unknown as) bypass type safety in data transformations"
created_at: 2026-06-08T18:42:00Z
resolved: true
priority: P2
related:
  - goals/_meta.md
---

# Double type casts (as unknown as) bypass type safety in data transformations

## TL;DR

Prisma JSON columns are deserialized with double casts (`as unknown as Type`) in 5+ places, circumventing TypeScript's type system and risking runtime data mismatches. Replacing with explicit runtime validators (Zod) would restore type safety without sacrificing flexibility.

## Body

When Prisma JSON columns are read from the database, they arrive as `unknown` and must be cast back to the original type. Currently, the codebase uses double casts in critical paths:

**File: `packages/web/src/lib/server/daily-rollup.ts`**
```typescript
// Line 348: userStats serialized as JSON, cast back
userStats: (row.userStats as unknown as DailyUserStat[]) ?? []

// Line 367: rollup stats cast twice
userStats: rollup.userStats as unknown as Prisma.InputJsonValue
```

**File: `packages/web/src/app/api/events/route.ts`**
```typescript
// Line 91: metadata parsed from request
const metadata = (metadata as unknown as Record<string, any>) ?? {}

// Line 190, 261: additional unsafe casts in event handlers
```

### Why This Is a Problem

1. **Type system is disabled**: The double cast `as unknown as X` tells TypeScript "I know better; stop checking." No IDE warnings, no compile-time validation.
2. **Implicit data contract**: The actual shape of `row.userStats` or `rollup.userStats` at runtime is undocumented and unvalidated. If the database schema changes but the code doesn't, data corruption goes undetected until a user reports a bug.
3. **Silent failures**: If `userStats` is malformed (e.g., missing required fields), the array is silently truncated or misaligned, leading to corrupted rollup data.
4. **Refactoring risk**: Renaming or adding fields to `DailyUserStat` won't fail; the cast will happily assign a mismatch.

### Real-World Scenario

A schema migration changes `DailyUserStat.count` from `number` to `bigint`. The Prisma type updates, but the cast silently coerces at runtime. Days later, the rollup math is off by orders of magnitude—hard to trace back to the cast.

## Options / Recommendation

- **(A) Replace with Zod schema validation.** Recommended. Example:
  ```typescript
  import { z } from 'zod'

  const DailyUserStatSchema = z.object({
    userId: z.string(),
    count: z.number().int().positive(),
    // ... other fields
  })

  type DailyUserStat = z.infer<typeof DailyUserStatSchema>

  // In deserialization:
  const userStats = DailyUserStatSchema.array().safeParse(row.userStats)
  if (!userStats.success) {
    logger.error('Malformed userStats in rollup', { errors: userStats.error.flatten() })
    return [] // or throw, depending on severity
  }
  return userStats.data
  ```
  **Wins**: Runtime validation, clear error messages, type inference from schema, refactoring safety.

- **(B) Create explicit parse functions** without Zod (lighter-weight):
  ```typescript
  function parseDailyUserStats(data: unknown): DailyUserStat[] {
    if (!Array.isArray(data)) return []
    return data.map(item => {
      if (typeof item !== 'object' || !item) return null
      return {
        userId: String(item.userId ?? ''),
        count: Number(item.count ?? 0),
        // ... with type guards for each field
      }
    }).filter(Boolean) as DailyUserStat[]
  }
  ```
  **Wins**: No new dependency; explicit over implicit.

- **(C) Keep double casts but add JSDoc contracts** (least recommended):
  ```typescript
  /**
   * JSON column: DailyUserStat[]
   * Expected shape: [{ userId: string, count: number, ... }]
   * If shape changes, update this JSDoc and the schema.
   */
  userStats: (row.userStats as unknown as DailyUserStat[]) ?? []
  ```
  **Cons**: Still unsafe at runtime; just better documented.

## Acceptance signal

1. A new test file `packages/web/__tests__/lib/daily-rollup.test.ts` that:
   - Passes valid `DailyUserStat[]` JSON and asserts correct parsing.
   - Passes malformed JSON (missing fields, wrong types) and asserts a safe fallback or error.
   - Passes `null` or `undefined` and asserts correct default.

2. No remaining `as unknown as` casts in `src/lib/server/daily-rollup.ts` and `src/app/api/events/route.ts`.

## Migration plan

1. **Add Zod schema definitions** (or explicit parse functions) for:
   - `DailyUserStat`
   - Event metadata shape
   - Any other JSON columns in the schema.

2. **Create utility functions** in `lib/server/parsers.ts`:
   ```typescript
   export const parseDailyUserStats = (data: unknown) => { ... }
   export const parseEventMetadata = (data: unknown) => { ... }
   ```

3. **Replace cast sites** one by one, testing as you go:
   - `daily-rollup.ts:348` → use `parseDailyUserStats(row.userStats)`
   - `events/route.ts:91` → use `parseEventMetadata(metadata)`

4. **Add ESLint rule** to warn on `as unknown as` in JSON-handling files.

**Success metric**: 0 double casts in data transformation code; 100% of JSON column reads validated by an explicit parser.

## Notes

- Zod schemas can be reused for Prisma schema validation as well, creating a single source of truth.
- Consider adding a pre-commit hook to catch new `as unknown as` patterns before they land.

## Resolution

Implemented `packages/web/src/lib/server/parsers.ts` with Zod-backed runtime validators:

- `DailyUserStatSchema`
- `parseDailyUserStats()`
- `serializeDailyUserStats()`
- `EventMetadataSchema`
- `parseEventMetadata()`

Updated `packages/web/src/lib/server/daily-rollup.ts`:

- DB `userStats` JSON reads now use `parseDailyUserStats(row.userStats)`.
- DB `userStats` JSON writes now use `serializeDailyUserStats(rollup.userStats)`.
- The two `as unknown as` casts in this file were removed.

Updated `packages/web/src/app/api/events/route.ts`:

- event/message/tool `toolInput` JSON is validated through `parseEventMetadata()` before Prisma writes.
- The route remains free of `as unknown as` casts.

Added `packages/web/__tests__/lib/daily-rollup.test.ts` covering valid daily user stats, malformed data fallback, nullish fallback, serialization validation, and event metadata validation.

Verification:

- `pnpm --filter @argos/web exec vitest run __tests__/lib/daily-rollup.test.ts` passed.
- `pnpm --filter @argos/web typecheck` passed.
- `rg "as unknown as" packages/web/src/lib/server/daily-rollup.ts packages/web/src/app/api/events/route.ts` produced no matches.
