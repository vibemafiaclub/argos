# Implement — WU-4

## 변경 요약

`packages/web/src/lib/server/__fixtures__/skill-call-fixture.ts` 를 신규 생성했다.
WU-5/6/7/8 의 4개 테스트가 read-only import 하는 공유 fixture owner 로,
events 2건 + messages 4건(HUMAN 3 + ASSISTANT 1) 을 실제 Postgres DB 에 시드하는
`seedSkillCallFixture`, row 전량 삭제하는 `cleanupSkillCallFixture`,
4개 테스트가 동일 기대치를 공유할 `EXPECTED_SKILL_COUNTS` 상수를 export 한다.
시드 데이터는 events 분기(bar, baz)·messages 분기(qux, whitespace-ok) 및
anti-join 검증(baz slash)·role 필터(ASSISTANT) 를 모두 커버하도록 설계했다.

## 변경 파일

- `packages/web/src/lib/server/__fixtures__/skill-call-fixture.ts` (신규, ~130 lines)

## 검증 결과

- `pnpm tsc --noEmit` (전체 패키지) → 기존 사전 존재 에러만 출력. fixture 파일 자체에서 발생한 TS 에러 없음 (`grep "__fixtures__"` → 0건).
- 독립 타입체크 (`tsc --noEmit --strict --skipLibCheck`) → 통과.

## 잠재 이슈 / 후속 메모

- fixture 의 `seedSkillCallFixture` 는 `projectId` / `sessionId` / `userId` 에 해당하는 row 가 DB 에 이미 존재함을 전제한다. WU-5/6/7/8 의 각 테스트 파일은 `beforeAll` 에서 org → project → user → session 순으로 참조 row 를 생성하고, `afterAll` 에서 cascade 삭제해야 한다.
- 현재 `Message.id` 는 `@default(cuid())` 이지만 Prisma `create` 시 명시적 id 제공을 허용하므로 `fixture-m*-<projectId>` 패턴으로 cleanup 범위를 정확히 특정했다. 향후 schema 가 `id` 를 auto-increment 로 바꾼다면 cleanup 로직을 sessionId 기준으로 전환해야 한다.
- DATABASE_URL 이 없는 CI 환경에서는 이 fixture 를 사용하는 테스트 전체가 skip / fail 할 수 있다. plan 의 fallback(SQL fragment snapshot 검증) 을 WU-5 구현 시 고려.
