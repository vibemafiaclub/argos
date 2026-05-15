# 코드 리뷰 — project-transfer-org 변경분 (task:2026-05-14-project-transfer-org)

## 개요

- **신규 API**: `POST /api/projects/[projectId]/transfer`(ADR-013) + server action `transferProjectForUser`.
- **CLI self-heal**: `/api/events` 응답을 `{ ok, project: { id, orgId, orgSlug } }` superset으로 확장(ADR-014/020). CLI는 detached 자식에서 `.argos/project.json`을 atomic rewrite.
- **UI**: org settings → projects 페이지에 OWNER 한정 `Transfer Project` 카드.
- **테스트**: `project-actions.test.ts`(384줄, 7 시나리오 + race), `route.test.ts`(202 payload + 403 no-leak), `event-sender.test.ts`(self-heal script 단정).

ADR-013~022의 결정이 코드에 대체로 충실히 반영됨. 단, **두 가지 실제 이슈**와 몇 가지 정리 사항이 있음.

---

## ADR 일관성 점검

| ADR | 핵심 결정 | 구현 | 비고 |
| --- | --- | --- | --- |
| 013 | 별도 `POST .../transfer` 라우트 | ✅ `app/api/projects/[projectId]/transfer/route.ts` | route는 auth+parse+kind→HTTP 매핑만 (얇음) |
| 014 | `/api/events` 응답에 `{ project }` superset 포함 | ✅ `route.ts:198-208` | `select`로 fetch한 `id/orgId/organization.slug` 사용 |
| 015 | 409 + `PROJECT_SLUG_CONFLICT`, 자동 rename 없음 | ✅ `route.ts:39-49` | 메시지 본문이 ADR 정의와 글자 단위로 동일 |
| 016 | 단일 `$transaction`(callback) + 내부 OWNER 재SELECT | ✅ `project-actions.ts:298-322` | `FORBIDDEN_RACE = Symbol(...)` 매 호출마다 새 심볼이라 identity 매칭 정확 |
| 017 | same_org는 트랜잭션 skip, ProjectMember 보존 | ✅ `project-actions.ts:269-282` | 테스트도 `$transaction.not.toHaveBeenCalled()` 단정 |
| 018 | 권한 체크는 server action 내부 + kind 유니온 | ✅ `not_found / forbidden / slug_conflict / same_org / ok` 5종 | 라우트 매핑과 1:1 |
| 019 | self-heal payload는 202에만, 4xx 변경 없음 | ✅ `route.ts:52-61` 403 응답에 `project` 키 없음 | 테스트 (b)가 명시적으로 단정 |
| 020 | superset 확장(구버전 후방 호환) | ✅ `ok:true` 그대로 유지하고 `project` 만 추가 | — |
| 021 | self-heal 자식 inline 스크립트 + `buildSelfHealScript` 헬퍼 | ✅ `event-sender.ts:48-105` | 단위 테스트 14개로 정적 검증 |
| 022 | self-heal 알림은 git diff만 (stderr/별도 알림 없음) | ✅ 자식 `stdio:'ignore'`, 추가 알림 없음 | — |

ADR 일관성에 **모순 없음**. 다만 ADR-016에 명시된 P2002 매핑이 운영 환경에서 의도대로 작동하지 않을 위험이 아래 (Issue 1)에 있음.

---

## Issue 1 — P2002 `meta.target` 매칭이 실제 Prisma 6 출력과 어긋날 가능성 (중대)

`packages/web/src/lib/server/project-actions.ts:335-345`

```ts
const target = err.meta?.target as string[] | string | undefined
const targetStr = Array.isArray(target) ? target.join(',') : (target ?? '')
if (targetStr.includes('org_id') && targetStr.includes('slug')) {
  return { kind: 'slug_conflict' }
}
```

문제는 substring 키워드가 **DB 컬럼명 스타일 (`org_id`) 한 가지만** 가정한다는 것:

- Prisma 6 + PostgreSQL에서 `P2002.meta.target`은 통상 **(a) 모델 field 이름 배열** `['orgId','slug']` 또는 **(b) 인덱스/제약 이름 문자열** 둘 중 하나로 옴.
- 마이그레이션을 확인하면 (`20260414160229_init`):
  ```sql
  CREATE UNIQUE INDEX "projects_orgId_slug_key" ON "projects"("orgId","slug")
  ```
  이후 `rename_columns_to_snake_case` 마이그레이션은 **컬럼만** rename 하고 인덱스 이름은 그대로 `projects_orgId_slug_key`로 남아 있음. 즉 어떤 형태로 오든 문자열에 등장하는 건 **`orgId`** (camelCase) 이지 `org_id`가 아님.
- 결과: 운영 환경에서 slug 충돌 발생 시 `org_id` substring이 매칭 실패 → re-throw → 500 Internal Server Error (의도: 409 + `PROJECT_SLUG_CONFLICT`).
- 테스트가 `target: ['org_id','slug']`로 mock해서 통과한 거라 회귀가 안 잡힘 — 실제 Prisma 출력과 동기화되지 않은 mock.

**제안**:
```ts
const targetStr = Array.isArray(target) ? target.join(',').toLowerCase() : (target ?? '').toLowerCase()
if ((targetStr.includes('orgid') || targetStr.includes('org_id')) && targetStr.includes('slug')) {
  return { kind: 'slug_conflict' }
}
```
또는 더 안전하게: 기존 `updateProjectForUser`의 `PROJECT_NAME_CONFLICT` 패턴처럼 트랜잭션 진입 직전 `findFirst({ where: { orgId: targetOrg.id, slug: project.slug } })` 사전 체크로 분기. (트랜잭션 내 race는 P2002 catch가 fallback.)
테스트도 실제 Prisma가 반환할 법한 케이스(`['orgId','slug']`, `'projects_orgId_slug_key'`)를 추가해야 함.

---

## Issue 2 — `sendEventBackground` 레거시 positional 오버로드는 dead code

`packages/cli/src/lib/event-sender.ts:124-128`, `adapters.ts:114`

`adapters.ts`가 이미 opts form으로만 호출(`(opts) => sendEventBackground(opts)`)하므로:
- 오버로드 시그니처, 분기(`typeof optsOrUrl === 'string'`), legacy 스크립트 fallback 모두 도달 불가.
- 주석에 "kept for backward compatibility until WU-6 updates deps.ts/adapters.ts" — WU-6은 이미 끝남.
- 시스템 가이드의 "backwards-compatibility hacks 금지"에 정확히 해당.

**제안**: 오버로드 2종 + `if (projectJsonPath && currentConfig) { ... } else { legacy }` 분기 모두 삭제하고 단일 `sendEventBackground(opts: SendEventBackgroundOpts)` 형태로 정리.

---

## 소소한 개선점

1. **`route.ts:60` createdAt 방어 캐스팅 over-defense**
   ```ts
   project.createdAt instanceof Date ? project.createdAt.toISOString() : project.createdAt
   ```
   `ProjectDetail.createdAt: Date`로 타입 보장됨 — `project.createdAt.toISOString()` 한 줄로 충분.

2. **`page.tsx:259` `transferSuccess` flash**
   성공 직후 `setTransferSuccess(...)` → 즉시 `router.push(...)`. 라우팅이 빨라서 사용자가 메시지를 못 봄. `router.push` 만으로 충분하거나, 대상 페이지에서 `?transferred=...` query로 토스트 노출하는 패턴이 더 맞음. (현재로선 `transferSuccess` state는 dead state에 가까움.)

3. **`page.tsx:226` `window.confirm`**
   다른 destructive 액션이 `AlertDialog`를 쓰는지 확인 필요(`ui-design-system` skill 가이드와 일치 여부). 다이얼로그가 표준이면 그쪽에 맞춰야 함.

4. **`event-sender.ts:84-86` `atomicTmp` 충돌**
   `${projectJsonPath}.tmp.${pid}.${random}` 형태로 동일 dir에 만들어 `renameSync`가 cross-fs EXDEV 안 만남(✅). 다만 race 시 unlink가 또 다른 pid가 만든 tmp를 건드릴 가능성은 없음(suffix가 random) — 안전.

5. **`useTransferProject.ts:32` `['dashboard']` prefix 무효화**
   대상 org 도착 후 `'dashboard'` query key prefix가 실제로 둘 다 커버하는지 확인 필요. 다른 hook들이 `['dashboard', orgSlug, ...]` 형태인지 검토.

6. **`TransferProjectSchema`(`schemas/project.ts:16`) 단위 테스트 없음**
   slug 정규식/trim/min 검증을 vitest로 한두 줄만 추가하면 회귀 안전.

7. **`project-actions.ts:289` race 매핑 메커니즘**
   `Object.assign(new Error('forbidden_race'), { __forbiddenRace: FORBIDDEN_RACE })`는 작동하지만, callback에서 `return { kind: 'forbidden' as const }` 한 뒤 outer에서 그대로 reuturn하는 패턴이 더 단순. 트랜잭션 rollback이 필요하다는 점만 보존하면 됨 — `if (...) { return ... }` 대신 `throw`가 필요한 이유는 partial-write rollback인데, 이 시점에는 아직 `deleteMany`/`update`가 안 일어났으므로 정상 return 도 안전. 다만 코드 흐름상 일관성 차원에선 현 구조가 더 명시적이라 trade-off는 있음.

---

## 보안 / 권한

- 라우트 외부에 `requireAuth` ✅, server action 내부에서 출발+대상 OWNER 더블체크 ✅, 트랜잭션 내 재SELECT로 race 방지 ✅.
- ADR-019 (4xx self-heal payload 누설 금지) — `/api/events`의 404/403 응답 본문에 `project` 키 없는 것 코드 + 테스트로 확인.
- UI는 `role === 'OWNER'` gating 1중, 서버는 양쪽 OWNER 2중 — 좋음.
- CSRF: 베어러 토큰 기반(타 라우트와 동일 정책). 추가 보강 필요 없음.

---

## 테스트 커버리지

- `transferProjectForUser`: 7 시나리오 + race 1 = 잘 커버됨. **단** P2002 mock이 실제 Prisma 출력 shape과 다른 가능성(위 Issue 1) — 실 환경 형태 추가 권장.
- `/api/events`: 202/403 두 케이스. 404 케이스 추가 권장 (no-leak 일관성).
- `buildSelfHealScript`: 14 시나리오로 인라인 문자열을 정적 검증 — script 형태 단위로 strong하지만, 실제 자식 프로세스 실행 e2e는 없음. 본 task 범위로는 적정.
- `hook-command.test.ts`: `sendBackground`에 `projectJsonPath`/`currentConfig` 전달 단정 추가 ✅.

---

## 결론

ADR-013~022와의 일관성은 양호. 머지 전에 **Issue 1(P2002 매칭)** 는 운영 시 실 충돌 케이스에서 500을 띄울 위험이 있어 반드시 수정 권장. **Issue 2(레거시 오버로드)** 는 컨벤션 정리. 나머지는 폴리시.
