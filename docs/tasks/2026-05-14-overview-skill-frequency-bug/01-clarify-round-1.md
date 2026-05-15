# Clarify Round 1 — overview-skill-frequency-bug

## 한 줄 요약
같은 조직/같은 기간에 `/dashboard/<orgSlug>/skills` 페이지에는 skill 호출 데이터가 표시되지만, `/dashboard/<orgSlug>/overview` 의 "Skill별 호출 빈도" 카드는 `No skill data yet` 으로 비어 있다. 두 화면의 집계 소스 비대칭으로 의심된다.

---

## 질문 목록 (사용자에게 그대로 옮길 것)

> 답하기 쉽게 모든 질문에 후보 답변을 달았다. 보기 중 하나를 고르거나, "기타: ..." 로 자유 응답해주면 된다. 한꺼번에 답해줘도 되고, 부분만 답해도 된다.

### Q1. 재현 환경 (orgSlug / 기간 / projectId)
- 어떤 환경에서 본 증상인가요?
  - (a) 로컬 dev DB (현재 워크트리)
  - (b) 스테이징
  - (c) 프로덕션
  - (d) 기타: ____
- 영향받는 orgSlug, 선택된 from~to, projectId 필터 여부를 알려주세요. (예: `acme`, `2026-05-07 ~ 2026-05-14`, projectId 미선택)
- *왜 묻는지*: 후보 가설 중 어느 것이 맞는지 좁히려면 실제 데이터로 양쪽 API 응답을 비교해봐야 합니다. 동일 (org, from, to, projectId) 조합을 알아야 의미 있는 비교가 됩니다.

### Q2. skills 페이지에서 보이는 항목의 정체
skills 페이지에 표시되는 행 중 다수가 다음 중 어떤 형태인가요? (복수 선택 가능)
- (a) `Skill` tool 로 실제 호출된 항목 (events 테이블의 `is_skill_call = true` 레코드 — 예: 모델이 자율적으로 호출한 skill)
- (b) 사용자가 `/skill-name` 같은 slash command 를 친 항목 (transcript messages 에서 정규식으로 추출 — Skill tool 호출이 동반되지 않는 경우)
- (c) 둘 다 섞여 있음 / 구분 모르겠음
- *왜 묻는지*: 백엔드 코드를 읽어보면, **skills API 는 events ∪ messages-slash 를 UNION 으로 합치는데, overview API 는 daily_rollups 의 `skillCounts` 만 본다.** 그리고 daily_rollups 의 `skillCounts` 는 `events` 의 `is_skill_call=true` 만 카운트한다 (`packages/web/src/lib/server/daily-rollup.ts` L150–159). 즉 skills 페이지가 (b) 만으로 데이터를 채우고 있다면 overview 의 빈 화면은 "설계대로" 인 셈이고, 수정 방향이 달라진다.

### Q3. 기대하는 정합성 정의 (수용 기준의 핵심)
이 버그의 "고쳐졌다" 는 어떤 상태인가요? 가장 가까운 것을 골라주세요.
- (a) **완전 일치**: skills 페이지의 Top 10 (skillName, callCount) 과 overview 의 "Skill별 호출 빈도" 상위 10개가 같은 (orgSlug, from, to, projectId) 에서 **개수·순서·카운트까지 동일**해야 한다.
- (b) **포함 관계**: overview 의 Top 10 이 skills 페이지에 보이는 전체 skill 집합의 부분집합이면 된다 (카운트는 약간 다를 수 있음 — 예: rollup 지연 허용).
- (c) **비어있지만 않으면 됨**: overview 에 최소 한 개 이상 표시되면 OK. 숫자 차이는 추후 별도 task.
- (d) 기타: ____
- *왜 묻는지*: (a) 를 고르면 백엔드 두 쿼리 중 하나를 다른 쪽 정의로 맞춰야 하고 (가장 큰 작업), (b)/(c) 면 overview 쪽만 살짝 보정해도 됨. 작업 범위가 크게 달라진다.

### Q4. 어느 쪽이 "정답" 인가
Q3 와 짝. skills 페이지의 정의 vs overview 의 정의 중 어느 쪽이 진실에 가까운가?
- (a) **skills 페이지가 정답**: slash command 도 skill 호출로 포함시키는 것이 사용자 멘탈 모델. overview 도 같은 UNION 정의를 써야 한다 → daily_rollups 빌더 또는 overview 쿼리에서 messages-slash 도 합산하도록 변경.
- (b) **overview 가 정답**: 진짜 Skill tool 호출 (`is_skill_call=true`) 만 세는 게 맞다. skills 페이지가 slash command 까지 합치고 있는 게 오히려 과집계 → skills 페이지 쿼리를 좁힌다.
- (c) **둘 다 유효한 다른 지표** 라서, overview 카드 제목/설명을 "Skill tool 호출 빈도 (slash 제외)" 로 명확히 하고 카운트 정의를 분리한다.
- (d) 기타: ____
- *왜 묻는지*: 데이터 의미론 결정이라 코드만 보고 우리가 정할 수 없음. 제품 의도를 먼저 확정해야 한다.

### Q5. daily_rollups 백필/지연이 원인일 가능성
overview 는 `daily_rollups` 라는 일일 사전집계 테이블을 읽는다. 만약 영향받는 기간이 **오늘** 을 포함하면, 아직 rollup 이 안 빌드돼서 빈 것일 수도 있다.
- (a) 증상이 보이는 기간이 **오늘만 포함** 한다 → rollup 지연 가설이 유력
- (b) 어제~지난주 등 **rollup 이 충분히 빌드됐을 과거 기간** 에서도 동일하게 빈 화면 → 지연 가설 기각, 데이터 소스 비대칭 가설 유력
- (c) 모르겠음 — 둘 다 시도해보지 않음
- *왜 묻는지*: (a) 면 fix 는 "오늘 부분은 실시간 events 조회로 합성", (b) 면 위 Q4 방향으로 진짜 수정 필요. 진단 분기점.

### Q6. 작업 범위 (out of scope 확정)
이번 task 에서 같이 처리할 / 처리하지 않을 항목을 골라주세요.
- (a) overview 의 **다른 카드** (Token usage by model, Top users, Recent sessions 등) 에서도 비슷한 데이터 소스 비대칭이 있을 수 있는데, 이 task 에서 같이 점검? → **Yes / No**
- (b) skills 페이지의 **"Median duration" 컬럼** 도 비어 보이는 등의 부가 버그가 있는데, 이번에 같이 → **Yes / No**
- (c) **테스트 추가** (`daily-rollup.test.ts` 류) 도 이 task 의 수용 기준에 포함 → **Yes / No**
- (d) **DB 마이그레이션** (예: `daily_rollups.skillCounts` 정의 변경 + 과거 데이터 백필) 이 필요해도 이 task 에서 → **Yes / No**
- *왜 묻는지*: Q4 의 답이 (a) 라면 (d) 가 자동으로 yes 가 될 가능성이 높음. 범위가 task 의 크기를 결정한다.

### Q7. 1차 행위자와 트리거 (Cockburn 유스케이스 채우기용)
- 이 카드를 보러 오는 주 행위자는? (예: org OWNER, MEMBER, 본인만)
- 트리거는? (overview 페이지 진입 / 날짜 범위 변경 / 프로젝트 필터 변경 중 어느 시점에 카드가 갱신돼야 하는지)
- *왜 묻는지*: 유스케이스 사전조건/트리거를 채우려면 명시 필요. 권한 모델은 기존 dashboard 와 동일하다고 가정해도 되는지 확인.

---

## 후보 원인 가설 (참고용, 코드 읽고 추린 것)

> Q4–Q5 답에 따라 다음 중 어느 쪽이 진짜 원인인지 확정된다.

1. **데이터 소스 비대칭 (가장 유력)**.
   - skills API (`/api/orgs/[orgSlug]/dashboard/skills/route.ts`): `events.is_skill_call = true` UNION `messages` 의 `<command-name>/...</command-name>` 정규식 매칭을 합쳐 집계.
   - overview API (`/api/orgs/[orgSlug]/dashboard/overview/route.ts` → `aggregateSummary` → `daily_rollups.skillCounts`): `daily_rollups` 빌더 (`daily-rollup.ts` L150–159) 가 **`events.isSkillCall=true` 만** 카운트.
   - 결과: slash command 위주의 org 에서는 skills 페이지엔 보이지만 overview 엔 0건이 정상 동작.

2. **rollup 빌드 지연**. `daily_rollups` 가 야간 배치라면, 오늘 데이터는 overview 에 안 나옴. skills 페이지는 실시간 쿼리라 즉시 보임.

3. **SkillFrequencyChart 의 empty state 조건**. 확인 결과 단순히 `chartData.length === 0` 이라 무해함. 가설에서 사실상 기각.

4. **`projectId` resolve 동작 차이**. 두 라우트 모두 `resolveOrgScopedProjectIds` 를 쓰지만, `summary.topSkills` 가 빈 배열로 직렬화되는 경로가 있을 수 있음 (예: rollup 이 그 projectId 범위에 한 row 도 없는 경우). 가능성 낮지만 Q1 응답으로 확인.

5. **`hasNoData` 가드의 부작용 아님**. overview 페이지의 `hasNoData` (`sessionCount===0 && activeUserCount===0`) 는 이미 통과한 상태에서 SkillFrequencyChart 만 빈 거라 했으므로, 가드 자체는 무관.

## 추정 영향 파일 (수정 후보)

- `packages/web/src/app/api/orgs/[orgSlug]/dashboard/overview/route.ts`
- `packages/web/src/lib/server/daily-rollup.ts` (특히 `aggregateSummary`, `topSkills`, rollup 빌더의 `skillGroups` 부분)
- `packages/web/src/app/api/orgs/[orgSlug]/dashboard/skills/route.ts` (정의를 좁히는 방향으로 갈 경우)
- `packages/web/src/components/dashboard/skill-frequency-chart.tsx` (empty state 카피만 손볼 경우)
- `packages/shared/.../DashboardSummary` 타입 (topSkills 정의 변경 시)

## 메모 (메인 세션 참고)

- 라운드 1. 다음 라운드에서 Q1–Q5 답을 받으면 거의 finalize 가능할 것으로 보임. Q6/Q7 은 가벼움.
- 유력 가설(데이터 소스 비대칭) 이 맞다면, task 가 "한 줄 SQL 수정" 이 아니라 **rollup 빌더 + 과거 백필** 까지 번질 수 있음. Q6(d) 응답 주의.
