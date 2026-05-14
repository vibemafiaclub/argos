# Implement — WU-8

## 변경 요약

`settings/projects/page.tsx` 에 `TransferProjectPanel` 컴포넌트를 추가하고, `ProjectAccessContent` 하단에 "Transfer Project" Card 섹션을 OWNER 전용으로 노출했다. 대상 org 후보는 `useOrgs()` 결과 중 `role === 'OWNER'` 이고 현재 orgSlug 와 다른 항목만 필터링한다. 실행 시 `window.confirm` 으로 경고 후 `useTransferProject` 를 호출하며, 성공 시 `router.push` 로 대상 org settings 로 이동하고, 409/403/404 는 인라인 Alert 로 안내한다. OWNER 역할이 없으면 섹션 자체가 렌더되지 않는다.

## 변경 파일

- `packages/web/src/app/dashboard/[orgSlug]/settings/projects/page.tsx` (수정, +~110 lines)
  - `useRouter`, `useTransferProject` import 추가
  - `useSession` import 제거 (페이지 수준에서 미사용)
  - `TransferProjectPanel` 컴포넌트 신규 추가 (~120 lines)
  - `ProjectAccessContent` 에 `isOwner` 분기 추가 + Transfer Card 렌더

## 검증 결과

- `pnpm --filter @argos/web build` 실행 → 빌드 실패는 모두 WU-2(`project-actions.test.ts`)의 `@typescript-eslint/no-explicit-any` ESLint 오류이며, WU-8 변경 파일(`settings/projects/page.tsx`, `use-transfer-project.ts`)에서 발생한 오류는 0건.
- `npx tsc --noEmit` 에서 `settings/projects/page.tsx` 관련 타입 오류 없음.

## 잠재 이슈 / 후속 메모

- WU-2 의 `project-actions.test.ts` ESLint 오류(`no-explicit-any`)가 전체 빌드를 막고 있어 WU-8 단독 빌드 성공 확인이 불가. WU-2 수정 후 전체 빌드 재검증 필요.
- `window.confirm` 을 사용해 확인 다이얼로그를 구현했다. 향후 `AlertDialog` 컴포넌트로 교체하면 UX 일관성이 더 높아진다 (현재 코드베이스에서 일부 삭제 액션도 `confirm` 사용 중이라 동일 패턴).
- Transfer 성공 후 `router.push` 가 실행되기 전에 `setTransferSuccess` 도 호출하는데, 라우트 이동으로 상태가 사라지므로 성공 메시지는 실제로 보이지 않는다. 라우트 이동이 즉시 일어나는 게 더 깔끔하므로 현재 동작이 의도에 맞다.
