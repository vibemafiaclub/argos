# Clarify — 2026-05-14-project-transfer-org

## 요구사항 한 줄 요약
출발 org OWNER 이면서 대상 org OWNER 인 사용자가 웹 대시보드(또는 API) 에서 프로젝트를 다른 organization 으로 이동시키는 기능. 별도 수락 절차 없이 즉시 이동되며, CLI 는 stale 한 `.argos/project.json` 을 서버 응답으로 self-heal 한다.

## 배경/동기
조직 재편/소속 변경 등으로 한 org 에 속한 프로젝트를 다른 org 로 옮겨야 하는 실수요가 존재. 현재는 이 동작이 없어 프로젝트를 새 org 에서 다시 만들고 과거 데이터(이벤트/세션/통계)를 잃거나 수동 마이그레이션이 필요. transfer 기능으로 데이터 연속성을 유지한 채 소속만 바꿀 수 있게 한다.

## 명시적 범위 (In scope)

### 권한 모델
- **출발 org OWNER + 대상 org OWNER** 양쪽 멤버십을 동시에 가진 사용자만 transfer 실행 가능.
- 둘 중 하나라도 OWNER 가 아니면 403.
- 권한 체크는 기존 `packages/web/src/app/api/projects/[projectId]/route.ts` PATCH/DELETE 패턴 따라감 (`requireAuth` + role 검증).

### 노출 표면
- **웹 대시보드**: 프로젝트 settings 화면 (`dashboard/[orgSlug]/settings/projects/...` 계열) 에서 transfer UI 노출. 대상 org slug 입력 → 확인 → 실행.
- **API**: 위 UI 가 호출하는 백엔드 엔드포인트도 동일 계약으로 외부에서 사용 가능 (curl/스크립트).
- CLI 전용 명령어(`argos project transfer ...`) 는 추가하지 않음.

### slug 충돌 처리
- `Project.slug` 는 `(orgId, slug)` 유니크. 대상 org 에 동일 slug 의 프로젝트가 이미 있으면 transfer 거부.
- HTTP **409 CONFLICT** + 에러 메시지: "대상 org 에 같은 이름(slug)의 프로젝트가 이미 있습니다. 한쪽 이름을 먼저 변경한 뒤 다시 시도하세요."
- **자동 rename 하지 않음** (suffix 부착 / 추가 입력란 모두 비범위).

### ProjectMember 처리
- transfer 트랜잭션 안에서 해당 project 의 `ProjectMember` 레코드 **전부 삭제**.
- 대상 org 에서 새로 멤버를 부여하는 흐름으로 운영. (대상 org 비멤버에게 권한이 누수되는 사고 방지.)

### 데이터 모델 변경 범위
- `Project.orgId` 만 새 org 의 id 로 갱신.
- 자식 테이블(`ClaudeSession`, `Event`, `UsageRecord`, `Message`, `DailyProjectStat` 등) 은 `projectId` 외래키로 자동 추적되므로 추가 마이그레이션/업데이트 불필요.
- `Project.slug` 는 그대로 유지(충돌 시 위 정책으로 거부).
- 위 모든 작업(`orgId` 갱신 + `ProjectMember` 삭제)은 단일 DB 트랜잭션 안에서 처리.

### CLI self-heal (`.argos/project.json` stale orgId 처리) — **이번 task 스코프에 포함**
- 서버: project lookup 응답(또는 hook 시작 시 호출되는 기존 엔드포인트) 에 항상 **현재 정답 `orgId` / `orgSlug`** 를 포함하도록 응답 스키마 확장.
- CLI: hook 실행 시 받은 응답의 `orgId`/`orgSlug` 가 로컬 `.argos/project.json` 과 다르면 **로컬 파일을 자동으로 덮어쓰기 (self-heal)**. 다음 commit 에 자연스레 반영.
- 그 결과 `joinOrg` / `ensureMembership` 호출은 항상 정답 org 로 향한다.

## 명시적 비범위 (Out of scope)
- 이동 알림(이메일/슬랙/in-app notification).
- 이동 이력(audit log) 테이블/엔드포인트.
- undo / 롤백 전용 기능 (필요 시 transfer 를 다시 호출해 원복).
- 이동 도중 발생한 in-flight 이벤트의 별도 처리 (단일 트랜잭션으로 종결, race condition 무시).
- 여러 프로젝트 일괄 이동 (1건씩만).
- CLI 전용 transfer 명령어 (`argos project transfer ...`).
- 대상 org slug 충돌 시 자동 rename / 추가 입력란.
- ProjectMember 를 대상 org 멤버 기준으로 부분 보존하는 정책 (전부 삭제로 단일화).

## 성공 기준
1. 출발/대상 org 양쪽 OWNER 인 사용자가 웹 settings 에서 transfer 실행 시, 응답 200 + `Project.orgId` 가 대상 org 로 갱신된다.
2. 권한 미충족 시(어느 한쪽이라도 OWNER 아님) 403 으로 거부되고 `Project.orgId` 는 변경되지 않는다.
3. 대상 org 에 동일 slug 프로젝트가 있는 경우 409 + 안내 메시지가 반환되고 어떤 데이터도 변경되지 않는다.
4. transfer 성공 후 해당 project 의 `ProjectMember` 레코드가 0건 이다.
5. transfer 후 자식 테이블(`ClaudeSession`/`Event`/`UsageRecord`/`Message`/`DailyProjectStat`) 의 데이터는 그대로 유지되며 새 org 의 대시보드에서 조회된다.
6. transfer 후 stale `.argos/project.json` 을 가진 클라이언트가 hook 을 실행하면, 서버 응답으로 로컬 파일이 새 `orgId`/`orgSlug` 로 자동 갱신된다 (다음 git diff 에 그 변경이 떠야 함).

## 가정 (Assumptions)
- Role 모델은 OWNER / MANAGER / MEMBER / VIEWER 4단계 (`packages/web/prisma/schema.prisma` 의 `OrgRole` 기준, PRD 와 코드가 다를 시 코드가 진실).
- transfer 권한 체크는 기존 `packages/web/src/app/api/projects/[projectId]/route.ts` PATCH/DELETE 와 동일 패턴 (App Router + `requireAuth`).
- `.argos/project.json` 은 git 에 커밋되는 파일 (`flow.md` Flow 1 가정 유지).
- hook 실행 시 CLI 가 서버에 project 를 lookup 하는 경로(또는 그에 준하는 기존 호출)가 이미 존재하거나, self-heal 을 위해 한 번 추가하는 비용이 허용된다.
- transfer 는 트랜잭션 1회로 종료되며, 동시 transfer 는 DB unique 제약과 row-level lock 으로 자연 직렬화된다.

## 미해결 위험 (Open risks)
- CLI self-heal 이 로컬 파일을 자동 수정하므로, 사용자가 git diff 에 뜬 `.argos/project.json` 변경을 의아해할 수 있다. 다음 단계(plan/spec) 에서 안내 문구/로그를 어떻게 띄울지 정해야 함.
- hook 경로에 server round-trip 이 추가되거나 응답 스키마가 바뀌므로, 기존 CLI 버전(구버전) 호환성 점검 필요.
- transfer 직후 대시보드 캐시(SWR/route cache) 가 옛 org 기준으로 남을 수 있음 — 무효화 전략을 plan 단계에서 결정.

## 관련 기존 문서
- `docs/prd.md` — 프로젝트/조직 모델 및 권한 개념(코드와 차이가 있을 시 코드 우선).
- `docs/spec.md` §"계약의 원천" — 코드(prisma schema, route handler) 가 진실.
- `docs/data-schema.md` — `Project.orgId`, `(orgId, slug)` 유니크, `ProjectMember`, 자식 테이블의 `projectId` 외래키 구조.
- `docs/flow.md` Flow 1 — `.argos/project.json` 생성/사용/git 커밋 흐름. self-heal 동작이 이 흐름에 자연스레 끼어들어야 함.
- `docs/code-architecture.md` — Next.js App Router 기반 API 핸들러 위치 규약.
- `packages/web/prisma/schema.prisma` — `OrgRole`, `Project`, `ProjectMember` 정의.
- `packages/web/src/app/api/projects/[projectId]/route.ts` — 권한 체크/트랜잭션 패턴 참조 원본.
