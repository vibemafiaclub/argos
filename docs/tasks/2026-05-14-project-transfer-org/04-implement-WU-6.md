# Implement — WU-6

## 변경 요약

`findProjectConfigWithPath` 헬퍼를 `project.ts` 에 추가하고, 기존 `findProjectConfig` 가 이를 내부에서 호출하도록 리팩터링했다.
`deps.ts` 의 `project` 인터페이스에 `findWithPath`, `events.sendBackground` 시그니처를 WU-5 의 `SendEventBackgroundOpts` opts 형으로 변경했다.
`adapters.ts` 에 `findWithPath` 어댑터를 노출하고, `events.sendBackground` 를 람다 래퍼로 정렬했다.
`hook.ts` 에서 `deps.project.findWithPath` 로 프로젝트를 탐색하고, 발견된 절대 경로(`projectJsonPath`) 와 현재 스냅샷(`currentConfig`)을 `sendBackground` opts 로 전달한다.
`hook-command.test.ts` 에 mock `findWithPath` 추가, 기존 `sendBackground` 시그니처 검증 갱신, "passes projectJsonPath and currentConfig to sendBackground for self-heal" 테스트 1개 신규 추가.
타입 에러 발생 측 (`default-command.test.ts`, `setup-command.test.ts`) 의 inline project mock 에도 `findWithPath` 추가해 typecheck 통과.

## 변경 파일

- `packages/cli/src/lib/project.ts` (수정, +20 lines — `findProjectConfigWithPath` 추가, `findProjectConfig` 위임)
- `packages/cli/src/deps.ts` (수정, ~5 lines — `project.findWithPath` 추가, `events.sendBackground` opts 시그니처로 변경)
- `packages/cli/src/adapters.ts` (수정, ~4 lines — `findWithPath` 노출, `sendBackground` 람다 래퍼)
- `packages/cli/src/commands/hook.ts` (수정, ~12 lines — `findWithPath` 사용, `sendBackground` opts 형 호출)
- `packages/cli/src/__tests__/hook-command.test.ts` (수정, ~20 lines — mock 갱신, 새 테스트 추가)
- `packages/cli/src/__tests__/default-command.test.ts` (수정 — inline project mock 에 `findWithPath` 추가, typecheck fix)
- `packages/cli/src/__tests__/setup-command.test.ts` (수정 — inline project mock 에 `findWithPath` 추가, typecheck fix)

## 검증 결과

- `pnpm --filter argos-ai test` → 9 test files, 126 tests passed (신규 1개 포함)
- `pnpm --filter argos-ai build` → pass (tsc -p tsconfig.build.json + shebang script)
- `cd packages/cli && npx tsc --noEmit` → 에러 0

## 잠재 이슈 / 후속 메모

- `default-command.test.ts` / `setup-command.test.ts` 는 WU-6 의 명시 파일 목록 밖이지만, `deps.ts` 의 `project` 인터페이스 변경으로 인해 typecheck 실패가 발생하여 최소 수정(mock 에 `findWithPath` 추가)으로 해결했다.
- `hook.ts` 에서 `orgSlug` 가 없는 레거시 config(v0.1.13 미만)의 경우 `project.orgId` 를 fallback 으로 사용 — 이는 기존 `ensureMembership` fallback 패턴과 일치한다.
