# Implement — WU-5

## 변경 요약

`packages/web/src/components/dashboard/skill-projects-cell.tsx`를 신규 생성했다. `SkillProjectsCell` 컴포넌트는 (1) projects 없으면 "—" 반환, (2) `isProjectFiltered=true`일 때 단일 project 이름을 `disabled` + `opacity-60` 스타일로 표시, (3) 일반 모드에서 Top 5 project name 들을 inline `<button>`으로 나열하고 클릭 시 `onSelectProject` 호출, 팝오버 트리거(sibling)를 별도 `<Popover.Trigger>`로 구현해 nested interactive 위험을 제거했다. 팝오버 내부(`ProjectBreakdownPopup`)는 각 project 별 invocations 막대 + lastUsedAt, 클릭 시 동일 핸들러 호출 후 팝오버 자동 닫힘, `additionalProjectCount > 0`이면 푸터에 안내 텍스트를 표시한다.

## 변경 파일

- `packages/web/src/components/dashboard/skill-projects-cell.tsx` (신규, +196 lines)

## 검증 결과

- `pnpm --filter @argos/shared build` → pass (tsc)
- `pnpm --filter @argos/web typecheck` → pass (0 errors in skill-projects-cell.tsx, 전체 0 errors)

## 잠재 이슈 / 후속 메모

- `Popover.Root`의 controlled `open/onOpenChange`를 사용해 팝오버 내 클릭 후 `setOpen(false)` 명시 호출. base-ui 기본 dismiss 동작과 중복이지만 명시적으로 유지하는 게 안전.
- `formatLastUsed`는 한국어 locale(`ko`)을 쓰므로 영문 UI라면 locale 분리 필요 — 본 task 범위 밖.
- WU-6 (`page.tsx`)에서 `isProjectFiltered`, `onSelectProject` props를 주입 완료하면 런타임 동작 검증 가능.
