# Clarify — 2026-05-14-overview-skill-frequency-bug

## 요구사항 한 줄 요약

같은 (orgSlug, from, to, projectId) 에서 `/dashboard/<orgSlug>/skills` 페이지의 Top skills 와 `/dashboard/<orgSlug>/overview` 의 "Skill별 호출 빈도" 카드가 **개수·순서·카운트까지 동일**해지도록, overview 쪽 데이터 소스를 skills 페이지와 같은 UNION 정의 (events.is_skill_call=true ∪ messages 의 slash command) 로 통일한다.

## 배경/현상

- 로컬 dev DB (현재 워크트리) 에서 재현. `/dashboard/<orgSlug>/skills` 에는 항목이 보이는데 같은 (orgSlug, from, to, projectId) 의 `/dashboard/<orgSlug>/overview` 의 "Skill별 호출 빈도" 카드는 `No skill data yet` 으로 비어 있다.
- skills 페이지에 보이는 항목은 **Skill tool 호출 (`events.is_skill_call=true`) 과 사용자 slash command (`<command-name>/…</command-name>` 정규식 매칭) 가 둘 다 섞여 있는** 상태.
- 사용자가 명시한 정합성 기대치: **완전 일치 (Top 10 의 skillName, callCount, 순서까지 같음)**.
- 사용자가 명시한 "정답" 정의: **skills 페이지 쪽이 진실** — slash command 도 skill 호출로 포함시키는 사용자 멘탈 모델을 채택. overview 쪽이 이 UNION 정의에 맞춰져야 한다.

## 진단 결론 (확정)

원인은 **데이터 소스 비대칭** 으로 확정.

- skills API (`/api/orgs/[orgSlug]/dashboard/skills/route.ts`): `events.is_skill_call = true` **UNION** `messages` 의 `<command-name>/…</command-name>` 정규식 매칭을 합쳐 실시간 집계.
- overview API (`/api/orgs/[orgSlug]/dashboard/overview/route.ts` → `aggregateSummary` → `daily_rollups.skillCounts`): `daily_rollups` 빌더 (`packages/web/src/lib/server/daily-rollup.ts` L150–159) 가 **`events.isSkillCall=true` 만** 카운트.
- 결과: slash command 위주의 org 에서는 skills 페이지엔 보이지만 overview 엔 0 건이 "설계상" 정상 동작.

후보 가설 중 다음은 **기각**:

- **rollup 빌드 지연 가설 (기각)**: 사용자 응답 Q5(b) — 과거 (rollup 이 충분히 빌드됐을) 기간에서도 동일하게 빈 화면이 보인다. 따라서 야간 배치 지연이 아닌 데이터 소스 비대칭이 진짜 원인.
- **SkillFrequencyChart empty state 가드 / `hasNoData` 가드**: 코드 확인 결과 단순 `chartData.length === 0` 이고 `hasNoData` 는 이미 통과한 상태이므로 무관.

## 결정 사항

1. **정의 통일 방향**: overview 의 skill 집계를 skills 페이지의 UNION 정의 (`events.is_skill_call=true` ∪ `messages` 의 slash command 매칭) 로 맞춘다.
2. **구현 위치**: 일차적으로 `daily_rollups.skillCounts` 정의 자체를 UNION 정의로 변경 (`daily-rollup.ts` 의 `skillGroups` 부분). overview 쿼리는 이 변경된 rollup 을 그대로 읽으면 됨.
   - 대안: rollup 정의는 그대로 두고 overview API 가 (rollup skill + messages-slash 실시간) 을 합치는 합성 경로. plan 단계에서 비용·일관성 트레이드오프로 결정 가능.
3. **과거 데이터 백필**: rollup 정의를 바꾸면 과거 `daily_rollups.skillCounts` 가 부정확해진다. **가능하면 같이 백필 스크립트/명령을 만든다.** 단, 영향 기간·row 수가 너무 커지면 plan 단계에서 cost 보고 잘라낸다 (별도 task 로 분리 가능).
4. **테스트**: 핵심 회귀 (UNION 정의 + skills 페이지와 동일 결과) 를 막을 **최소 케이스만** 추가. daily-rollup 빌더 단위 테스트 또는 overview 쿼리 단위 테스트 중 한 곳에 압축.

## 수용 기준

### MUST

- **M1.** 동일한 (orgSlug, from, to, projectId) 조합에서 `/dashboard/<orgSlug>/skills` 페이지의 Top skills 와 `/dashboard/<orgSlug>/overview` 의 "Skill별 호출 빈도" 카드가 **skillName 집합·순서·callCount 까지 완전 일치** 한다 (Top N 제한이 다르다면, 양쪽 모두 동일 N 으로 잘랐을 때 일치).
- **M2.** slash command 만 사용하고 `events.is_skill_call=true` 가 0 건인 org/기간에서도 overview 카드가 **비어 있지 않다** (slash command 호출이 카운트됨).
- **M3.** 기존 `events.is_skill_call=true` 만 있던 org/기간의 카운트는 회귀하지 않는다 (UNION 이므로 기존 케이스는 부분집합으로 보존).
- **M4.** 권한 모델은 기존 dashboard 와 동일 — orgSlug 멤버만 카드 데이터 조회 가능. 비멤버 접근 시 기존 가드 동작 유지.

### SHOULD

- **S1.** rollup 정의 변경 시 영향 기간의 `daily_rollups.skillCounts` 를 백필하여 과거 overview 화면도 같이 정확해진다. (영향 규모가 크면 plan 단계에서 분할.)
- **S2.** 핵심 회귀를 막는 최소 단위 테스트 1~2 개 (daily-rollup 빌더의 UNION 정의 검증 또는 overview 쿼리 결과가 skills API 결과와 일치하는지 비교).
- **S3.** 변경된 정의가 다른 코드 경로 (예: `DashboardSummary.topSkills` 타입, 클라이언트 카드 컴포넌트) 와 의미적으로 일관됨.

## 범위 (In scope)

- `daily_rollups.skillCounts` 정의 변경 (또는 overview API 합성 경로) 으로 skills 페이지와 동일한 UNION 정의 채택.
- 변경된 정의를 따르는 단위 테스트 1~2 개.
- 가능하면 과거 `daily_rollups` 백필 스크립트/명령 (cost 가 크지 않을 때).
- 필요 시 `DashboardSummary.topSkills` 타입 / `SkillFrequencyChart` 의 표시 카피 정합성 조정.

## 비범위 (Out of scope)

- overview 의 다른 카드 (Token usage by model, Top users, Recent sessions 등) 의 데이터 소스 비대칭 점검 → 별도 task.
- skills 페이지의 다른 컬럼 (예: Median duration) 의 부가 버그 → 별도 task.
- skills 페이지의 정의를 바꿔서 좁히는 방향 (사용자 결정으로 폐기 — Q4(a) 채택).
- 대규모 백필이 cost 상 부담스러우면 plan 단계에서 잘라내 별도 task 로 분리 (이 task 의 MUST 는 아님).
- 카드 제목/설명 카피의 의미 분리 (Q4(c) 안) — 폐기.

## 유스케이스 (Cockburn 형식)

### UC-DRAFT-2026-05-14-overview-skill-frequency-bug-1: Overview 의 Skill 호출 빈도 카드를 본다

> 도메인 후보: ORG (org-scoped dashboard 영역. session/billing 보다 organization 카탈로그에 더 가깝다.)
> 카탈로그 매핑 후보: 신규 (현재 `docs/usecases/org/` 폴더 미생성 상태이며, dashboard overview 의 카드별 UC 가 카탈로그에 아직 없음.)

- **범위 (Scope)**: Argos 웹 대시보드 + 백엔드 API + `daily_rollups` 사전집계.
- **수준 (Level)**: user-goal
- **주 행위자 (Primary Actor)**: orgSlug 멤버 사용자 (기존 dashboard 권한 모델).
- **이해관계자와 관심사 (Stakeholders & Interests)**:
  - orgSlug 멤버 사용자: skills 페이지에서 본 Top skills 와 overview 카드의 Top skills 가 동일하다고 신뢰하고 싶다 (지표 일관성).
  - 조직 OWNER: 조직의 실제 Skill 사용 (Skill tool 호출 + slash command) 을 한눈에 빈도순으로 파악하고 싶다.
  - 플랫폼 운영자: overview 와 skills 페이지의 정의 불일치로 인한 사용자 문의·오해를 줄이고 싶다.
- **사전조건 (Preconditions)**:
  - P1. 주 행위자가 orgSlug 의 멤버로 인증된 세션을 가진다.
  - P2. 해당 orgSlug 에 조회 기간 (from~to) 동안 최소 한 건 이상의 Skill tool 호출 또는 slash command 입력 이력이 존재한다 (없으면 빈 카드가 정상).
- **성공 보장 (Success Guarantees / Postconditions)**:
  - G1. overview 의 "Skill별 호출 빈도" 카드는 (orgSlug, from, to, projectId) 가 동일한 skills 페이지의 Top skills 와 skillName·callCount·정렬 순서까지 일치한다.
  - G2. slash command 만 입력된 org/기간에서도 카드가 비어 있지 않다 (UNION 정의로 합산됨).
  - G3. `daily_rollups.skillCounts` 가 백필된 기간에 대해서는 과거 날짜를 조회해도 G1, G2 가 성립한다.
- **최소 보장 (Minimal Guarantees)**:
  - M1. 비멤버가 카드 데이터를 조회하면 기존 권한 가드가 응답을 차단하고, 어떤 raw 데이터도 노출하지 않는다.
  - M2. rollup 빌더 또는 백필 도중 실패해도 `daily_rollups` 의 다른 카운터 (sessionCount 등) 와 다른 날짜의 데이터는 손상되지 않는다 (날짜·org 단위 재시도 가능).
- **트리거 (Trigger)**:
  - T1. 사용자가 `/dashboard/<orgSlug>/overview` 페이지에 진입한다.
  - T2. 사용자가 overview 페이지에서 날짜 범위 (from~to) 또는 project 필터를 변경한다.
- **주 성공 시나리오 (Main Success Scenario)**:
  1. (User · UI) overview 페이지로 진입하거나 날짜/project 필터를 변경한다.
  2. (System · API) `GET /api/orgs/{orgSlug}/dashboard/overview?from&to&projectId` 가 호출되어 권한을 검사한 뒤 통과한다.
  3. (System · DB) `daily_rollups` 에서 (orgSlug, from~to, projectId) 범위의 row 들을 읽고, 각 row 의 `skillCounts` (UNION 정의 — `events.is_skill_call=true` ∪ messages 의 slash command 매칭) 를 합산해 Top N skills 를 산출한다.
  4. (System · API) 응답 body 의 `summary.topSkills` 에 [{ skillName, callCount }, …] 을 정렬해 담아 200 으로 반환한다.
  5. (System · UI) `SkillFrequencyChart` 가 응답을 받아 카드에 막대그래프로 렌더링한다. 같은 (orgSlug, from, to, projectId) 의 skills 페이지 Top 과 동일한 항목·순서·값이다.
- **확장 (Extensions)**:
  - 2a. 권한 실패 (orgSlug 비멤버 또는 미인증): 기존 dashboard 가드가 401/403 을 반환하고 카드는 렌더되지 않는다. 어떤 raw 카운트도 노출되지 않는다 (M1 유지).
  - 3a. 해당 기간/projectId 의 `daily_rollups` row 가 한 건도 없음: `summary.topSkills` 가 빈 배열로 직렬화되고, 카드는 기존 empty state ("No skill data yet") 를 표시한다. 이는 P2 미충족 케이스로 정상 동작.
  - 3b. 조회 기간이 `daily_rollups` 백필 이전 과거 (S1 한정) 기간을 포함: 해당 날짜 row 의 `skillCounts` 는 옛 정의 (Skill tool only) 일 수 있어 G1 이 일시적으로 깨질 수 있다. 백필 스크립트가 끝난 뒤 G1 이 회복된다. (이 케이스를 별도 task 로 분할하면 본 UC 의 G3 는 그 task 의 성공 보장으로 옮겨진다.)
- **기술/데이터 변형 (Technology & Data Variations)**:
  - V1. 구현 채널 — (V1a) `daily_rollups.skillCounts` 정의를 UNION 으로 바꾸는 경로 vs (V1b) rollup 은 그대로 두고 overview API 가 messages-slash 를 실시간으로 합치는 합성 경로. 둘 다 외부 관찰 결과 (G1, G2) 는 동일해야 한다.

## 가정 (Assumptions)

- 권한 모델·트리거 (페이지 진입, 날짜·project 필터 변경) 는 기존 dashboard overview 와 동일 (Q7 사용자 위임).
- `messages` 테이블의 `<command-name>/…</command-name>` 정규식 매칭은 skills 페이지에서 이미 사용 중이며, 이 정의를 그대로 재사용한다.
- Top N 의 N 은 양쪽 화면에서 동일하다고 가정 (실제 구현 시 plan 단계에서 확인). 다르면 동일 N 으로 자른 부분집합 비교로 M1 을 정의.
- 백필 영향 기간은 plan 단계에서 정확히 산정 가능한 수준 (예: 며칠 ~ 수 주). 그보다 크면 본 task 에서 백필을 잘라낸다.

## 미해결 위험 (Open risks)

- 백필 비용. `daily_rollups` 가 큰 org/긴 기간에 대해 재계산이 무겁다면 본 task 에서 백필을 빼야 한다. plan 단계에서 row 수 / 예상 시간 측정 후 결정.
- `DashboardSummary.topSkills` 또는 관련 클라이언트 컴포넌트가 옛 정의 (Skill tool only) 를 가정하는 카피·툴팁을 가지고 있을 수 있음. UI 카피 정합성 검토 필요.
- skills 페이지 자체의 정의가 추후 바뀌면 overview 와 다시 어긋날 수 있음 — 공통 정의를 한 곳 (예: shared helper) 으로 모으는 것이 바람직하지만 본 task 범위는 "현재 skills 정의에 overview 를 맞춘다" 까지.

## 관련 기존 문서

- `packages/web/src/app/api/orgs/[orgSlug]/dashboard/overview/route.ts` — 현재 overview 응답 경로.
- `packages/web/src/app/api/orgs/[orgSlug]/dashboard/skills/route.ts` — 현재 skills 페이지의 UNION 정의 원본.
- `packages/web/src/lib/server/daily-rollup.ts` (특히 L150–159 의 `skillGroups`) — Skill tool only 정의가 박혀 있는 지점.
- `packages/web/src/components/dashboard/skill-frequency-chart.tsx` — 카드 렌더링 및 empty state.
- `packages/shared/.../DashboardSummary` — `topSkills` 타입 (이름은 plan 단계에서 정확히 확인).
- `docs/data-schema.md` — `daily_rollups`, `events`, `messages` 스키마 참조.
- `docs/usecases/README.md` — UC 카탈로그 승격 규약 (본 초안 finalize 후 `new-task-usecase` 가 처리).

## 영향 후보 파일 (수정 후보)

- `packages/web/src/lib/server/daily-rollup.ts` — `skillGroups` 정의를 UNION 으로 확장 (V1a 채택 시).
- `packages/web/src/app/api/orgs/[orgSlug]/dashboard/overview/route.ts` — 합성 경로 (V1b) 채택 시 messages-slash 합산 추가, 또는 응답 직렬화 보정.
- `packages/web/src/app/api/orgs/[orgSlug]/dashboard/skills/route.ts` — 정의의 단일 출처화 (공통 helper 추출 시).
- `packages/web/src/components/dashboard/skill-frequency-chart.tsx` — 카피·툴팁 정합성 필요 시.
- `packages/shared/.../DashboardSummary` — `topSkills` 타입 (변경 시).
- 백필 스크립트 (신규, plan 단계에서 위치 결정 — `packages/web/scripts/` 후보).
- 테스트 (신규) — `daily-rollup.test.ts` 또는 overview/skills 동치성 단위 테스트.

## 위험/롤백 메모

- **롤백 경로**: `daily_rollups.skillCounts` 정의를 옛 (Skill tool only) 로 되돌리고, overview 응답은 그대로 rollup 을 읽는 경로로 회귀. 백필을 했다면 옛 정의로 다시 빌드해야 정확. 따라서 백필 스크립트는 양방향 (옛 정의 / 새 정의) 으로 재실행 가능하게 작성하는 것을 권장.
- **무중단성**: rollup 정의 변경 후 백필 전까지는 G3 가 일시적으로 깨질 수 있음 (확장 3b). 사용자에게 노출되는 화면 영향은 "옛 정의 카운트가 보임" 이지 "에러" 가 아니므로 일반 배포 가능.
- **테스트 가드**: 단위 테스트 1~2 개로 skills API 와 overview API 가 동일 (orgSlug, from, to, projectId) 에서 같은 Top N 을 반환하는지 검증. 회귀의 1차 방어선.

## 메모 (메인 세션 참고)

- 라운드 1 의 Q1–Q7 모두 답이 수렴했으므로 finalize 진행. 추가 라운드 불필요.
- UC 1 개 (user-goal, ORG 도메인 후보). task 1건 기준 적정 범위 (1~3개 권장 한도 내).
- 백필 cost 가 plan 단계에서 너무 크다고 판명되면 백필을 별도 task 로 분리하고 본 task 의 SHOULD-S1 / UC 의 G3, 확장 3b 를 그 task 로 이관할 것.
- 카탈로그 승격 시 `docs/usecases/org/` 폴더가 신규 생성될 가능성이 높음 (현재 `_ids.yaml` 미확인). `new-task-usecase` 가 처리.
