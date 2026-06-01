# Implement — WU-2

## 변경 요약

`packages/web/src/lib/server/project-actions.ts` 에 `transferProjectForUser` 함수를 추가했다. 함수는 plan 에 명시된 로직 순서(1차 권한/존재 검증 → same_org 조기 반환 → `db.$transaction` callback form 실행)를 그대로 따른다. 트랜잭션 내에서 OrgMembership 재검증(race 보호), `projectMember.deleteMany`, `project.update({ orgId })` 를 순서대로 실행하며, callback 에서 throw 된 `forbidden_race` sentinel 에러와 P2002(`(org_id, slug)` 인덱스만) 를 `catch` 블록에서 각각 `kind: 'forbidden'` / `kind: 'slug_conflict'` 로 매핑하고 그 외 에러는 re-throw 한다. `Prisma` 네임스페이스는 `@prisma/client` 에서 직접 import 했으며, Prisma 클라이언트가 미재생성 상태였기에 `prisma generate` 도 실행했다. 단위 테스트 11개(ok, not_found×2, forbidden×3, slug_conflict×2, P2002 non-target re-throw, same_org, forbidden_race)를 생성했다.

## 변경 파일

- `/Users/choesumin/Desktop/dev/vmc/argos/packages/web/src/lib/server/project-actions.ts` (수정, +120 lines)
- `/Users/choesumin/Desktop/dev/vmc/argos/packages/web/src/lib/server/project-actions.test.ts` (신규, ~230 lines)

## 검증 결과

- `pnpm --filter @argos/web test` → 7 test files, 72 tests passed (신규 11개 포함)
- `pnpm exec tsc --noEmit` (web 패키지) → 에러 없음 (Prisma client 재생성 후)

## 잠재 이슈 / 후속 메모

- Prisma client 가 `ProjectMember` 모델을 포함하지 않은 상태였음. `prisma generate` 를 실행해 재생성했으며, 다른 WU 의 `projectMember` 관련 타입 오류도 이 재생성으로 해소됨.
- `orgMembership` unique 제약이 `@@unique([userId, orgId])` 이므로 Prisma 가 `userId_orgId` compound 키를 자동 생성 — plan 의 트랜잭션 골격에서 사용된 `findUnique({ where: { userId_orgId: { userId, orgId } } })` 가 정상 동작함.
- 트랜잭션 내 `tx.orgMembership` 을 사용하므로 강등 race 가 안전하게 처리됨.
