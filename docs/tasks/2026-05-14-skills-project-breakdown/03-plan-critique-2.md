# Plan Critique 2 — 2026-05-14-skills-project-breakdown

critical 없음.

## Issues

### 1. severity: major
- **위치(plan 섹션)**: S13 (검증 시나리오 — 페이로드 크기 회귀)
- **한 줄 설명**: latency 비교식이 반대로 쓰였다. `변경 전 median ≤ 변경 후 median × (1/1.20)` 는 변경 후가 20% 이상 느려져도 통과할 수 있다.
- **권고 수정**: `변경 후 median <= 변경 전 median * 1.20` 으로 고치고, 문구도 "changed/baseline <= 1.2" 로 명시.

### 2. severity: major
- **위치(plan 섹션)**: WU-3 SQL 초안 / 아키텍처 결정
- **한 줄 설명**: `all_skill_calls` 를 그대로 쓴다고 설명하지만 실제 SQL 초안은 `skill_events` 내부 alias라 재사용 불가하고, project breakdown에서 union을 다시 수행한다. 성능 회귀 측정 대상인 CTE를 중복 실행할 위험이 있다.
- **권고 수정**: `all_skill_calls AS (...)` 를 독립 CTE로 올리고 `skill_events`, `skill_project_aggregates` 가 모두 그 CTE를 참조하도록 수정.

### 3. severity: major
- **위치(plan 섹션)**: WU-5 셀 DOM 구조
- **한 줄 설명**: `additionalProjectCount === 0` 인 행에서 팝오버 트리거를 숨길 수 있다고 되어 있어, project가 1~5개인 일반 행은 상세 팝오버를 열 수 없는 구현으로 흐를 수 있다.
- **권고 수정**: project가 1개 이상이면 항상 sibling popover trigger를 렌더하도록 고정. `+N more` 는 추가 count가 있을 때만 라벨에 붙이고, 없을 때는 아이콘/"Details" affordance를 사용.

### 4. severity: minor
- **위치(plan 섹션)**: 아키텍처 선택, WU-4, Decision-3
- **한 줄 설명**: `openOnHover` 위치가 `Popover.Trigger` prop인지 `Popover.Root` prop인지 문서 내부에서 서로 다르다.
- **권고 수정**: 확인된 타입 정의 기준(`Popover.Trigger` prop) 으로 한 곳만 남긴다. WU-4의 구현 계약과 Decision-3의 API 설명을 동일하게 맞춘다.

### 5. severity: minor
- **위치(plan 섹션)**: WU-3 SQL 초안 (FILTER+ORDER BY 코멘트)
- **한 줄 설명**: PG aggregate `ORDER BY + FILTER` 근거를 "Decision-8"에 명시한다고 되어 있지만 실제 결정은 Decision-10이다.
- **권고 수정**: `Decision-10` 으로 참조 수정.
