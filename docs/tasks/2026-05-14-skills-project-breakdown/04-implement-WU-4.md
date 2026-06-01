# Implement — WU-4

## 변경 요약

`packages/web/src/components/ui/popover.tsx` 를 신규 생성했다. `@base-ui/react/popover` 의 `Root`, `Trigger`, `Portal`, `Positioner`, `Popup`, `Close`, `Title`, `Description`, `Arrow` 를 래핑하며, `Popup` 에는 `info-tooltip.tsx` 와 동일한 톤의 default className(`rounded-md bg-popover text-popover-foreground ring-1 ring-foreground/10 shadow-md px-3 py-2 text-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0`)을 적용했다. 개별 named export 와 `Popover` namespace 객체 두 가지 모두 제공해 소비 측에서 `<Popover.Trigger openOnHover ...>` 패턴으로 바로 사용 가능하다. `Popover.Root` 의 `modal` 기본값은 base-ui 가 `false` 로 제공하므로 별도 override 없이 비-모달 동작이 보장된다.

## 변경 파일

- `packages/web/src/components/ui/popover.tsx` (신규, +52 lines)

## 검증 결과

- `pnpm --filter @argos/web typecheck` → pass (오류 없음)

## 잠재 이슈 / 후속 메모

- `openOnHover` 는 `Popover.Trigger` 의 prop 이므로 소비 측(WU-5)에서 트리거마다 선언해야 함. 본 래퍼는 prop 을 그대로 통과시키므로 추가 작업 불필요.
- `data-open:animate-in` / `data-closed:animate-out` CSS 클래스는 base-ui 가 `data-open` / `data-closed` attribute 를 DOM 에 추가하는 방식으로 동작. Tailwind arbitrary variant 가 설정되어 있어야 하며, `info-tooltip.tsx` 가 이미 동일 클래스를 사용 중이므로 프로젝트에 이미 지원됨을 확인했다.
