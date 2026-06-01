# Implement — WU-1

## 변경 요약

`packages/web/src/lib/server/skill-aggregation.ts` 를 신규 생성했다.
Layer 1 `skillCallRowsRelation` 은 events (`is_skill_call=true`) UNION ALL messages slash commands (anti-join으로 events 중복 제거) 를 `Prisma.Sql` relation expression 으로 반환한다. 시간 경계는 half-open `[fromInclusive, toExclusive)`.
Layer 2 `aggregateSkillCountsForRange` 는 Layer 1 을 `WITH skill_call_rows AS (...)` 로 감싸 GROUP BY 집계 후 `{ skillName, callCount }[]` 을 반환한다. bigint → Number 변환 포함, 빈 projectIds early return 처리 포함.
`Prisma.sql` tagged template 만 사용해 string 연결 없이 파라미터 바인딩 안전성을 보장했다.

## 변경 파일

- `packages/web/src/lib/server/skill-aggregation.ts` (신규, ~110 lines)

## 검증 결과

- `pnpm --filter web typecheck` (`npx tsc --noEmit`) → `skill-aggregation.ts` 에 대한 타입 오류 없음 (기존 `@argos/shared` 모듈 미설치 오류는 워크트리 환경 pre-existing 이슈로 무관).

## 잠재 이슈 / 후속 메모

- `skillCallRowsRelation` 을 `db.$queryRaw` 의 CTE 자리에 임베드할 때 Prisma v6 의 중첩 태그드 템플릿 동작을 WU-2/WU-3 실제 호출 시점에 한 번 더 확인 권고 (Prisma.sql 내부의 또 다른 Prisma.sql 가 정상 바인딩되는지).
- anti-join 의 `AND e.is_slash_command = true` 조건이 messages 분기에서 events 와 중복 카운트를 방지한다. 기존 skills route 의 동일 패턴에서 복사하여 정의 일관성을 유지했다.
