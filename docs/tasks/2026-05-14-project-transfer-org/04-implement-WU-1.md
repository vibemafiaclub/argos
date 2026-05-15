# Implement — WU-1

## 변경 요약

`@argos/shared` 패키지에 project transfer 기능에 필요한 3가지 타입/스키마를 추가했다.
- `schemas/project.ts`: `TransferProjectSchema` — `targetOrgSlug` 필드를 `trim().min(1).regex(/^[a-z0-9-]+$/)` 로 검증. org slug regex 와 동일 패턴(`UpdateOrgSchema` 참조).
- `types/project.ts`: `TransferProjectResponse` — transfer 성공 응답 와이어 타입. `createdAt` 을 `string` 으로 명시해 서버 내부 `Date` 와 분리.
- `types/events.ts`: `IngestEventResponse` — `{ ok: true, project: { id, orgId, orgSlug } }`. 기존 `{ ok: true }` 의 superset 이라 구버전 클라이언트와 호환.

## 변경 파일

- `/Users/choesumin/Desktop/dev/vmc/argos/packages/shared/src/schemas/project.ts` (수정, +4 lines)
- `/Users/choesumin/Desktop/dev/vmc/argos/packages/shared/src/types/project.ts` (수정, +10 lines)
- `/Users/choesumin/Desktop/dev/vmc/argos/packages/shared/src/types/events.ts` (수정, +8 lines)

## 검증 결과

- `pnpm --filter @argos/shared build` → pass (tsc, 출력 없음)
- `pnpm --filter @argos/shared test` → 테스트 파일 없음, skip (plan 예상과 일치)
- `tsc --noEmit` (shared 패키지) → pass (오류 없음)

## 잠재 이슈 / 후속 메모

- `IngestEventResponse` 는 WU-4 에서 `satisfies` 키워드로 사용되므로, WU-4 worker 가 `@argos/shared` 에서 import 해야 함.
- `TransferProjectResponse` 의 `createdAt: string` 은 서버가 `Date.toISOString()` 으로 직렬화한 값을 기대. WU-2/WU-3 구현 시 일치 여부 확인 필요.
