# Plan — 2026-05-14-project-transfer-org

## 개요
한 organization 에 속한 Project 를 다른 organization 으로 이동하는 기능을 추가한다. 출발/대상 양쪽 OWNER 인 사용자가 웹 settings 에서 transfer 를 실행하면 단일 트랜잭션으로 `Project.orgId` 를 갱신하고 해당 프로젝트의 `ProjectMember` 전부를 삭제한다. 동시에 `/api/events` 응답에 정답 `orgId`/`orgSlug` 를 실어 stale 한 `.argos/project.json` 을 CLI 가 자동 self-heal 하게 한다.

## 아키텍처/접근 선택

- **API 표면**: 옵션 A `POST /api/projects/[projectId]/transfer` (선택) vs 옵션 B `PATCH /api/projects/[projectId]` 의 `orgId` 필드 확장.
  - 채택: **A (POST /transfer)**. 이유: (1) transfer 는 단순 필드 갱신이 아니라 ProjectMember 전부 삭제 + slug 충돌 검증 + 양쪽 org OWNER 검증을 수반하는 별도 도메인 액션이라 PATCH 의 "부분 수정" 의미와 어긋난다, (2) 오용 위험(누군가 PATCH 로 orgId 만 살짝 바꾸는) 을 차단, (3) 라우트 핸들러를 얇게 유지하면서 `lib/server/project-actions.ts` 의 `transferProjectForUser` 라는 단일 진입점으로 정리하기 쉽다.
- **권한 체크 위치**: 옵션 A 라우트 핸들러 내부 vs 옵션 B `transferProjectForUser` 내부.
  - 채택: **B (server action 내부)**. 기존 `getProjectForUser`/`updateProjectForUser` 와 동일한 `kind` 결과 패턴을 유지해 라우트는 매핑만 하도록. 라우트는 `requireAuth` + 결과 → HTTP 매핑만 책임.
- **CLI self-heal 채널**: 옵션 A `/api/events` 응답 확장 (선택) vs 옵션 B 별도 `GET /api/projects/:id/lookup` 엔드포인트 추가.
  - 채택: **A (events 응답 확장)**. 이유: (1) 모든 hook 호출이 이미 `/api/events` 를 친다 → 추가 round-trip 0, (2) ADR-005/006 (hook 즉시 exit, fire-and-forget) 을 깨지 않으려면 이미 detached 자식이 응답을 받는 구조가 더 적합, (3) 신규 lookup 엔드포인트는 default 커맨드(Flow 4) 에서 별도 호출이 필요해질 수 있어 후속 task 에서 도입 가능. 본 task 는 events 응답만 확장한다.
- **트랜잭션 경계**: `Project.orgId` 갱신 + `ProjectMember.deleteMany` 를 단일 `db.$transaction` 안에서 실행. slug 충돌은 트랜잭션 안에서 unique 제약 위반(P2002) 을 잡아 `kind: 'slug_conflict'` 로 변환.

## Work Units

### WU-1: shared 타입/스키마 확장
- **수정/생성 파일**:
  - `/Users/choesumin/Desktop/dev/vmc/argos/packages/shared/src/schemas/project.ts` (수정)
  - `/Users/choesumin/Desktop/dev/vmc/argos/packages/shared/src/types/project.ts` (수정)
  - `/Users/choesumin/Desktop/dev/vmc/argos/packages/shared/src/types/events.ts` (수정)
- **입력 계약**: 없음 (정의 추가만).
- **출력 계약**:
  - `TransferProjectSchema = z.object({ targetOrgSlug: z.string().trim().min(1).regex(/^[a-z0-9-]+$/) })` export. (org slug regex 와 동일 — `UpdateOrgSchema` 참조.)
  - `TransferProjectResponse` 타입: `{ project: { id: string; orgId: string; orgSlug: string; name: string; slug: string; createdAt: string } }` — `createdAt` 은 wire format(string). 서버 내부(Date) 와 분리.
  - `IngestEventResponse` 타입: `{ ok: true; project: { id: string; orgId: string; orgSlug: string } }` (기존 `{ ok: true }` 의 superset, 이전 클라이언트와 호환).
- **의존**: 없음.
- **검증 방법**: `pnpm --filter @argos/shared build` 통과, `pnpm --filter @argos/shared test` (없으면 skip), 타입체크.
- **예상 LOC**: ~30

### WU-2: server action `transferProjectForUser`
- **수정/생성 파일**:
  - `/Users/choesumin/Desktop/dev/vmc/argos/packages/web/src/lib/server/project-actions.ts` (수정 — 함수 추가)
  - `/Users/choesumin/Desktop/dev/vmc/argos/packages/web/src/lib/server/project-actions.test.ts` (생성 — 신규 단위 테스트)
- **입력 계약**: `transferProjectForUser(projectId: string, userId: string, input: { targetOrgSlug: string })`.
- **출력 계약**: discriminated union
  - `{ kind: 'ok'; project: ProjectDetail & { orgSlug: string } }`
  - `{ kind: 'not_found' }` — projectId 또는 targetOrgSlug 가 존재하지 않음.
  - `{ kind: 'forbidden' }` — 출발 또는 대상 org 에서 OWNER 가 아님 (어느 한쪽이라도 OWNER 미충족 시).
  - `{ kind: 'slug_conflict' }` — 대상 org 에 동일 slug 의 프로젝트 존재.
  - `{ kind: 'same_org'; project: ProjectDetail & { orgSlug: string } }` — 출발 == 대상 (트랜잭션 skip, ProjectMember 보존, 현재 상태 200 으로 반환).
- **부수효과**:
  - 정상 경로: 단일 `db.$transaction(async (tx) => {...})` **callback form** 안에서 (a) **OrgMembership 재검증** (출발+대상 OWNER), (b) `tx.project.update({ where: { id }, data: { orgId } })`, (c) `tx.projectMember.deleteMany({ where: { projectId } })`. callback 이 throw 하면 prisma 가 자동 rollback. P2002 catch 는 callback 바깥에서 처리 → `err.meta?.target` 가 `(orgId, slug)` 인덱스(prisma 가 `['org_id','slug']` 또는 `Project_orgId_slug_key` 형태로 보고) 일 때만 `slug_conflict`, 그 외엔 re-throw.
  - same_org: 부수효과 0 — DB write 호출 없음 (트랜잭션 자체 skip).
- **로직 순서**:
  1. 트랜잭션 밖 1차 권한/존재 검증:
     - `project = db.project.findUnique({ where: { id: projectId }, select: { id, orgId, slug, name, createdAt, organization: { select: { id, slug, memberships: { where: { userId }, select: { role } } } } } })` → 없으면 not_found.
     - 출발 org membership.role === 'OWNER' 검증, 아니면 forbidden.
     - `targetOrg = db.organization.findUnique({ where: { slug: targetOrgSlug }, select: { id, slug, memberships: { where: { userId }, select: { role } } } })` → 없으면 not_found.
     - 대상 org membership.role === 'OWNER' 검증, 아니면 forbidden.
     - `project.orgId === targetOrg.id` → same_org (현 project + orgSlug 반환).
  2. 트랜잭션 (callback form) — 코드 골격 (planner 가 그대로 인용):
     ```ts
     const FORBIDDEN_RACE = Symbol('forbidden_race')
     try {
       const updated = await db.$transaction(async (tx) => {
         const sourceM = await tx.orgMembership.findUnique({
           where: { userId_orgId: { userId, orgId: project.orgId } },
           select: { role: true },
         })
         const targetM = await tx.orgMembership.findUnique({
           where: { userId_orgId: { userId, orgId: targetOrg.id } },
           select: { role: true },
         })
         if (sourceM?.role !== 'OWNER' || targetM?.role !== 'OWNER') {
           // race: 검증 후 강등됨 → forbidden 으로 매핑
           const e: any = new Error('forbidden_race')
           e.__forbiddenRace = FORBIDDEN_RACE
           throw e
         }
         await tx.projectMember.deleteMany({ where: { projectId } })
         return tx.project.update({
           where: { id: projectId },
           data: { orgId: targetOrg.id },
           select: { id: true, orgId: true, name: true, slug: true, createdAt: true },
         })
       })
       return { kind: 'ok', project: { ...updated, orgSlug: targetOrg.slug } }
     } catch (err: any) {
       if (err?.__forbiddenRace === FORBIDDEN_RACE) return { kind: 'forbidden' }
       if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
         const target = err.meta?.target as string[] | string | undefined
         const targetStr = Array.isArray(target) ? target.join(',') : (target ?? '')
         if (targetStr.includes('org_id') && targetStr.includes('slug')) {
           return { kind: 'slug_conflict' }
         }
       }
       throw err
     }
     ```
   - worker 는 위 골격을 따르되 import 정리/타입 캐스팅만 자유롭게 손볼 수 있다.
- **의존**: WU-1 (응답 타입 import).
- **검증 방법**: vitest 단위 테스트 — 6 시나리오: ok / forbidden-source / forbidden-target / not_found(project) / not_found(targetOrg) / slug_conflict / same_org (ProjectMember count 불변 확인). db 는 `vi.mock('@/lib/server/db')` 로 prisma client 의 메서드만 stub. 트랜잭션은 `db.$transaction` 을 array runner / callback 둘 다 mock. P2002 케이스에선 `Prisma.PrismaClientKnownRequestError` 인스턴스 throw.
- **예상 LOC**: ~150 (구현 ~90 + 테스트 ~60)

### WU-3: route handler `POST /api/projects/[projectId]/transfer`
- **수정/생성 파일**:
  - `/Users/choesumin/Desktop/dev/vmc/argos/packages/web/src/app/api/projects/[projectId]/transfer/route.ts` (생성)
- **입력 계약**: `POST /api/projects/:projectId/transfer` body `{ targetOrgSlug: string }` (Bearer JWT).
- **출력 계약**:
  - 200 `{ project: { id, orgId, orgSlug, name, slug, createdAt } }` (same_org 도 200 + 현재 상태 반환).
  - 400 `{ error: { code: 'VALIDATION', ... } }` Zod 실패.
  - 401 `requireAuth` 실패.
  - 403 `{ error: { code: 'FORBIDDEN', message } }` — 출발 또는 대상 OWNER 아님.
  - 404 `{ error: { code: 'NOT_FOUND', message } }` — project 또는 targetOrg 없음.
  - 409 `{ error: { code: 'PROJECT_SLUG_CONFLICT', message: '대상 org 에 같은 이름(slug)의 프로젝트가 이미 있습니다. 한쪽 이름을 먼저 변경한 뒤 다시 시도하세요.' } }`.
- **로직**: `requireAuth` → body parse → `TransferProjectSchema.parse` → `transferProjectForUser` → kind 매핑. 패턴은 `/api/projects/[projectId]/route.ts:42-86` PATCH 그대로 따른다. `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`.
- **의존**: WU-1, WU-2.
- **검증 방법**: 새 route 라이트 단위 테스트는 생략(route 가 매우 얇음). 통합은 QA 시나리오에서 curl/UI 로 검증. 빌드: `pnpm --filter @argos/web build` 가 통과해야 함.
- **예상 LOC**: ~70

### WU-4: `/api/events` 응답 스키마 확장 (self-heal payload)
- **수정/생성 파일**:
  - `/Users/choesumin/Desktop/dev/vmc/argos/packages/web/src/app/api/events/route.ts` (수정)
  - `/Users/choesumin/Desktop/dev/vmc/argos/packages/web/src/app/api/events/route.test.ts` (생성 — 응답 shape 단정용 라이트 테스트, prisma mock)
- **입력 계약**: 변경 없음 (요청 스키마 동일).
- **출력 계약**: success(202) 응답만 확장 — `{ ok: true }` → `{ ok: true, project: { id: string, orgId: string, orgSlug: string } }`. 상태코드 202 유지.
- **응답 적용 범위**:
  - **202 만 self-heal 데이터를 싣는다.** 4xx/404/403 응답은 변경하지 않는다 — 권한이 없는 사용자에게 정답 orgSlug 를 노출하면 정보 누설 위험.
  - 따라서 self-heal 이 작동하려면 **CLI 호출자(JWT user)가 transfer 후 도착 org 의 멤버여야 한다**. clarify 의 "사용자 양쪽 org OWNER 가 transfer 실행" 가정 + ProjectMember 전부 삭제 정책에서, OWNER 자신은 OrgMembership(OWNER) 으로 도착 org 의 멤버이므로 hook 호출 시 정상 202 + self-heal payload 를 받는다 → 성공 기준 6 만족.
  - **비OWNER 팀원의 CLI 는 도착 org 비멤버일 수 있다**(transfer 후 도착 org 가 새로 멤버를 추가해주기 전까지). 이 경우 hook 이 403 → self-heal payload 없음 → stale config 유지. 사용자가 도착 org 에 새로 멤버로 추가된 다음 hook 호출에서 자동 self-heal. 본 task 의 정상 동작이며 별도 처리 불필요. (안내는 도착 org admin 의 운영 책임.)
- **구현**: 기존 `project = db.project.findUnique(...)` 호출의 include 에 `organization: { select: { slug: true, memberships: { where: { userId } } } }` 형태로 slug 추가(기존 memberships select 유지 — 단, `include` 를 `select` 로 바꿔야 할 수도 있음. 코드 확인 후 worker 가 결정). 응답 단계에서 `{ ok: true, project: { id: project.id, orgId: project.orgId, orgSlug: project.organization.slug } }` 반환. 응답 본문 인라인 객체 리터럴이지만 컴파일 타임에 `IngestEventResponse` (WU-1) 타입과 일치하도록 `satisfies IngestEventResponse` 사용.
- **의존**: WU-1 (응답 타입 import — 본 plan 은 WU-4 를 **Group B** 로 배치).
- **검증 방법**: 새 라이트 단위 테스트 2개 — (a) 정상 ingest 시 응답 body 에 `project.orgSlug` 포함, (b) 비멤버(403) 시 응답 body 에 `project` 필드 없음(정보 누설 방지). 기존 events.test.ts(파생 함수) 와 별도 파일.
- **위험**: 응답 body 가 늘어나도 기존 CLI(202 만 보고 버림) 와 무관. 후방 호환 유지.
- **예상 LOC**: ~70 (구현 ~15 + 테스트 ~55)

### WU-5: CLI `event-sender` self-heal 응답 처리
- **수정/생성 파일**:
  - `/Users/choesumin/Desktop/dev/vmc/argos/packages/cli/src/lib/event-sender.ts` (수정)
  - `/Users/choesumin/Desktop/dev/vmc/argos/packages/cli/src/lib/event-sender.test.ts` (생성)
- **입력 계약**: `sendEventBackground(opts: { url, token, payload, projectJsonPath, currentConfig })`.
  - `projectJsonPath` 는 부모가 **`findProjectConfig` 가 발견한 절대 경로** (cwd 가 아니라 traverse 결과). 자식은 이 경로를 그대로 사용.
  - `currentConfig` 는 hook 실행 시점 스냅샷.
  - 시그니처 변경 영향: `deps.events.sendBackground` 사용처(`packages/cli/src/commands/hook.ts:233`) 단 1곳, 함께 수정.
- **출력 계약**: 기존과 동일 void / 부모 즉시 exit 0. 자식이 응답 검증 후 조건 만족 시 `.argos/project.json` 을 atomic 하게 덮어쓴다.
- **구현 방식 — 자식 inline 스크립트**:
  - 헬퍼 분리: `buildSelfHealScript({ tmpFile, projectJsonPath })` 가 inline JS 문자열을 반환. 이 헬퍼는 export 되어 vitest 로 정적 검증.
  - 자식 스크립트가 수행하는 단계 (모두 try/catch 무음, 어떤 실패도 자식 exit 만):
    1. tmp file 읽어 `{url, token, payload, projectJsonPath, currentConfig}` 복원.
    2. `fetch(url, ...)` POST. `AbortSignal.timeout(10000)`.
    3. `if (res.status !== 202) return` — **status 202 만 self-heal 진행** (200/204/4xx/5xx 모두 skip; events route 가 success 시 항상 202 를 반환하는 계약(WU-4) 과 일치).
    4. `body = await res.json()`. JSON shape 검증: `body && body.project && typeof body.project.id === 'string' && typeof body.project.orgId === 'string' && typeof body.project.orgSlug === 'string'`. 미충족 시 skip.
    5. `body.project.id !== currentConfig.projectId` → skip (다른 프로젝트 응답이면 self-heal 금지).
    6. **재읽기**: `latest = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'))`. 동시 hook race 보호.
    7. `latest.projectId !== body.project.id` → skip (이미 다른 프로젝트로 교체됨).
    8. `latest.orgId === body.project.orgId && latest.orgSlug === body.project.orgSlug` → no-op.
    9. **새 config 작성**: 기존 `latest` 의 모든 필드를 보존하면서 `orgId`/`orgSlug`/`orgName?` 만 갱신 (orgName 도 응답에 있으면 갱신, 본 task 응답엔 없으니 변경 안 함). 키 순서 유지.
    10. **Atomic write**: tmp 파일(`projectJsonPath + '.tmp.<pid>.<rand>'`) 에 write → `fs.renameSync(tmp, projectJsonPath)`. 실패 시 tmp 정리.
  - tmp file payload schema: `{ url, token, payload, projectJsonPath, currentConfig }`.
  - 자식 스크립트는 외부 모듈 import 불가하므로 모든 검증을 inline 으로 작성. JSON.stringify 시 키 순서는 `latest` spread 후 부분 갱신이라 유지됨.
  - **ADR-005 보호**: 부모는 변함없이 즉시 exit (self-heal 은 자식에서만).
  - **ADR-006 보호**: 자식의 fetch/parse/read/write 모두 무음, 실패해도 다음 hook 에서 다시 시도.
  - **사용자 알림**: stderr 로그는 `stdio: 'ignore'` 라 안 보임 → 제거. 인지는 `.argos/project.json` 의 git diff 로만. Decision-1.1 참조.
- **의존**: WU-4 (응답에 project 필드 보장).
- **검증 방법**:
  - vitest: `buildSelfHealScript({ tmpFile: '/tmp/x.json', projectJsonPath: '/repo/.argos/project.json' })` 의 출력 문자열이 (a) `projectJsonPath` 리터럴 포함, (b) `body.project.id`/`orgId`/`orgSlug` 검증 분기 포함, (c) `renameSync` 호출 포함, (d) `res.status !== 202` 포함 임을 단정.
  - 통합: QA 시나리오 7번에서 stale config 으로 hook 한 번 → 파일 diff 확인.
- **예상 LOC**: ~120 (헬퍼 + 테스트)

### WU-6: CLI hook command 호출부 정리
- **수정/생성 파일**:
  - `/Users/choesumin/Desktop/dev/vmc/argos/packages/cli/src/commands/hook.ts` (수정 — `deps.events.sendBackground` 호출 시 새 인자 전달)
  - `/Users/choesumin/Desktop/dev/vmc/argos/packages/cli/src/lib/project.ts` (수정 — `findProjectConfig` 가 발견한 절대 경로를 함께 반환하도록 부가 함수 `findProjectConfigWithPath(): { config, configPath } | null` 추가, 기존 함수 시그니처 보존)
  - `/Users/choesumin/Desktop/dev/vmc/argos/packages/cli/src/deps.ts` (수정 — `events.sendBackground` 시그니처 변경, `project.find` 는 그대로 두고 새 `project.findWithPath` 추가)
  - `/Users/choesumin/Desktop/dev/vmc/argos/packages/cli/src/adapters.ts` (수정 — adapter 시그니처 정렬, `findWithPath` 노출)
  - `/Users/choesumin/Desktop/dev/vmc/argos/packages/cli/src/__tests__/hook-command.test.ts` (수정 — mock 시그니처 갱신, self-heal 인자 전달 테스트 1개 추가)
- **입력 계약**: 변경 없음 (hook stdin 동일).
- **출력 계약**: hook 실행 시 `deps.events.sendBackground({ url, token, payload, projectJsonPath, currentConfig })` 호출. `projectJsonPath` 는 `findProjectConfigWithPath` 의 발견 경로(traverse 결과 절대 경로). 발견 못 하면 hook 자체가 일찍 exit (현 동작 유지).
- **의존**: WU-5 (시그니처 정합).
- **검증 방법**: `pnpm --filter @argos/cli test` 통과, `pnpm --filter @argos/cli build` 통과. `hook-command.test.ts` 에 "spawn 호출 시 projectJsonPath 가 적절히 전달됨" mock spy 검증 1개.
- **예상 LOC**: ~70 (project.ts 헬퍼 추가 + adapters/deps + 테스트)

### WU-7: web hooks — `useTransferProject` mutation
- **수정/생성 파일**:
  - `/Users/choesumin/Desktop/dev/vmc/argos/packages/web/src/hooks/use-transfer-project.ts` (생성)
- **입력 계약**: `useTransferProject(orgSlug: string, projectId: string)` → `useMutation` 반환.
- **출력 계약**: `mutateAsync({ targetOrgSlug })` 호출. 성공 시 `queryClient.invalidateQueries({ queryKey: ['orgs'] })` + `['projects', orgSlug]` + `['projects', targetOrgSlug]` + 대시보드 overview/sessions 캐시(키 prefix 매칭) 무효화. ApiError 그대로 throw.
- **의존**: WU-1, WU-3.
- **검증 방법**: 빌드/타입체크. 단위 테스트는 기존 `use-projects.ts` 등이 테스트 없는 패턴이므로 생략.
- **예상 LOC**: ~50

### WU-8: 대시보드 Transfer UI
- **수정/생성 파일**:
  - `/Users/choesumin/Desktop/dev/vmc/argos/packages/web/src/app/dashboard/[orgSlug]/settings/projects/page.tsx` (수정)
- **입력 계약**: 사용자 인터랙션.
- **출력 계약**: 기존 ProjectAccess 페이지 하단(또는 선택된 프로젝트 카드 내부)에 "Transfer Project" 섹션 추가.
  - 대상 org 후보: `useOrgs()` 결과 중 `role === 'OWNER'` 이고 현재 orgSlug 와 다른 항목만 표시.
  - 선택된 프로젝트가 없거나 후보 org 가 0 개면 disabled 안내문.
  - 실행: confirm dialog ("이 프로젝트를 <대상 org name> 으로 이동합니다. 모든 ProjectMember 가 제거되고, 대상 org 에서 멤버를 다시 부여해야 합니다. 계속하시겠습니까?") → `useTransferProject` 호출.
  - 응답 처리:
    - 200: 성공 토스트 + 새 org 의 settings 페이지로 라우트(`router.push(\`/dashboard/${response.project.orgSlug}/settings/projects\`)`).
    - 409 PROJECT_SLUG_CONFLICT: Alert 로 안내.
    - 403/404: 일반 에러 토스트.
- **현재 페이지 권한 분기 유지**: 페이지는 OWNER/MANAGER 만 진입 가능하지만 transfer 섹션 자체는 OWNER 일 때만 노출(현재 role 체크 추가).
- **의존**: WU-7.
- **검증 방법**: 빌드, 수동 QA (아래 QA 시나리오).
- **예상 LOC**: ~150

## 병렬 실행 그룹

- **Group A (서로 독립, 병렬 가능)**:
  - WU-1 (shared 타입/스키마)
  - WU-5 (CLI `event-sender` 자체 + `buildSelfHealScript` 헬퍼/테스트; 외부 타입 import 없음)
- **Group B (Group A 후)**:
  - WU-2 (server action; WU-1 타입 사용)
  - WU-4 (`/api/events` 응답 확장; WU-1 의 `IngestEventResponse` 타입 import + satisfies)
  - WU-6 (CLI hook + project.ts 헬퍼 + deps + adapters; WU-5 의 새 시그니처 사용)
- **Group C (Group B 후)**:
  - WU-3 (route handler; WU-2 + WU-1)
  - WU-7 (web mutation hook; WU-1 + WU-3 의 응답 모양 가정)
- **Group D (Group C 후)**:
  - WU-8 (UI; WU-7)

### 파일 충돌 검증
- Group A: `shared/.../project.ts` (WU-1) vs `cli/.../event-sender.ts` (WU-5) — 다른 패키지. 충돌 없음.
- Group B: `web/.../project-actions.ts` (WU-2) vs `web/.../api/events/route.ts` (WU-4) vs `cli/.../hook.ts`/`lib/project.ts`/`deps.ts`/`adapters.ts`/`hook-command.test.ts` (WU-6) — 모두 다른 파일. 충돌 없음.
- Group C: `web/.../api/projects/[projectId]/transfer/route.ts` 신규 (WU-3) vs `web/src/hooks/use-transfer-project.ts` 신규 (WU-7) — 다른 파일.
- Group D: `web/.../settings/projects/page.tsx` 단일 — 단독.

## Negative Space 재확인

다음은 **만지지 말 것** (context.md 의 Negative Space 와 일치):

- audit log 테이블/엔드포인트 추가 금지.
- 알림 (이메일/슬랙/in-app) 금지.
- undo/롤백 전용 명령 금지.
- in-flight 이벤트 큐/격리 로직 금지.
- `packages/cli/src/commands/transfer.ts` 같은 CLI 신규 명령어 추가 금지 (이번 task 는 CLI self-heal 만).
- 자동 rename / suffix 로직 금지 — 충돌 시 409 만.
- `ClaudeSession`/`Event`/`UsageRecord`/`Message`/`DailyProjectStat` 의 `projectId` 또는 별도 컬럼 마이그레이션 금지.
- `packages/web/src/app/api/orgs/[orgSlug]/projects/route.ts` 의 "신규 프로젝트에 모든 org 멤버 자동 추가" 로직을 transfer 도착 org 에 대해 재실행 금지.
- prisma schema (DB 모델) 변경 금지 — 이번 task 는 데이터만 변경. (문서 schema/타입 schema 는 가능.)

## 검증 시나리오 (Evaluate 단계 입력용)

### 자동 검증
- `pnpm --filter @argos/shared build` (WU-1).
- `pnpm --filter @argos/web build` (WU-2/3/4/7/8 컴파일).
- `pnpm --filter @argos/web test` — `project-actions.test.ts` 5 시나리오(ok, forbidden-source, forbidden-target, not_found, slug_conflict, same_org) 통과.
- `pnpm --filter @argos/cli build`.
- `pnpm --filter @argos/cli test` — `event-sender.test.ts` (스크립트 generation), `hook-command.test.ts` (mock 시그니처).
- 루트 `pnpm typecheck` 또는 `pnpm build` 통과.

### QA 시나리오 (앱 띄우기 — `pnpm dev`)

**준비**: 두 개의 org (orgA, orgB) 와 같은 사용자가 양쪽 OWNER. orgA 에 프로젝트 P1 (slug=`demo`) 존재. 로컬 저장소에 `.argos/project.json` 이 P1/orgA 로 기록됨.

1. **happy path**: orgA settings/projects 진입 → P1 선택 → "Transfer to other org" 섹션에서 orgB 선택 → confirm → 200. 라우트가 `/dashboard/orgB/settings/projects` 로 바뀌고, P1 이 orgB 의 프로젝트 리스트에 보임. orgA 리스트에서는 사라짐. P1 의 ProjectMember 는 0건(DB 직접 확인 또는 access UI 로 확인).
2. **slug 충돌**: orgB 에 미리 slug=`demo` 프로젝트 P2 생성 후 transfer 재시도 → 409 + 안내 메시지 Alert. DB 상태 변동 없음(P1.orgId 그대로 orgA).
3. **권한 거부 — 출발 OWNER 아님**: orgA 에서 사용자를 MEMBER 로 강등 후 transfer 시도 → 403 + Toast/Alert. orgId 불변.
4. **권한 거부 — 대상 OWNER 아님**: orgB 에서 사용자가 MEMBER 일 때 transfer 시도 → 403. 불변.
5. **same_org**: orgA → orgA 호출 (직접 curl, UI 에선 노출 안 됨) → 200 + 동일 project 응답. 부수효과 없음.
6. **자식 데이터 보존**: 1번 직후 orgB 대시보드에서 P1 의 sessions/usage/messages 가 그대로 조회됨.
7. **CLI self-heal**: 1번 직후 로컬 `.argos/project.json` 의 `orgId`/`orgSlug` 는 여전히 orgA. 저장소에서 Claude Code 로 아무 prompt 한 번 실행(hook trigger). 잠시 후 `.argos/project.json` 을 cat → orgB 의 id/slug 로 갱신됨. `git diff .argos/project.json` 에 변경 표시.
8. **CLI Flow 4 검증**: self-heal 직후 `argos` 재실행 → `ensureMembership` 이 orgB 슬러그로 호출되어 정상 종료(에러 없음).
9. **이전 버전 호환**: stale `.argos/project.json` 을 가진 v0.1.13 미만 CLI(가짜 시뮬: response 의 새 필드를 무시하는 코드 경로) 가 hook 한 번 호출 → 서버 응답 202 + project 필드, CLI 가 무시 → exit 0. 사고 없음.
10. **CLI 사용자가 도착 org 비멤버**: orgA 에 사용자 U1(OWNER) 와 U2(MEMBER, ProjectMember 등록) 가 있고 P1 사용. U1 이 P1 을 orgB(U1 만 OWNER) 로 transfer. U2 의 CLI 가 hook 호출 → 도착 org 비멤버로 403, self-heal payload 없음, U2 의 `.argos/project.json` 은 stale 유지(예상). 이후 admin 이 U2 를 orgB 멤버로 추가 → 다음 hook 호출에서 202 + self-heal payload → U2 의 config 도 갱신.
11. **403 응답에 정답 orgSlug 누설 없음**: 위 10번에서 403 응답 body 에 `project` 필드가 없는지 확인 (정보 누설 방지).

### 회귀 체크
- 기존 `/api/events` 호출 (curl) 의 응답이 `{ ok: true, project: {...} }` 로 늘어남. `ok: true` 자체는 그대로라 기존 클라이언트는 무영향.
- 기존 `PATCH /api/projects/:id` 동작 변경 없음.

## Decision Log

- **Decision-1: Transfer 액션은 `POST /api/projects/[projectId]/transfer` 신규 라우트로 분리**
  - 컨텍스트: PATCH 의 필드 확장으로도 가능하지만 transfer 는 ProjectMember 전부 삭제 + 양쪽 org OWNER 검증 + slug 충돌 처리를 포함.
  - 대안과 거절 사유: PATCH 확장은 (a) PATCH 의 의미와 어긋나고 (b) 클라이언트가 실수로 orgId 만 바꾸는 오용 가능성. 즉시 거절.
  - 트레이드오프: 라우트 1개 추가. UI/CLI 모두 신규 액션을 명확히 호출.
  - 태그: `area:api`, `library:next-app-router`, `domain:project-transfer`

- **Decision-2: CLI self-heal 채널은 `/api/events` 응답 확장**
  - 컨텍스트: CLI 가 stale `.argos/project.json` 을 자동 갱신해야 함. hook 가 매번 events 를 친다.
  - 대안과 거절 사유:
    - 별도 `GET /api/projects/:id/lookup`: 신규 round-trip 1회 추가 → 모든 hook 마다 fetch 두 번. ADR-006(fire-and-forget) 위배는 아니지만 detached 자식 fetch 가 두 개로 늘어 race 처리 복잡. 또 권한 체크 코드 중복(events 와 동일).
    - hook 응답 무시: 본 task 의 핵심 요구(자동 self-heal) 미달성.
    - events 응답 확장: 추가 round-trip 0, 권한 체크 1회로 충분, 응답 superset 이라 구버전 호환.
  - 트레이드오프: events route 응답 shape 변경 — 단, superset 이라 호환. default 커맨드(Flow 4) self-heal 은 후속 task 로 연기.
  - 태그: `area:api`, `area:cli`, `library:nextjs`, `protocol:json`

- **Decision-3: slug 충돌 시 응답 형태**
  - 결정: 409 + `{ error: { code: 'PROJECT_SLUG_CONFLICT', message: '대상 org 에 같은 이름(slug)의 프로젝트가 이미 있습니다. 한쪽 이름을 먼저 변경한 뒤 다시 시도하세요.' } }`. 어떤 데이터도 변경되지 않음.
  - 컨텍스트: `(orgId, slug)` unique. 자동 rename 비범위.
  - 대안과 거절 사유: 자동 suffix(`-2` 등) — 비범위. 422 — 기존 PROJECT_NAME_CONFLICT 가 409 라 일관성 위해 409.
  - 트레이드오프: 사용자가 한 번 더 액션(이름 변경) 필요. 단순/안전.
  - 태그: `area:api`, `protocol:http-status`

- **Decision-4: ProjectMember 삭제와 Project.orgId 갱신은 단일 `db.$transaction` + 트랜잭션 내 권한 재검증**
  - 컨텍스트: 부분 실패 시 권한 누수 위험(예: orgId 만 바뀌고 ProjectMember 가 남아 신 org 외부인이 접근). 또 트랜잭션 밖 권한 검증과 트랜잭션 사이의 race(강등) 도 막아야 함.
  - 대안과 거절 사유: 별도 호출 — 부분 실패 시 데이터 불일치. 즉시 거절. 트랜잭션 밖 단일 검증 — 강등 race 허용. 거절.
  - 트레이드오프: 트랜잭션 중 P2002 catch → `err.meta?.target` 검사하여 `(orgId, slug)` 인덱스 위반만 `slug_conflict` 로 매핑(다른 unique 위반은 throw). 트랜잭션 내 OrgMembership 재SELECT 로 약간의 중복 쿼리.
  - 태그: `library:prisma`, `area:db`, `pattern:transaction`, `pattern:double-check`

- **Decision-4.1: same_org 호출은 트랜잭션 자체를 skip**
  - 컨텍스트: 출발 == 대상이면 ProjectMember 를 보존하는 게 직관적(사용자 의도가 "이동 없음"이므로 멤버 wipe 는 부적절).
  - 대안과 거절 사유: 그래도 transaction 진행 + ProjectMember 삭제 → 사용자가 의도치 않게 멤버 잃음. 거절.
  - 트레이드오프: 라우트는 동일 200 응답을 보내지만 부수효과는 0. 단위 테스트로 ProjectMember count 불변 보장.
  - 태그: `area:server`, `pattern:idempotent-noop`

- **Decision-5: 권한 체크는 server action(`transferProjectForUser`) 안**
  - 컨텍스트: 기존 `getProjectForUser`/`updateProjectForUser` 와 동일 `kind` 결과 패턴.
  - 대안과 거절 사유: route handler 안에서 검증 — 라우트가 두꺼워지고 단위 테스트가 어려움.
  - 트레이드오프: kind 종류 늘어남(forbidden / not_found / slug_conflict / same_org / ok).
  - 태그: `area:server`, `pattern:result-kind`, `language:typescript`

- **Decision-6: events 응답 확장은 후방 호환 superset**
  - 컨텍스트: 구버전 CLI 도 다수 있을 수 있음.
  - 대안과 거절 사유: 응답 shape 자체 교체 — 구버전 깨짐. 거절.
  - 트레이드오프: 응답 본문 약간 커짐(~150 bytes) — 무시 가능.
  - 태그: `area:api`, `compat:backward`

- **Decision-7: CLI 자식 스크립트 inline 확장 (별도 자식 파일 분리 안 함)**
  - 컨텍스트: `event-sender` 자식은 `process.execPath -e <inline>` 로 실행되어 외부 모듈 import 불가.
  - 대안과 거절 사유: 별도 `.js` 파일로 분리 — (a) tsup 번들 산출물 경로(`dist/event-sender-child.js`) 를 npm publish 시 포함하도록 빌드 설정 변경, (b) 패키지 최종 사용자가 글로벌 install 한 경우와 npx 실행 시 모두 자식 파일 위치를 안정적으로 resolve(`fileURLToPath(import.meta.url)`) 해야 함, (c) bundler tree-shaking 으로 자식 파일이 누락될 위험. 본 task 범위 초과.
  - 트레이드오프: inline 스크립트가 길어짐(~50줄). `buildSelfHealScript` 헬퍼로 분리해 단위 테스트 가능.
  - 태그: `area:cli`, `pattern:detached-child`, `constraint:no-imports`

- **Decision-8: self-heal payload 는 202 응답에만 포함 (4xx 응답 변경 없음)**
  - 컨텍스트: transfer 후 CLI 호출자가 도착 org 비멤버이면 events 가 403 을 반환. 4xx 에 정답 orgSlug 를 실으면 정보 누설.
  - 대안과 거절 사유:
    - 403 에도 정답 orgSlug hint 를 실음: 비멤버에게 org 식별자 노출 → privacy/누설 위험. 거절.
    - 별도 lookup endpoint 로 인증 없이 orgSlug 만 노출: privacy 동일 문제. 거절.
  - 트레이드오프: 도착 org 비멤버 사용자(transfer 후 멤버 추가 전)의 stale config 가 일시적으로 유지됨. admin 이 도착 org 에 멤버 추가 후 다음 hook 에서 자동 self-heal. 본 task 의 정상 동작.
  - 태그: `area:api`, `security:no-leak`, `pattern:eventual-self-heal`

- **Decision-1.1: self-heal 발생 시 사용자 알림은 git diff 만**
  - 컨텍스트: hook 자식은 `stdio: 'ignore'` 로 detached → stderr 출력이 사용자에게 보이지 않는다.
  - 대안과 거절 사유: stderr pipe 로 변경 → hook 의 detached/즉시 exit 정신(ADR-005) 을 흐리고 부모가 자식 출력을 기다리지 않도록 추가 처리 필요. 본 task 범위 초과. 별도 알림 채널은 비범위.
  - 트레이드오프: 사용자가 "왜 .argos/project.json 이 바뀌었지?" 의문 가질 수 있음. 다음 task 또는 릴리즈 노트로 안내 보강.
  - 태그: `area:cli`, `ux:diff-only-notify`

## 위험 요소

- **R1: `.argos/project.json` 자동 변경에 사용자 혼란**. CLI 가 조용히 파일을 수정 → git diff 에 떠서 "왜 바뀌었지?" 의문. 완화: 파일 옆 README 나 다음 task 의 CLI 안내 로그(현재는 hook detached 라 stdout 가 안 보임). 본 task 에서는 ADR 추가로 의도 기록.
- **R2: 대시보드 캐시 invalidation 누락**. `useTransferProject` 가 `['orgs']`/`['projects', orgSlug]` 만 무효화하면 dashboard overview/sessions/agents 등 다른 query 가 stale. 완화: WU-7 에서 `queryClient.invalidateQueries()` 를 keyless 로 호출하거나 prefix 매칭으로 광범위 무효화.
- **R3: 구버전 CLI 호환성**. `/api/events` 응답이 늘어나는 건 superset 이라 서버 호환성은 안전하지만, fetch 응답을 `.catch(()=>{})` 로 버리는 v0.1.x CLI 는 self-heal 자체가 동작하지 않음 → 사용자가 CLI 를 self-heal 지원 버전으로 업데이트 하기 전까지 transfer 후에도 stale config 유지. 완화: 릴리즈 노트에 "transfer 사용 시 CLI 업데이트 필수" 명시. (다음 hook 호출에서 자연 self-heal 되는 건 새 CLI 버전 한정.)
- **R4: P2002 가 transfer 외 다른 unique 제약(예: ProjectMember 의 PK)에 트리거될 가능성**. 완화: `(orgId, slug)` 외 unique 가 트랜잭션 안에 없는지 점검. ProjectMember `@@id([projectId, userId])` 는 `deleteMany` 만 하므로 트리거 안 됨.

## Critique Reflection

### Round 1 (codex)

- **M1 병렬 그룹 → 반영**: WU-4 를 Group A → Group B 로 이동. WU-1 타입 import 보장.
- **M2 self-heal 파일 경로 → 반영**: WU-5/6 가 cwd 가 아니라 `findProjectConfig` traverse 결과 절대 경로(`projectJsonPath`) 를 자식에 전달. `findProjectConfigWithPath` 헬퍼 추가.
- **M3 race / atomicity → 반영**: WU-5 자식 스크립트가 (a) 응답 status check, (b) JSON shape guard, (c) `body.project.id` 일치 확인, (d) 파일 재읽기 + projectId 재확인, (e) tmp + rename atomic write 5 단계 모두 수행하도록 명세.
- **M4 권한 트랜잭션 race → 반영**: WU-2 트랜잭션 내 OrgMembership 재SELECT 추가. Decision-4 보강.
- **M5 P2002 over-mapping → 반영**: WU-2 가 `err.meta?.target` 검사 후에만 slug_conflict 매핑, 그 외엔 throw. Decision-4 보강.
- **M6 same_org 계약 → 반영**: WU-2 의 same_org 가 트랜잭션 자체 skip + 현재 project 반환 + ProjectMember 보존을 명시. 단위 테스트 항목 추가. Decision-4.1 신설.
- **M7 자동 검증 약함 → 반영**: WU-4 에 응답 shape 단정 라이트 테스트 1개 추가. WU-5 의 `buildSelfHealScript` 정적 검증으로 self-heal happy path 자동화.
- **M8 Decision Log 근거 → 반영**: Decision-2 에 lookup endpoint 거절 이유 보강(round-trip, 권한 중복, race), Decision-7 에 inline 선택 이유 보강(번들/publish 경로).
- **m1 zod regex → 반영**: WU-1 의 `TransferProjectSchema` 가 trim + slug regex.
- **m2 createdAt 타입 → 반영**: WU-1 응답 타입의 createdAt 을 string 으로 통일.
- **m3 stderr 로그 → 반영**: WU-5 에서 stderr 로그 제거 + Decision-1.1 신설(git diff 만 알림).
- **m4 prisma schema 표현 → 반영**: Negative Space 항목 재표현.
- **m5 구버전 CLI 표현 → 반영**: R3 정확화.

### Round 2 (codex)

- **M1 self-heal payload 응답 범위 → 반영**: WU-4 의 응답 적용 범위 명시. 202 만 self-heal payload, 4xx 는 변경 없음. Decision-8 신설(no-leak). QA 시나리오 10/11 추가(비멤버 stale 유지 + 누설 방지 검증).
- **M2 트랜잭션 형태 → 반영**: WU-2 가 callback form 으로 고정. race 재검증 실패는 sentinel error(`__forbiddenRace = Symbol`)로 throw → 바깥 catch 가 `kind: 'forbidden'` 매핑. 코드 골격을 plan 에 직접 명시.
- **M3 status 계약 → 반영**: WU-5 자식 스크립트가 `res.status !== 202` 만 통과(2xx 일괄 허용 X). 검증 단정도 `res.status !== 202` 로 일치.

종료 사유: critical 0, major 0 (전 라운드의 모든 major 명시 반영). plan v3 가 implement worker fan-out 에 충분히 명확. **루프 종료** (라운드 2 후).
