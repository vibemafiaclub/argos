# Implement — WU-7

## 변경 요약
`useTransferProject(orgSlug, projectId)` mutation hook 을 신규 생성했다.
`mutationFn` 은 `apiPost` 를 통해 `POST /api/projects/:projectId/transfer` 를 호출하며, `TransferProjectResponse` 타입(WU-1 에서 정의)으로 응답을 타입화한다.
`onSuccess` 에서 `['orgs']`, `['projects', orgSlug]`, `['projects', variables.targetOrgSlug]`, `['dashboard']` 쿼리 키를 순차 무효화하여 양쪽 org 의 프로젝트 목록 및 대시보드 overview/sessions 캐시를 일괄 갱신한다.
오류는 `apiPost` 내부에서 `ApiError` 로 변환되어 그대로 throw 되므로 호출부에서 `catch` 로 처리 가능하다.

## 변경 파일
- `/Users/choesumin/Desktop/dev/vmc/argos/packages/web/src/hooks/use-transfer-project.ts` (신규, ~35 lines)

## 검증 결과
- `pnpm --filter @argos/web exec tsc --noEmit` → 오류 없음 (pass)
- 단위 테스트: 기존 `use-projects.ts` 등과 동일하게 테스트 파일 없음 (plan 에 skip 명시)

## 잠재 이슈 / 후속 메모
- `['dashboard']` prefix 무효화는 출발 org 와 도착 org 양쪽의 모든 대시보드 캐시를 invalidate 한다. 대시보드 query key 가 `['dashboard', 'overview', orgSlug, ...]` / `['dashboard', 'sessions', orgSlug, ...]` 형태이므로 prefix 매칭이 정확히 동작한다.
- WU-8 (UI) 에서 `mutateAsync` 의 반환값(`data.project.orgSlug`)을 이용해 `router.push` 리다이렉트를 수행한다. 반환 타입이 `TransferProjectResponse` 로 고정되어 있으므로 UI 쪽에서 별도 캐스팅 불필요.
