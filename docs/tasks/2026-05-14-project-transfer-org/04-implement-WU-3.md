# Implement — WU-3

## 변경 요약
`POST /api/projects/[projectId]/transfer` route handler 를 신규 생성했다. `requireAuth` → `TransferProjectSchema.parse(body)` → `transferProjectForUser` 호출 후 `kind` 값에 따라 200 / 403 / 404 / 409 를 매핑한다. `same_org` 와 `ok` 모두 200 으로 현재 project 상태를 반환하며, `createdAt` 은 `Date` → `string` (ISO 8601) 직렬화 처리를 인라인으로 수행한다. `runtime = 'nodejs'`, `dynamic = 'force-dynamic'` 설정, `satisfies TransferProjectResponse` 로 컴파일 타임 타입 보장.

## 변경 파일
- `packages/web/src/app/api/projects/[projectId]/transfer/route.ts` (신규, 70 lines)

## 검증 결과
- `npx tsc --noEmit --project packages/web/tsconfig.json` → 내 파일(`transfer/route.ts`)에 대한 타입 에러 없음.
- `pnpm --filter @argos/web build` → 빌드 실패. 실패 원인은 WU-2(`project-actions.ts:313,325`)와 WU-2/WU-4 테스트 파일에 `@typescript-eslint/no-explicit-any` 위반이며, WU-3 파일과 무관하다. WU-3 파일 자체는 타입체크 통과.

## 잠재 이슈 / 후속 메모
- 빌드 실패 원인(ESLint `no-explicit-any`)은 WU-2의 `project-actions.ts` 내 `FORBIDDEN_RACE` 센티넬 에러 패턴의 `any` 타입 캐스팅과 WU-2/WU-4 테스트 파일에 있으며, 해당 WU 담당자가 수정해야 한다.
- WU-3 파일에 `any` 사용 없음 — ESLint 오류 없음.
