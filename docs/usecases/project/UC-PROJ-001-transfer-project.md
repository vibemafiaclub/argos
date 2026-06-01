---
id: UC-PROJ-001
name: 프로젝트를 다른 organization 으로 이동시킨다
level: user-goal
scope: 웹 대시보드 + 백엔드 API
primary_actor: 출발·대상 org 양쪽 OWNER 사용자
status: active
includes: []
related: [UC-CLI-001]
e2e: []
coverage_status: pending
sources:
  - docs/tasks/2026-05-14-project-transfer-org/01-clarify.md
  - docs/tasks/2026-05-14-project-transfer-org/03-plan.md
last_reviewed: 2026-05-14
---

## 이해관계자와 관심사

- **출발·대상 org 양쪽 OWNER 사용자**: 프로젝트의 자식 데이터(ClaudeSession/Event/UsageRecord/Message/DailyProjectStat) 를 잃지 않으면서 소속만 바꾸고 싶다.
- **출발 org 의 기타 멤버**: 이전 후 더 이상 이 프로젝트에 접근할 수 없어야 한다 (권한 누수 방지).
- **대상 org 의 기타 멤버**: 이전 직후에는 멤버가 0이므로, 대상 org 가 OWNER 의 명시적 grant 없이 새 프로젝트의 멤버를 자동으로 떠안지 않는다.
- **플랫폼 운영자**: 이전 도중 어떤 부분 실패가 일어나도 데이터 불일치(권한 누수 등) 가 발생하지 않는다.

## 사전조건

- P1. 호출자는 `Project.orgId` 가 가리키는 출발 org 와 대상 org 양쪽에 OWNER 멤버십을 가진다.
- P2. 대상 org slug 가 가리키는 organization 이 존재한다.

## 트리거

- T1. 웹 대시보드의 settings/projects 페이지에서 "Transfer Project" 액션 실행.
- T2. API 직접 호출 (`POST /api/projects/{projectId}/transfer`).

## 성공 보장 (Postconditions)

- G1. `Project.orgId` = 대상 org 의 id.
- G2. 해당 project 의 `ProjectMember` 레코드 수 = 0.
- G3. 자식 테이블(`ClaudeSession`/`Event`/`UsageRecord`/`Message`/`DailyProjectStat`) 의 `projectId` 별 row count 는 이전과 동일.
- G4. 응답 body 에 갱신된 `{ id, orgId, orgSlug, name, slug, createdAt }` 이 포함된다.

## 최소 보장

- M1. 어떤 확장 경로(403/404/409) 에서도 `Project.orgId`, `ProjectMember`, 자식 테이블 어느 것도 변경되지 않는다 (단일 `db.$transaction`).
- M2. 트랜잭션 도중 P2002 (unique 위반) 가 발생해도 그때까지 발생한 update 가 commit 되지 않는다.

## 주 성공 시나리오

1. (User · UI) `/dashboard/{srcOrgSlug}/settings/projects` 에서 프로젝트를 선택하고 "Transfer Project" 섹션에서 대상 org 를 dropdown 으로 선택한 뒤 "Transfer" 버튼을 클릭한다.
2. (System · UI) "ProjectMember 가 모두 제거되고 대상 org 에서 다시 멤버를 부여해야 합니다" 안내의 confirm dialog 를 띄운다.
3. (User · UI) "계속" 을 클릭한다.
4. (System · API) `POST /api/projects/{projectId}/transfer { targetOrgSlug }` 를 호출한다.
5. (System) 호출자가 출발 org 와 대상 org 양쪽에서 role === 'OWNER' 임을 검증한다.
6. (System · DB) 단일 `db.$transaction` 안에서 `Project.orgId` 를 targetOrg.id 로 갱신하고 `ProjectMember.deleteMany({ where: { projectId } })` 를 실행한다.
7. (System · API) 200 + `{ project: { id, orgId, orgSlug, name, slug, createdAt } }` 를 반환한다.
8. (System · UI) `/dashboard/{targetOrgSlug}/settings/projects` 로 라우트를 바꾸고 "Transferred" 토스트를 표시한다.

## 확장 (Extensions)

- 5a. 호출자가 출발 또는 대상 org 에서 OWNER 가 아님 →
  - 5a.1. (System · API) 403 + `{ error: { code: 'FORBIDDEN', message } }` 반환. M1 으로 어떤 row 도 변경되지 않음.
  - 5a.2. (System · UI) 에러 토스트 표시 후 종료.
- 5b. project 또는 targetOrg 가 존재하지 않음 →
  - 5b.1. (System · API) 404 + `{ error: { code: 'NOT_FOUND', message } }` 반환. M1.
  - 5b.2. (System · UI) 에러 토스트 표시 후 종료.
- 5c. `project.orgId === targetOrg.id` (same_org) →
  - 5c.1. (System · API) 200 + 현재 project 상태를 그대로 반환. 어떤 변경도 발생하지 않음.
  - 5c.2. (System · UI) UI 에서는 대상 org 후보 dropdown 이 현재 org 를 제외하므로 일반 사용자는 이 경로에 도달하지 않는다. API 직접 호출 시에만 발생.
- 6a. 트랜잭션 중 `(orgId, slug)` unique 위반 (대상 org 에 동일 slug 프로젝트 존재) →
  - 6a.1. (System · API) 409 + `{ error: { code: 'PROJECT_SLUG_CONFLICT', message: '대상 org 에 같은 이름(slug)의 프로젝트가 이미 있습니다. 한쪽 이름을 먼저 변경한 뒤 다시 시도하세요.' } }` 반환. M2 로 부분 commit 없음.
  - 6a.2. (System · UI) 모달 안에 Alert 로 안내 후 종료.

## 기술/데이터 변형

- V1. T2 (API 직접 호출) 진입 시 1~3 단계를 건너뛰고 4 단계로 진입한다. 5c 경로의 same_org noop 도 이 변형에서만 의미가 있다.

## 참고

- `docs/data-schema.md` — `Project`, `ProjectMember`, `(orgId, slug)` unique 제약.
- `docs/spec.md` §"계약의 원천" — 권한 체크 결과를 `kind` discriminated union 으로 노출하는 패턴.
- `packages/web/prisma/schema.prisma` — `OrgRole`, `Project`, `ProjectMember` 정의.
- `packages/web/src/lib/server/project-actions.ts` — `transferProjectForUser` 진입점.
- `packages/web/src/app/api/projects/[projectId]/transfer/route.ts` — 라우트 핸들러.
- ADR: task 2026-05-14-project-transfer-org 의 Decision-1, Decision-3, Decision-4, Decision-5 가 `docs/adr.md` 에 기록됨.
