---
title: "API routes have duplicated auth/access control boilerplate"
created_at: 2026-06-08T18:40:00Z
resolved: partial
priority: P1
related:
  - goals/_meta.md
---

# API routes have duplicated auth/access control boilerplate

## TL;DR

34+ API route handlers repeat the same auth and org access check pattern verbatim, creating maintenance risk and inviting security errors. The pattern occurs in ~58 places across the codebase. Extracting to a HOF (higher-order function) wrapper would eliminate the duplication and guarantee consistency.

## Body

Every API route in `packages/web/src/app/api/**/*.ts` follows this identical sequence:

```typescript
const auth = await requireAuth(req)
if (auth instanceof NextResponse) return auth
const { userId } = auth

const access = await assertOrgAccessBySlugOrResponse(orgSlug, userId)
if (access instanceof NextResponse) return access
```

This ~6-line block appears in at least 58 locations. Examples:

- `src/app/api/orgs/[orgSlug]/projects/route.ts:18–24`
- `src/app/api/orgs/[orgSlug]/invitations/route.ts:15–21`
- `src/app/api/orgs/[orgSlug]/members/route.ts:12–18`
- …and 30+ more

The pattern is so ubiquitous that variations are easy to miss—e.g., a handler that checks access but forgets the auth check, or vice versa. Each variation risks:

1. **Unintended public exposure** (auth check skipped)
2. **Cross-org data leaks** (access check skipped)
3. **Inconsistent error responses** (some return 401, others 403, some silently fail)

Additionally, if the auth/access logic changes (e.g., adding JWT validation, changing error codes, adding audit logging), all 58 sites must be updated—any miss is a silent security regression.

## Options / Recommendation

- **(A) Extract to a HOF wrapper.** Recommended. Example:
  ```typescript
  export const withOrgAuth = (handler: ProtectedOrgHandler) =>
    async (req: Request, context: { params: { orgSlug: string } }) => {
      const auth = await requireAuth(req)
      if (auth instanceof NextResponse) return auth
      const { userId } = auth

      const access = await assertOrgAccessBySlugOrResponse(context.params.orgSlug, userId)
      if (access instanceof NextResponse) return access

      return handler(req, context, { userId, ...access })
    }

  // Usage:
  export const POST = withOrgAuth(async (req, context, auth) => {
    // business logic only
  })
  ```
  **Wins**: One definition, 34 call sites, type-safe, audit-able.

- **(B) Next.js route groups + middleware.** Larger refactor; consider for a future epoch if all routes are ported to a unified middleware stack.

## Acceptance signal

A new test `packages/web/__tests__/api-auth-guard.test.ts` that:

1. Creates a mock withOrgAuth wrapped handler.
2. Asserts that missing/invalid auth returns NextResponse (401).
3. Asserts that valid auth but org access denied returns NextResponse (403).
4. Asserts that valid auth + access calls the handler with correct context.

Test should go RED initially (no wrapper yet), then GREEN after HOF is implemented.

## Migration plan

1. **Define the HOF** in a new `lib/server/route-wrappers.ts`:
   - `withOrgAuth(handler)` – auth + org-level access
   - `withAuth(handler)` – auth only (for non-org routes)
   - Proper TypeScript typing for request/response.

2. **Convert high-traffic routes first** (those most frequently called or with recent changes):
   - `projects/route.ts`
   - `members/route.ts`
   - `invitations/route.ts`
   
3. **Gradually port remaining routes** in batches.

4. **Add linter rule** (via ESLint + TypeScript) to warn if a route handler in `app/api/**` doesn't use the wrapper.

5. **Update docs** in `CONTRIBUTING.md` to require wrapper use for all new routes.

**Success metric**: 0 non-wrapped auth-required routes in `app/api/**` and test coverage at 100% of the wrapper logic.

## Notes

- This does not replace per-handler business logic validation (e.g., "is this user allowed to edit this project?"). The HOF only handles org-level access, which is a prerequisite.
- The access check function (`assertOrgAccessBySlugOrResponse`) already exists and is reusable; we're just avoiding manual repetition.

## Resolution

Implemented a shared route wrapper module at `packages/web/src/lib/server/route-wrappers.ts`:

- `withOrgAuth()` centralizes `requireAuth()` plus org-slug access checks.
- `withAuth()` centralizes auth-only handlers for routes whose existing behavior should not require prior org membership.

Ported existing high-traffic routes:

- `packages/web/src/app/api/orgs/[orgSlug]/projects/route.ts` GET/POST now use `withOrgAuth()`.
- `packages/web/src/app/api/orgs/[orgSlug]/members/route.ts` GET now uses `withOrgAuth()`.
- `packages/web/src/app/api/orgs/[orgSlug]/members/route.ts` POST now uses `withAuth()` to preserve the existing self-join flow for authenticated users with an org slug/id.

Added `packages/web/__tests__/api-auth-guard.test.ts` covering:

- unauthenticated request returns 401 and skips the handler,
- authenticated request with denied org access returns 403 and skips the handler,
- authenticated request with org access calls the handler with `{ userId, orgSlug, org, role }`.

Verification:

- `pnpm --filter @argos/web exec vitest run __tests__/api-auth-guard.test.ts` passed.
- `pnpm --filter @argos/web typecheck` passed.
- `rg "requireAuth|assertOrgAccessBySlugOrResponse" packages/web/src/app/api/orgs/[orgSlug]/projects/route.ts packages/web/src/app/api/orgs/[orgSlug]/members/route.ts packages/web/src/lib/server/route-wrappers.ts` shows those calls only in `route-wrappers.ts`.

Partial scope note: `packages/web/src/app/api/orgs/[orgSlug]/invitations/route.ts` and a corresponding invitation model are not present in the current codebase, so that route could not be ported in this cycle without introducing a new product/API surface. The wrapper and two existing target routes are complete; invitation routing remains a future implementation task if/when invitations are added.
