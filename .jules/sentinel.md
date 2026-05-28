## 2025-05-28 - [Critical] Hardcoded Admin Password
**Vulnerability:** A hardcoded admin password `og9oRajx7h88v1RIj3eDgdrh9jgLYVV3` was found in `packages/web/src/lib/server/admin-auth.ts`.
**Learning:** Hardcoding credentials in source code exposes them to anyone who has read access to the repository, leading to severe compromise.
**Prevention:** Always use environment variables for sensitive secrets and credentials, defining them via `env.ts` using `zod` and `.env` files.
