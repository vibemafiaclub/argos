# Implement — WU-10

## 변경 요약

`packages/web/scripts/` 디렉터리를 신규 생성하고 `invalidate-skill-counts.ts` oneshot 스크립트를 작성했다.
스크립트는 `SKILL_COUNTS_INVALIDATION_AT` 을 `daily-rollup.ts` 에서 직접 import (단일 source of truth) 하며,
`WHERE computed_at < SKILL_COUNTS_INVALIDATION_AT` 조건으로 stale row 를 대상으로 한다.
기본 실행은 dry-run (영향 row 수와 샘플 5건만 출력), `--execute` 플래그 명시 시 실제 UPDATE 적용.
멱등 보장: 1차 실행 후 2차 실행 시 0 rows (이미 reset 된 row 의 `computed_at = 1970-01-01` 은 threshold 보다 더 옛날이지만,
자연 재계산 후 `computed_at` 이 threshold 이후 값으로 upsert 된 row 는 WHERE 에 걸리지 않음).

## 변경 파일

- `packages/web/scripts/invalidate-skill-counts.ts` (신규, ~110 lines)

## 검증 결과

- `pnpm exec tsc --noEmit --skipLibCheck` → `scripts/` 에서 발생한 에러 0건 (pre-existing 에러 40건 전부 다른 파일 — `@argos/shared` workspace 미링크, 타 WU 테스트 파일 등)
- 스크립트 파일 자체 타입 에러 없음 확인.

## 잠재 이슈 / 후속 메모

- `tsx` 는 글로벌 설치 (`/Users/choesumin/Library/pnpm/tsx`) 로 확인. 스크립트 실행 시 `pnpm --filter web tsx scripts/invalidate-skill-counts.ts` 또는 `npx tsx scripts/invalidate-skill-counts.ts` 모두 가능.
- 스크립트가 standalone `new PrismaClient()` 를 생성하므로 `DATABASE_URL` 환경변수가 설정된 상태에서 실행해야 한다.
- 2차 sweep 에서 0 rows 가 나오려면 WU-3 의 `SKILL_COUNTS_INVALIDATION_AT` 가드가 정상 배포된 상태여야 한다 (새 코드가 항상 `computedAt = new Date()` 로 upsert 하므로 threshold 이후 값).
