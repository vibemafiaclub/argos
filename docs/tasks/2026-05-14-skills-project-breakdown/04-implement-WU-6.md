# Implement — WU-6

## 변경 요약

`packages/web/src/app/dashboard/[orgSlug]/skills/page.tsx` 에 "Projects" 컬럼을 추가했다. `useRouter`, `usePathname` import 를 추가하고, 기존 `from`/`to` 파라미터를 보존하면서 `projectId` 만 set 하는 `setProjectIdQuery` 헬퍼를 구현했다. thead 의 "Users" 와 "Median duration" 사이에 "Projects" `<th>` (isProjectFiltered 시 InfoTooltip 포함) 를 삽입하고, tbody 각 row 에 `<SkillProjectsCell>` 을 추가해 `projects`, `additionalProjectCount`, `isProjectFiltered`, `onSelectProject={setProjectIdQuery}` 를 전달했다.

## 변경 파일

- `packages/web/src/app/dashboard/[orgSlug]/skills/page.tsx` (수정, +29/-1 lines)

## 검증 결과

- `pnpm --filter @argos/web typecheck` → pass (오류 없음)
- `pnpm --filter @argos/web build` → 컴파일 단계 pass (`✓ Compiled successfully`), 타입체크 단계 pass. "Collecting page data" 단계에서 환경변수 미설정(`DATABASE_URL` 등)으로 ZodError — 기존 인프라 문제이며 본 변경과 무관.

## 잠재 이슈 / 후속 메모

- `setProjectIdQuery` 가 `router.push` 를 사용해 히스토리 항목이 쌓인다. plan 의 WU-6 스니펫은 `router.push` 를 명시하고 있으나, sessions/page.tsx 패턴과 동형이다. 필요 시 `router.replace` 로 전환 가능 (히스토리 오염 방지).
- WU-3 의 SQL 이 완성되어 응답에 `projects`/`additionalProjectCount` 가 실제로 채워져야 런타임 동작 확인 가능.
