# Plan Critique — Round 1

critical 없음.

## 이슈

- **severity: major** | 위치: 아키텍처/접근 선택, WU-3, Decision-3
  - 한 줄 설명: `schemaVersion` 가드라고 부르지만 실제로는 `computedAt < SKILL_COUNTS_SCHEMA_AT` 프록시라서 배포 전후 경계에서 old-definition row 가 stale 판정을 피할 수 있다.
  - 권고 수정: 실제 `skillCountsSchemaVersion` 저장소를 두거나, 최소한 기존 `daily_project_stats` 대상 row 를 명시적으로 invalidate/delete 하는 결정으로 바꾸고 "schemaVersion" 표현을 제거한다.

- **severity: major** | 위치: WU-5, Negative Space 재확인, Decision-4
  - 한 줄 설명: `aggregateSummary(rollups, 5)` 를 10 으로 바꾸면 `topSkills` 뿐 아니라 `topAgents` 등 다른 카드 응답도 바뀌어 Negative Space 와 충돌한다.
  - 권고 수정: `aggregateSummary` 가 `topSkillsN` 과 `topAgentsN` 을 분리 받도록 하거나, overview route 에서 `topSkills` 만 10 으로 재계산/확장한다.

- **severity: major** | 위치: WU-1, WU-2, Decision-2
  - 한 줄 설명: helper 인터페이스가 `{ skillName, callCount }` 집계 함수와 CTE fragment 공유를 동시에 요구해 SQL 단일 출처의 실제 계약이 불명확하다.
  - 권고 수정: row-level CTE helper 를 먼저 정의. 예: `skillCallRowsCte({ projectIds, from, to })` 가 `project_id, session_id, user_id, skill_name, created_at, source` 를 제공하고, skills route 와 rollup 이 각자 그 위에서 집계한다.

- **severity: major** | 위치: WU-4, 검증 시나리오 자동
  - 한 줄 설명: 실DB/testcontainers 필요성을 인정하면서도 구현 단계 결정으로 미뤄 테스트 전략이 확정되지 않았다.
  - 권고 수정: plan 단계에서 "기존 테스트 DB 인프라 사용" 또는 "testcontainers 추가" 또는 "SQL helper integration test 생략" 중 하나를 명시 결정.

- **severity: major** | 위치: 개요, WU-3, 검증 시나리오 QA
  - 한 줄 설명: M1 은 순서까지 완전 일치인데 tie-break 정렬 기준이 정의되지 않았다.
  - 권고 수정: skills route 의 `ORDER BY` 와 `aggregateSummary` 정렬을 동일하게 맞추고, 동률 시 `skillName ASC` 같은 deterministic tie-break 를 명시.

- **severity: major** | 위치: Decision-6, 검증 시나리오 QA 5
  - 한 줄 설명: weekly-report 영향은 수용한다고 했지만 자동 회귀 가드가 없어 "다른 컬럼은 변하지 않아야 함" 을 수동 QA 에만 의존한다.
  - 권고 수정: weekly-report summary fixture 또는 rollup 기반 단위 테스트로 skill 관련 값만 변하고 다른 summary 필드는 유지되는 최소 테스트 추가.

- **severity: minor** | 위치: WU-1, WU-3
  - 한 줄 설명: `from/to` 경계가 inclusive 인지 half-open 인지 명시되지 않아 일 단위 rollup 에서 자정 중복 카운트 위험.
  - 권고 수정: 모든 helper 계약을 `[from, to)` UTC half-open interval 로 고정하고 skills route 도 동일 조건.

- **severity: minor** | 위치: WU-2
  - 한 줄 설명: "기존 skills 페이지에서 수동 확인" 은 리팩터 회귀 검증으로 약하다.
  - 권고 수정: 기존 skills route SQL 결과와 helper 기반 결과가 동일한 fixture 테스트 또는 route-level snapshot/contract 테스트.

- **severity: minor** | 위치: Decision Log
  - 한 줄 설명: ADR 승격 여부가 기록되지 않았고, skill-call 정의 변경은 dashboard/weekly-report 공통 지표 의미를 바꾸는 장기 결정이다.
  - 권고 수정: Decision-1/2/6 을 ADR 후보로 표시하고, 승격 기준 명시.

## 집중 영역별 판정

1. work unit 분할 명확성: 부분 적합. WU-1/WU-2 helper 계약이 흔들림.
2. 병렬 그룹 파일 충돌: 대체로 적합. WU-5 가 다른 카드 의미를 바꾸는 논리 충돌.
3. Decision Log ADR 승격 가능성: 미흡.
4. 검증 시나리오: 미흡 (schemaVersion 가드, 실DB 테스트, weekly-report 회귀 모두 불완전).
5. UNION SQL helper 인터페이스: 미흡 (집계 함수 vs CTE fragment 경계 불명확).
6. Negative Space 보존: 미흡 (`aggregateSummary` N 변경이 다른 카드에 영향).
