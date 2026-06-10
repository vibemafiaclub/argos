# Project Conventions — Argos

> Argos: Claude Code 사용 패턴 분석 서비스. pnpm + Turborepo 모노레포.

## Language / Stack
- Primary language / framework: TypeScript (strict). 워크스페이스 3개:
  - `packages/web` (`@argos/web`) — Next.js 15 App Router + Prisma(PostgreSQL/Supabase) + Auth.js(next-auth) + Tailwind CSS v4 + TanStack Query. API 라우트(`/api/events`, `/api/auth/*` 등)도 여기에 있음.
  - `packages/cli` (`argos-ai`, npm 배포) — commander + @inquirer/prompts 기반 CLI. Claude Code/Codex hook 설치 담당.
  - `packages/shared` (`@argos/shared`) — zod 스키마/공용 타입. web·cli가 의존.
- Package manager / runtime: pnpm 9 (`pnpm-workspace.yaml`), Node.js, Turborepo(`turbo.json`).

## Code Style
- Naming: 기존 파일들의 컨벤션을 따른다 (컴포넌트 PascalCase, 그 외 kebab-case 파일명, camelCase 식별자).
- File / directory structure rules: web은 `src/app`(라우트), `src/components`, `src/hooks`, `src/lib`, `src/types`. 공용 타입/스키마는 `packages/shared`에 둔다.
- Formatter / linter: `pnpm lint` (eslint 9 flat config). 패키지 단위는 `pnpm --filter <pkg> lint`.

## Verification Commands (used by verifier / implementer)
- Type check: `pnpm typecheck` (전체) / `pnpm --filter @argos/web typecheck`
- Lint: `pnpm lint`
- Unit tests: `pnpm --filter @argos/web test`, `pnpm --filter argos-ai test` (vitest, watch는 `test:watch`)
- Integration / e2e tests: 별도 e2e 없음. 테스트 작성 시 `.claude/skills/test-strategy` 스킬의 지침을 따른다.
- Build: `pnpm build` (turbo; web 빌드에는 `DATABASE_URL` 등 env 필요 — 로컬에서 env 없이 build 실패는 코드 결함이 아닐 수 있음)

## Forbidden / Caveats (false-positive prevention)
- `packages/web/prisma/migrations/**` — 이미 적용된 마이그레이션 파일은 절대 수정 금지. 스키마 변경 시 새 마이그레이션 생성. 마이그레이션 포함 커밋 후에는 `prisma-migration-checklist` 스킬이 배포 체크리스트를 안내한다.
- Prisma Client는 generated 코드 — 직접 수정 금지 (`pnpm --filter @argos/web db:generate`).
- `persuasion-data/`, `iterations/`, `tasks/`, `prompts/`, `cc-test/` — 파이프라인/실험 산출물. 기능 구현 중 임의 수정 금지.
- `docs/adr.md`는 append-only (new-task 파이프라인이 관리).
- 관리자 자격증명(`ADMIN_USERNAME`/`ADMIN_PASSWORD`) 등 비밀값 하드코딩 금지 — env로만 (과거 보안 이슈 #19).
- 대시보드 UI 작업 시 반드시 `.claude/skills/ui-design-system` 스킬을 참조해 톤앤매너/공용 컴포넌트 규칙을 따른다.
- `docs/code-architecture.md`의 `packages/api`(Hono/Railway) 부분은 과거 구조 — 현재 API는 `packages/web`의 Next.js 라우트다. 문서와 코드가 다르면 코드가 진실.

## Domain Glossary
- **Argos**: 팀의 Claude Code 사용 패턴 분석 서비스 (모토: "Analytics for Your Claude Code").
- **CLI hook**: `argos` CLI가 `.claude/settings.json` / `.codex/hooks.json`에 설치하는 이벤트 훅. 세션 이벤트를 `/api/events`로 전송.
- **`.argos/project.json`**: 프로젝트별 projectId/orgId/apiUrl 설정 파일 (커밋 대상).
- **org / project**: 대시보드의 조직·프로젝트 단위. 이벤트는 project에 귀속.
- **UC**: docs/usecases/의 유스케이스 카탈로그 항목. **ADR**: docs/adr.md의 아키텍처 결정 기록.

## Architecture Notes
- 데이터 흐름: CLI(개발자 머신) → HTTPS POST `/api/events` → Next.js API 라우트 → Prisma → PostgreSQL(Supabase). 웹 대시보드(Vercel)가 같은 DB를 조회.
- 인증: 웹은 Auth.js 세션, CLI는 이메일/비밀번호 로그인 → JWT(jose) Bearer.
- 의존 방향: `web`/`cli` → `shared` (역방향 금지). 검증 스키마는 zod로 shared에 정의해 공유.
- 상세 설계 의도는 `docs/adr.md`, `docs/code-architecture.md`, `docs/data-schema.md` 참조.
