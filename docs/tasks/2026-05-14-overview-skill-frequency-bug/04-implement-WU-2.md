# Implement — WU-2

## 변경 요약

`skills/route.ts` 의 기존 두 개 CTE (`event_skill_calls`, `message_slash_calls`) 를 제거하고, WU-1 의 `skillCallRowsRelation` 을 단일 `skill_call_rows` CTE 로 대체했다. `skill_events` CTE 는 이제 `skill_call_rows` 를 직접 집계한다. `parseDateRange` 의 inclusive `to` 를 `toExclusive = new Date(to.getTime() + 1)` 로 변환해 half-open `[from, toExclusive)` 계약을 맞췄다 (Decision-8). `skill_durations` CTE 경계도 `<= to` → `< toExclusive` 로 통일했다. tie-break 정렬을 `ORDER BY e.call_count DESC, e.skill_name ASC` 로 추가해 동률 시 deterministic 순서를 보장한다 (Decision-5).

## 변경 파일

- `packages/web/src/app/api/orgs/[orgSlug]/dashboard/skills/route.ts` (수정, ~40 lines 변경)

## 검증 결과

- `npx tsc --noEmit` → `skills/route.ts` 및 `skill-aggregation.ts` 에 대한 타입 오류 없음 (기존 `@argos/shared` 모듈 미설치 오류는 워크트리 pre-existing 이슈, WU-1 보고와 동일).

## 잠재 이슈 / 후속 메모

- `skill_durations` CTE 의 `timestamp` 경계가 `skill_call_rows` 와 동일 `[from, toExclusive)` 로 맞춰졌으나, 이 CTE 는 `messages m` 에서 독립적으로 join 하므로 route 내 `projectIds` 파라미터를 직접 사용한다. Negative Space 정의에 따라 CTE 구조 자체는 변경하지 않았다.
- WU-8 의 route-level contract 테스트가 실제 DB 로 tie-break 정렬 순서까지 검증한다.
