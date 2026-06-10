---
title: 코드 퀄리티 이슈 — 에러 응답 shape 혼재, 무음 catch, 복붙 3중화
created_at: 2026-06-10T03:40:00Z
resolved: false
priority: P2
related:
  - docs/findings/2026-06-10T0340-data-integrity-bugs.md
  - packages/web/src/lib/api-client.ts
---

# 코드 퀄리티 이슈 — 에러 응답 shape 혼재, 무음 catch, 복붙 3중화

## TL;DR

타입 위생은 상위권(전 패키지 lint/typecheck 0 error, 소스 내 `any`·
`@ts-ignore`·`z.any()` 0건 — 2026-06-10 실측). 주된 부채는 (1) API 에러
응답 shape 표준 부재로 서버 메시지가 클라이언트에서 유실, (2) 핵심 ingest
경로의 무음 catch, (3) fetch/생성 플로우/병합 로직의 복붙 다중화 3축이다.

## Body

### 곧 버그가 될 항목 (P1급)

**Q1 — API 에러 응답 shape 3종 혼재 + 클라이언트 파서 불일치.**
`packages/web/src/lib/server/error-helper.ts:19-27`은 중첩형
`{ error: { code, message } }`, `api/events/route.ts:27-30`은
`{ error: 'Validation failed', details }`, 그 외 30여 곳
(`dashboard-route-helper.ts:31`, `api/auth/exchange/route.ts:19` 등)은
평탄형 `{ error: 'string' }`. 클라이언트 `api-client.ts:50-54`는 중첩형만
파싱하므로 평탄형 라우트의 서버 메시지가 유실되고 기본 문구로 대체됨.
→ `jsonError(code, message, status)` 단일 헬퍼로 통일, api-client는 양쪽
호환으로 1차 완충.

**Q2 — 문자열 기반 에러 분기.**
`dashboard-route-helper.ts:29-31` — `if (message === 'Project not found')`.
`packages/cli/src/commands/setup.ts:163` —
`message.includes('API Error (403)') || message.includes('MANAGER 이상')`.
문구 한 글자 변경으로 오분류·안내문 미출력이 조용히 발생. 같은 레포의
`project-actions.ts`는 이미 discriminated union을 쓰고 있어 컨벤션 불일치.
→ result union 또는 에러 클래스(`ApiError(status)`)로 전환.

**Q3 — 핵심 ingestion 경로의 완전 무음 catch.**
`api/events/route.ts:197-199` — `} catch { // 에러 발생해도 무시 }`.
이 `after()` 블록이 세션 종료 메타·usageRecord bulk insert·메시지 교체
(`:124-196`)를 수행 — 토큰/전사 데이터가 유실돼도 관측 수단 0.
→ 최소 `console.error('[events:after]', err)` 추가.

**Q4 — CLI hook.ts의 도달 불가능한 SubagentStop 분기.**
`packages/cli/src/commands/hook.ts:177-180`에서 SubagentStop을 조기
`process.exit(0)`하는데 `:213-217`에 SubagentStop 처리 분기가 그대로 잔존.
서버측 `events/route.ts:155,172`의 `isSubagent` 판정도 사실상 항상 false.
→ 죽은 분기 제거 또는 단일 출처 주석 명시.

### 중복 (P2)

**Q5 — api-client 에러 파싱 3중 복제.** `api-client.ts:48/80/106` —
apiPost/apiPatch/apiDelete에 동일 블록 복사, `apiGet`(:14)만 plain Error.
→ `parseApiError(res)` 공용 추출 + ApiError로 통일.

**Q6 — dashboard 훅 5개 보일러플레이트 + 인코딩 없는 쿼리스트링.**
`use-dashboard-{overview,skills,users,agents,sessions}.ts` 전부
`` `&projectId=${projectId}` `` 수동 결합(encodeURIComponent 없음),
동일 staleTime/enabled 반복. 페이지·컴포넌트 6곳의
`new URLSearchParams(searchParams.toString())` 패턴도 동일
(`sessions/page.tsx:106`, `users/page.tsx:46`, `skills/page.tsx:37`,
`project-filter.tsx:47`, `date-range-picker.tsx:49`,
`week-navigator.tsx:42`). → `useDashboardQuery<T>` 팩토리 +
`useQueryParams()` 훅으로 수렴.

**Q7 — CLI 프로젝트 생성 플로우 3중 복제.**
spinner → createProject → project.write → injectAgentHooks 시퀀스가
`packages/cli/src/commands/default.ts:64-96`, `:168-196`,
`setup.ts:87-121`에 3벌. → `createAndWriteProject()` 공용 추출.

**Q8 — 동일 대상 테스트 파일 2벌 + 배치 컨벤션 혼재.**
`packages/cli/src/__tests__/transcript.test.ts`(384줄)와
`packages/cli/src/lib/transcript.test.ts`(439줄)가 같은 함수들을 테스트.
디렉터리도 `__tests__/` 7개 vs co-located 5개로 양분. → co-located로
통일, 고유 케이스만 병합.

**Q9 — daily-rollup.ts 707줄(레포 최대) + userStats 병합 로직 2벌.**
`daily-rollup.ts:444-458` vs `:693-704`가 사실상 동일 병합 코드.
`project-actions.ts:86-123` vs `:148-182`의 권한 체크 prologue도 중복.
→ `mergeUserStat()`/`loadProjectWithAccess()` 추출, 파일 분할 검토.

### 기타 (P2)

**Q10 — SessionsContent 366줄 다중 책임.**
`sessions/page.tsx:68-434` — URL 상태·CSV 다운로드(:115-156)·테이블·삭제
다이얼로그(:375-431)가 한 컴포넌트. → 훅/컴포넌트 분리.

**Q11 — 렌더 단계 setState.**
`settings/projects/page.tsx:374-376` — render 본문에서
`setSelectedProjectId(projectList[0].id)`. → 파생값
(`selectedProjectId || projectList[0]?.id`)으로 전환.

**Q12 — Prisma JsonValue 이중 단언.** `daily-rollup.ts:345-348` —
`as unknown as DailyUserStat[]` + 죽은 `?? []` 폴백. 캐시 row shape이
깨져도 통과. → 역직렬화에 경량 zod/가드 적용(`:339`의 activeUserIds처럼).

**Q13 — 포맷팅 양분(prettier 부재).** `.prettierrc` 없음. double quote+
세미콜론 파일(`app/page.tsx`, `event-list.tsx`)과 single quote 무세미콜론
파일(`app/layout.tsx` 등) 혼재. → prettier 도입 + CI `--check`.

**Q14 — admin-dashboard.tsx만 react-query 컨벤션 이탈.**
`components/admin/admin-dashboard.tsx:36-43` 수동 상태 5종 + `:50-85`
setTimeout(200) 수제 디바운스 fetch. → `useAdminUsers(query)` 훅으로 이관.

**Q15 — 한·영 혼재.** 서버 에러 대부분 영어인데
`api/orgs/[orgSlug]/members/[memberUserId]/route.ts:46,114`만 한국어.
UI도 같은 화면에서 혼용(`sessions/page.tsx:36` 'Most recent' vs `:273`
'사용자'). → 서버는 영어 code 중심, UI는 한국어 기준 일원화.

## Acceptance signal

- Q1: 전 라우트가 단일 `jsonError` 헬퍼 사용 —
  `grep -rn "{ error: '" packages/web/src/app/api | wc -l` → 0.
- Q3: `api/events/route.ts`의 catch 블록에 로깅 존재.
- Q5/Q6/Q7: 추출된 공용 함수 존재 + 복제 블록 grep 0건.
- Q13: CI에 `prettier --check` 스텝.
