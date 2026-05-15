# Context — 2026-05-14-project-transfer-org

## 관련 코드 위치

| # | path | lines | 역할 | 변경 가능성 |
|---|------|-------|------|-------------|
| 1 | packages/web/prisma/schema.prisma | 13-26, 54-73, 154-187 | `Organization` / `OrgMembership` / `OrgRole` / `Project` (`@@unique([orgId, slug])`) / `ProjectMember` 정의. transfer 가 `orgId` 만 갱신하고 `ProjectMember` 전부 삭제할 대상 모델. | 참조 (스키마 변경 없음) |
| 2 | packages/web/src/app/api/projects/[projectId]/route.ts | 1-109 | GET/PATCH/DELETE handler. transfer 엔드포인트의 권한 체크/에러 응답/`requireAuth` 패턴 reference. | 신규 인접 (POST /transfer 라우트 추가 위치 후보) |
| 3 | packages/web/src/lib/server/project-actions.ts | 71-212 | `getProjectForUser` / `updateProjectForUser` — kind-결과 패턴(`ok`/`not_found`/`forbidden`/`name_conflict`). transfer 액션도 동일 패턴으로 추가. | 신규 인접 (`transferProjectForUser` 추가) |
| 4 | packages/web/src/lib/server/dashboard.ts | 16-64, 71-116 | `assertOrgAccess` / `assertOrgAccessBySlug` (org slug→id+role) / `assertProjectAccess`. 양쪽 org OWNER 검증에 재사용. | 참조 |
| 5 | packages/web/src/lib/server/rbac.ts | 28-37, 55-63 | `canManageOrg` / `canDeleteOrg` / `forbiddenByRole`. OWNER 전용 체크 헬퍼. | 참조 (`canTransferProject` 추가 검토) |
| 6 | packages/web/src/lib/server/dashboard-route-helper.ts | 22-69 | `assertOrgAccessBySlugOrResponse` / `assertProjectAccessOrResponse`. 라우트에서 NextResponse 변환에 재사용. | 참조 |
| 7 | packages/web/src/app/api/orgs/[orgSlug]/route.ts | 57-118 | PATCH 패턴 — 권한(`canManageOrg`) + Zod parse + `Prisma P2002 → 409` 변환. transfer 의 slug 충돌(P2002) 처리 reference. | 참조 |
| 8 | packages/web/src/app/api/orgs/[orgSlug]/projects/route.ts | 56-118 | POST `/api/orgs/:orgSlug/projects` — 프로젝트 생성 시 모든 org 멤버를 `ProjectMember` 로 자동 추가. transfer 후 ProjectMember 비우는 정책의 대척점(주의: 신규 도착 org 에서 자동 추가 로직 실행되지 않음). | 참조 |
| 9 | packages/web/src/app/api/events/route.ts | 36-58 | 이벤트 ingest 의 project 조회 + org membership 검사(403). 이번 task 는 응답 스키마 확장 후보(현재는 `{ ok: true }` 만, `orgId`/`orgSlug` 추가 자리). | 수정 (CLI self-heal 응답 확장) |
| 10 | packages/cli/src/lib/project.ts | 5-14, 21-77 | `ProjectConfig` 타입(orgId/orgSlug optional) + `findProjectConfig` / `writeProjectConfig`. self-heal 시 `writeProjectConfig` 재사용해 로컬 파일 갱신. | 수정 (write 호출부 추가) |
| 11 | packages/cli/src/commands/hook.ts | 141-240 | hook entry. `deps.events.sendBackground` 호출 후 즉시 exit. self-heal 은 detached 자식 프로세스 응답을 부모가 못 보므로, 응답 처리 위치를 `event-sender` 자식 스크립트 안 또는 별도 동기 lookup 호출로 옮겨야 함. | 수정 |
| 12 | packages/cli/src/lib/event-sender.ts | 12-31 | detached 자식 프로세스로 fetch 후 응답을 버린다(`.catch(()=>{})`). self-heal 하려면 자식 스크립트가 응답 JSON 을 읽어 `.argos/project.json` 을 갱신하도록 확장 필요. | 수정 |
| 13 | packages/cli/src/commands/default.ts | 117-159, 214-246 | Flow 2 (`runLoginAndJoin`) / Flow 4 (`ensureOrgMembershipAndShowStatus`) 가 `project.orgSlug ?? project.orgId` 로 `joinOrg` / `ensureMembership` 호출. self-heal 후 자연스레 새 org 로 향한다. | 참조 (자체 변경 없음, 동작 검증) |
| 14 | packages/shared/src/types/project.ts | 1-23 | `Project` / `CreateProjectResponse` 타입. transfer 응답 타입 + ingest 응답 확장 타입을 같은 파일에 추가하는 후보. | 수정 (TransferProjectResponse 추가) |
| 15 | packages/web/src/app/dashboard/[orgSlug]/settings/projects/page.tsx | 212-317 | 현재는 ProjectMember 관리 UI. transfer UI 는 별도 카드/섹션으로 같은 페이지(또는 인접) 에 추가. `useOrgs` 로 후보 org slug 목록(OWNER 만 필터) 확보 가능. | 수정 (Transfer 섹션 추가) |

## 관련 기존 ADR

| ADR | 제목 | 이번 task와의 관계 |
|-----|------|---------------------|
| ADR-007 | `.argos/project.json`을 git으로 관리 | self-heal 이 git-tracked 파일을 자동 수정 → 다음 git diff 에 변경이 떠서 팀에 전파되는 메커니즘. transfer self-heal 의 핵심 가정. |
| ADR-005 | argos hook 은 항상 exit 0, 즉시 종료 | hook 의 self-heal 응답 처리는 detached 자식에서 일어나야 하며 부모 hook 의 즉시 exit 를 깨면 안 됨. event-sender 확장 시 ADR-005 위반 금지. |
| ADR-006 | 이벤트 저장 — fire-and-forget, 재시도 없음 | self-heal 도 best-effort. 응답 손실/네트워크 실패 시 다음 hook 에서 다시 시도되는 구조여야 함. |
| ADR-010 | argos 단일 커맨드 — 컨텍스트 감지 | transfer 후 stale config 으로 `argos` 재실행 시 Flow 4 의 `ensureMembership` 호출이 새 org 로 가야 함 (self-heal 이 hook 만이 아니라 default command 에도 필요한지 plan 단계에서 결정). |
| ADR-003 | Email/Password 자체 인증 | 권한 체크는 `requireAuth` (CliToken JWT) 한 가지 경로. 별도 OAuth 분기 없음. |

## Negative Space (만지지 말 것)

- audit log 모델 신규 추가 금지 — 이번 task 는 transfer 사실 자체만 즉시 적용.
- 알림(이메일/슬랙/in-app) 신규 추가 금지.
- undo / 롤백 전용 기능 만들지 말 것 — 재 transfer 호출로 복구.
- in-flight 이벤트 큐 처리(transfer 도중 도착 이벤트 격리/대기) 금지 — 단일 트랜잭션 종료 후 race condition 무시.
- `packages/cli/src/commands/` 에 `transfer.ts` 같은 신규 명령어 추가 금지 — 이번 task 는 CLI self-heal 만.
- 자동 rename / suffix (`-2` 등) 로직 추가 금지 — 충돌 시 409 만 반환.
- 다른 자식 테이블(`ClaudeSession`/`Event`/`UsageRecord`/`Message`/`DailyProjectStat`) 의 `projectId` 또는 `orgId` 컬럼 마이그레이션/업데이트 금지 — `Project.orgId` 갱신만으로 충분.
- `packages/web/src/app/api/orgs/[orgSlug]/projects/route.ts` 의 "신규 프로젝트에 모든 org 멤버 자동 추가" 로직을 transfer 후 도착 org 에 대해 재실행하지 말 것 (요구사항: 도착 org 에서 0명으로 시작).

## 폴더 구조 메모

- `packages/web/src/app/api/...` — Next.js App Router. handler 는 얇게 두고 `lib/server/*` (project-actions, dashboard, rbac, dashboard-route-helper) 의 순수 로직을 호출하는 패턴.
- `packages/web/src/app/dashboard/[orgSlug]/...` — Auth.js v5 세션 기반 client/server component 혼합 페이지. settings/projects/page.tsx 가 ProjectMember 관리 UI 의 reference.
- `packages/web/src/lib/server/` — 'server-only' 마킹된 비즈니스 로직 모듈. transfer 액션은 `project-actions.ts` 에 추가 예정.
- `packages/web/prisma/` — schema + 타임스탬프 prefix 디렉토리 마이그레이션. 이번 task 는 스키마 변경 없음(데이터 변경만).
- `packages/cli/src/` — `commands/` (entrypoint) + `lib/` (순수 함수) + `adapters.ts` (실제 의존성 주입) + `deps.ts` (인터페이스). hook self-heal 은 `lib/event-sender.ts` 자식 스크립트에서 응답 후 `writeProjectConfig` 호출하는 형태가 최소 변경.
- `packages/shared/src/` — Zod 스키마(`schemas/`) + TS 타입(`types/`). API 응답 스키마 확장은 여기서 단일 출처로 정의.

## 추가 컨텍스트

- `IngestEventSchema` (packages/shared/src/schemas/events.ts:29) 는 요청 스키마만 정의. 이벤트 응답 스키마는 별도 정의된 게 없으며 `/api/events` 는 `{ ok: true }` 202 만 반환 → self-heal 응답 필드를 추가하려면 신규 응답 타입을 shared 에 정의해야 함.
- CLI 의 `ProjectConfig.orgSlug` 는 v0.1.13 미만 호환을 위해 optional. self-heal 은 항상 신 버전으로 채워 쓰는 방향.
- `event-sender` 자식 스크립트는 `process.execPath -e <inline>` 로 실행되므로 외부 모듈 import 불가. 응답 처리 로직을 inline 으로 작성하거나 자식 스크립트 자체를 별도 파일로 분리하는 결정이 plan 단계에 필요.
- `assertProjectAccess` (dashboard.ts:71) 은 `throw` 기반, `getProjectForUser` (project-actions.ts:81) 은 `kind`-결과 기반 — transfer 액션은 후자 패턴이 일관성 있음.
- 마이그레이션 파일 prefix: `YYYYMMDDHHMMSS_*` (예: `20260514000000_add_claude_plan`). 이번 task 는 마이그레이션 불필요.
