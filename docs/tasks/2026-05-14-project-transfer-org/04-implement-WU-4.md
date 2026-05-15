# Implement — WU-4

## 변경 요약

`/api/events` route 의 `db.project.findUnique` 쿼리를 `include` → `select` 로 전환하고 `organization.slug` 필드를 추가로 조회하도록 수정했다. 202 성공 응답을 기존 `{ ok: true }` 에서 `{ ok: true, project: { id, orgId, orgSlug } }` superset 으로 확장하고, 인라인 객체 리터럴에 `satisfies IngestEventResponse` 를 붙여 컴파일 타임 타입 일치를 보장했다. 4xx 응답(404, 403) 은 변경하지 않아 정답 orgSlug 의 정보 누설 위험을 차단했다. WU-1 이 이미 정의한 `IngestEventResponse` 타입을 import 해서 사용했다.

## 변경 파일

- `packages/web/src/app/api/events/route.ts` (수정, +10 lines net)
- `packages/web/src/app/api/events/route.test.ts` (신규, ~100 lines)

## 검증 결과

- `pnpm --filter @argos/web test` → 61 tests pass (기존 59 + 신규 2)
- TypeScript: `events/route.ts`, `events/route.test.ts` 에 타입 오류 없음 (`tsc --noEmit` 에서 해당 파일 오류 0건; 나머지 오류는 WU-2 등 타 worker 영역의 기존/진행 중 변경사항)

## 잠재 이슈 / 후속 메모

- `after()` callback 내의 stop 처리(`claudeSession.update`, `usageRecord.create` 등) 는 `payload.projectId` 를 직접 참조하므로 `project` select 범위 축소와 무관 — 안전.
- WU-5 CLI self-heal 스크립트가 `res.status !== 202` 체크 후 `body.project.id` / `orgId` / `orgSlug` 를 소비하는 계약과 일치 확인.
