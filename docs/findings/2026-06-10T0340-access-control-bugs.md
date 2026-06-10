---
title: API 접근 제어 결함 — 임의 조직 가입, 세션 IDOR, MEMBER의 프로젝트 삭제
created_at: 2026-06-10T03:40:00Z
resolved: true
resolved_by: pending-push
priority: P0
status_notes: |
  A1 (invite token guard, existing member idempotent pass) — done
  A2 (session IDOR project check in GET/DELETE) — done
  A3 (project DELETE role check OWNER/MANAGER only) — done
  A4 (updateProjectForUser role check) — deferred to Tier 3
  A5 (cli-poll 1-use token) — done
related:
  - docs/findings/2026-06-10T0340-architecture-unintuitive.md
  - packages/web/src/lib/server/dashboard.ts
---

# API 접근 제어 결함 — 임의 조직 가입, 세션 IDOR, MEMBER의 프로젝트 삭제

## TL;DR

인가(authorization) 검사가 빠지거나 너무 느슨한 API가 5곳 확인됐다.
최악 조합: **아무 인증 사용자나 타 조직에 스스로 가입(A1)한 뒤 그 조직의
세션 전사본을 열람·삭제(A2)할 수 있다.** 별개로 일반 MEMBER가 프로젝트를
cascade 삭제(A3)할 수 있다. 전부 코드 리딩으로 검증된 경로이며 즉시 수정
대상이다.

## Body

### A1 — 임의 사용자가 아무 조직에나 스스로 멤버로 가입 (P0)

`packages/web/src/app/api/orgs/[orgSlug]/members/route.ts:80-130` — POST
핸들러가 `requireAuth(req)`(로그인 여부)만 검사하고 초대 토큰·기존 멤버십
검증 없이 `db.orgMembership.create({ data: { userId, orgId, role: 'MEMBER' } })`
를 실행한다. slug는 사용자 지정 소문자 문자열이라 열거 가능.

시나리오: 인증된 임의 사용자가 `POST /api/orgs/<남의-slug>/members` 호출
→ 해당 조직 MEMBER로 등록됨.

### A2 — 세션 상세/삭제가 프로젝트 멤버십을 검사하지 않음 (P0, IDOR)

`packages/web/src/app/api/orgs/[orgSlug]/dashboard/sessions/[sessionId]/route.ts:23-44`(GET),
`:145-178`(DELETE) — org 멤버십(`assertOrgAccessBySlugOrResponse`)만 확인.
세션 **목록**(`sessions/route.ts:137`)은 `resolveOrgScopedProjectIds`로
MEMBER를 자기 프로젝트로 제한하지만, 상세/삭제는 그 검사가 없다.
`canAccessSession`은 비-VIEWER면 무조건 true.

시나리오: 프로젝트 A에만 속한 MEMBER가 같은 org 프로젝트 B의 세션 ID로
`GET .../sessions/<id>` → 전사본·프롬프트(PII) 전체 열람, `DELETE`로 삭제.
A1과 결합하면 외부인이 임의 조직의 전사본을 열람할 수 있다.

### A3 — 일반 MEMBER가 프로젝트 전체를 cascade 삭제 (P0)

`packages/web/src/app/api/projects/[projectId]/route.ts:97-115` — DELETE가
`assertProjectAccessOrResponse`만 통과하면 `db.project.delete` 실행.
`assertProjectAccess`(`packages/web/src/lib/server/dashboard.ts:71-115`)는
project_members의 MEMBER/VIEWER도 통과시키고 역할 검사가 없다.
`ClaudeSession`/`Event`/`UsageRecord`/`Message`가 모두 `onDelete: Cascade`
(`packages/web/prisma/schema.prisma:251,288,326,355`)라 데이터가 영구 소실된다.
org 이관은 OWNER 전용인데 삭제는 무방비 — 일관성도 깨진다.

### A4 — 프로젝트 이름 변경이 MEMBER에게 허용 (P1)

`packages/web/src/lib/server/project-actions.ts:179-207`
(`updateProjectForUser`) — `!isAdmin && existing.members.length === 0`일
때만 forbidden이므로, project_members에 있는 MEMBER는 rename 가능.

### A5 — CLI 인증 토큰이 폴링으로 무제한 재노출 (P1)

`packages/web/src/app/api/auth/cli-poll/route.ts:30-33` — 승인된
`cliAuthRequest.token`(평문 1년 JWT, `packages/web/src/lib/server/jwt.ts:4`)을
`state`만 알면 만료(15분) 전까지 반복 반환한다. 1회 소비/무효화가 없어
`state` 유출 시 15분 창 동안 누구나 장기 토큰을 획득한다.

## Options / Recommendation

- A1: 초대 토큰 검증 추가, 또는 서버가 발급한 정당한 컨텍스트(온보딩 토큰
  등)에서만 가입 허용. **권장: 초대 기반으로 전환.**
- A2: 상세/삭제에서도 `resolveOrgScopedProjectIds`(또는
  `assertProjectAccess`)로 세션의 projectId 접근권 검증.
- A3/A4: 파괴적 작업(delete)·설정 변경(rename)은 OWNER/MANAGER로 제한
  (`canManageOrg` 재사용).
- A5: 토큰 1회 반환 후 `cliAuthRequest` 행 삭제(또는 token 컬럼 null 처리).

## Acceptance signal

각 항목에 대한 라우트 단위 테스트가 red→green:
- 비멤버 POST members → 403
- 타 프로젝트 MEMBER의 세션 GET/DELETE → 404/403
- MEMBER의 프로젝트 DELETE/PATCH → 403
- cli-poll 2회째 호출 → token 미반환

## Resolution

**A1** (`packages/web/src/app/api/orgs/[orgSlug]/members/route.ts`): 비멤버의 POST에 invite token 필수 가드 추가. 기존 멤버의 `ensureMembership` 호출은 멱등 OK 처리 유지. 초대 기반 플로우(invite → accept) 전환은 out-of-scope(별도 goal).

**A2** (`sessions/[sessionId]/route.ts`): GET/DELETE 핸들러에 `assertProjectAccessOrResponse` 검증 추가. MEMBER/VIEWER가 project_members에 없는 프로젝트의 세션에 접근하면 404 반환.

**A3** (`api/projects/[projectId]/route.ts`): DELETE 핸들러에 `canManageOrg` 역할 검사 추가. MEMBER/VIEWER는 403 반환.

**A5** (`api/auth/cli-poll/route.ts`): 토큰 반환 직전 `cliAuthRequest.token = null` 처리로 1회 소비 구현. 2회째 폴링은 `pending: true` 반환.

`dashboard.ts::assertProjectAccess`의 `ProjectAccessResult`에 `role` 필드 추가, `assertProjectAccessOrResponse` 반환 타입 업데이트.
