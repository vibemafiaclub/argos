# Implement — WU-5

## 변경 요약

`packages/web/src/lib/server/skill-aggregation.test.ts` 를 신규 생성했다.

Case A (slash command only, messages 만 있고 events 없음): inline fixture 로 `foo` 커맨드 2회를 삽입해 `callCount=2` 를 검증한다. 빈 `projectIds` early return 도 함께 검증.

Case B (UNION + anti-join + role filter + whitespace): WU-4 의 `seedSkillCallFixture` + `EXPECTED_SKILL_COUNTS` 를 그대로 사용해 표준 fixture 전체가 `{ bar:1, baz:1, qux:1, 'whitespace-ok':1 }` 와 일치하는지 Set 비교한다. baz 의 anti-join (events E2 가 messages M1 을 제거), ASSISTANT role 필터, whitespace regex, half-open 시간 경계를 개별 assertions 로 추가 검증한다.

Vitest 2.1.9 가 `.env.local` 을 자동으로 로드하지 않는 문제는 테스트 파일 상단에서 `dotenv.config({ path: resolve(process.cwd(), '.env.local') })` 를 직접 호출해 해결했다. Prisma 는 `DATABASE_URL` + `DIRECT_URL` 모두 요구하므로 두 변수가 모두 포함된 `.env.local` 을 로드한다. `DATABASE_URL` 미설정 시 `describe.skipIf(!DB_AVAILABLE)` 로 전체 suite 를 gracefully skip.

## 변경 파일

- `packages/web/src/lib/server/skill-aggregation.test.ts` (신규, 299 lines)

## 검증 결과

- `pnpm --filter web vitest run skill-aggregation` → 7 tests passed
- 타입체크 (`tsc --noEmit --skipLibCheck | grep skill-aggregation`) → 에러 없음
- 기존 테스트 전체 실행 (`pnpm --filter web vitest run`) → skill-aggregation 포함 8 test files pass, daily-rollup.test.ts 1 failure 는 WU-6 의 foreign key setup 누락으로 WU-5 와 무관

## 잠재 이슈 / 후속 메모

- `.env.local` 이 존재하지 않는 환경(CI 등)에서는 `DB_AVAILABLE=false` 로 전체 suite 가 skip 된다. CI 에서 실행하려면 `DATABASE_URL` / `DIRECT_URL` 환경 변수를 직접 주입하거나 `vitest.config.ts` 에 `envFile: '.env.local'` 설정을 추가해야 한다 (WU-5 범위 밖).
- `daily-rollup.test.ts` (WU-6) 은 `seedSkillCallFixture` 를 사용하지만 supporting records (Org/User/Project/Session) 를 setup 하지 않아 foreign key 오류가 발생한다. WU-6 이 같은 패턴으로 `setupSupportingRecords` 를 추가하면 해결된다.
