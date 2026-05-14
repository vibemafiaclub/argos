# Implement — WU-5

## 변경 요약

`packages/cli/src/lib/event-sender.ts` 에 `buildSelfHealScript` 헬퍼를 신규 export하고, `/api/events` 응답이 202 + 유효한 `project.{id,orgId,orgSlug}` 를 담고 있을 때 `.argos/project.json` 을 atomic하게 self-heal 하는 10단계 inline child 스크립트를 구현했다. `sendEventBackground` 는 새 opts form (`SendEventBackgroundOpts`) 을 1순위로 지원하되, WU-6 가 `deps.ts`/`adapters.ts` 를 갱신하기 전까지 기존 positional 시그니처와 backward compat 오버로드를 유지해 빌드가 깨지지 않도록 했다. `event-sender.test.ts` 를 신규 생성해 `buildSelfHealScript` 의 출력 문자열을 15개 단정으로 정적 검증한다.

## 변경 파일

- `/Users/choesumin/Desktop/dev/vmc/argos/packages/cli/src/lib/event-sender.ts` (수정, ~150 lines)
- `/Users/choesumin/Desktop/dev/vmc/argos/packages/cli/src/lib/event-sender.test.ts` (신규, ~80 lines)

## 검증 결과

- `pnpm --filter argos-ai test` → 125 passed (9 test files, 포함 event-sender.test.ts 15 tests)
- `pnpm --filter argos-ai typecheck` → pass (0 errors)
- `pnpm --filter argos-ai build` → pass

## 잠재 이슈 / 후속 메모

- WU-6 가 `deps.ts` 의 `events.sendBackground` 시그니처를 `SendEventBackgroundOpts` 로 교체하면, `sendEventBackground` 의 legacy positional 오버로드는 사실상 dead code 가 된다. WU-6 완료 후 정리 가능.
- `buildSelfHealScript` 의 finally 블록이 `return` 이후에도 실행되도록 async IIFE 구조로 작성되어 있어 tmpFile 정리가 보장된다. early return 시에도 tmpFile 이 남지 않는다.
- self-heal atomic write 에서 `JSON.stringify(updated, null, 2)` 를 사용해 사람이 읽기 좋은 포맷을 유지한다 (기존 project.json 포맷과 동일).
