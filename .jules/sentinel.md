## 2026-05-28 - [Critical] Hardcoded Admin Password
**Vulnerability:** A hardcoded admin password `[REDACTED]` was found in `packages/web/src/lib/server/admin-auth.ts`.
**Impact:** Anyone with read access to the repository could obtain the admin password.
**Immediate Action:** If this password was used in any production or staging environment, it must be rotated immediately.
**Learning:** Hardcoding credentials in source code exposes them to anyone who has read access to the repository, leading to severe compromise.
**Prevention:** Always use environment variables for sensitive secrets and credentials, defining them via `env.ts` using `zod` and `.env` files.
**Remediation:**
- Added `ADMIN_SECRET` to environment schema in `packages/web/src/lib/server/env.ts` with zod validation.
- Updated `packages/web/src/lib/server/admin-auth.ts` to use `env.ADMIN_SECRET`.
- Added `ADMIN_SECRET` placeholder to `packages/web/.env.example`.
- Verification: Ensure `.env` contains `ADMIN_SECRET` and run `pnpm run build` to verify type safety.
