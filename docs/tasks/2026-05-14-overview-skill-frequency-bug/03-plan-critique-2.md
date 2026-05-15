# Plan Critique — Round 2

critical 있음: 1건.

## 이슈

- **severity: critical** | 위치: Decision-3, WU-9, QA 1/5
  - 한 줄 설명: oneshot 스크립트 실행 중 또는 직후 old code 요청이 들어오면 옛 정의로 `upsert` 되고 `computedAt` 이 새로 찍혀 새 가드가 stale 을 놓칠 수 있다.
  - 권고: 스크립트 실행 순서를 "new code 배포 완료 후" 로 고정. 실행 중 old writer 차단 또는 advisory lock / maintenance flag. 최소한 final invalidation sweep 을 한 번 더 돌리는 runbook 을 plan 에 명시.

- **severity: major** | 위치: 아키텍처/접근 선택, WU-3, WU-9
  - 한 줄 설명: cache invalidation 조건이 `skillCounts === '{}' && computedAt < THRESHOLD` 인지 `computedAt < THRESHOLD` 단독인지 문서 내에서 서로 다르다. 전자는 스크립트 미실행 old row 를 못 잡는다.
  - 권고: 가드는 `computedAt < SKILL_COUNTS_INVALIDATION_AT` 단독으로 통일하거나, 스크립트 필수 실행 전제로 QA 5 항목 제거.

- **severity: major** | 위치: WU-1, Decision-2
  - 한 줄 설명: `skillCallRowsCte` 가 "CTE pair" 를 반환한다고 했지만 SQL 문법상 relation fragment 인지 CTE definition fragment 인지 불명확.
  - 권고: 하나로 고정. 예: `skillCallRowsRelation(...)` 가 `SELECT ... UNION ALL SELECT ...` relation expression 만 반환하고, caller 가 `WITH skill_call_rows AS (${fragment})` 로 감싼다.

- **severity: major** | 위치: 병렬 실행 그룹 Group C, WU-4~WU-7, Decision-6
  - 한 줄 설명: 테스트 WU 들이 동일 fixture 를 공유 가능하다고만 되어 있어 여러 worker 에 병렬로 던지면 fixture helper 생성/수정 권한이 충돌하거나 중복 구현될 수 있다.
  - 권고: fixture helper 를 별도 선행 WU 로 분리하거나, Group C 각 WU 는 독립 fixture 를 파일 내부에 둔다고 명시.

- **severity: major** | 위치: WU-3, Decision-4
  - 한 줄 설명: `aggregateSummary` overload/type narrowing 계약이 구현자별로 흔들릴 수 있고, weekly-report 의 positional `10` 이 topSkills/topAgents 모두 10 을 유지해야 한다는 호환 의미가 충분히 강제되지 않는다.
  - 권고: TS overload 명시. `aggregateSummary(rollups, topN?: number)` 와 `aggregateSummary(rollups, opts?: AggregateSummaryOptions)`. 내부 `normalizeAggregateSummaryOptions` 로 변환, number 는 두 N 모두에 적용된다고 테스트.

- **severity: minor** | 위치: WU-2, WU-3, `parseDateRange` 경계
  - 한 줄 설명: helper 는 `[from, to)` 로 바꾸지만 현재 date-only `to` 는 `23:59:59.999` 로 보정되므로 skills route 의 `< to` 와 rollup 의 full-day 계산이 마지막 millisecond 에서 어긋날 수 있다.
  - 권고: date-only `to` 를 next-day midnight exclusive 로 변환하는 경로까지 포함하거나, route/helper 호출 전에 `toExclusive` 를 만드는 공통 helper 추가.

- **severity: minor** | 위치: WU-9 검증 방법
  - 한 줄 설명: "두 번째 실행 → 0 또는 같은 수" 는 멱등 검증 기준으로 너무 느슨하다.
  - 권고: 전체 reset 방식이면 같은 수, `WHERE computed_at < threshold` 방식이면 0 이 정상이라고 하나로 결정하고 그 기준만 검증.
