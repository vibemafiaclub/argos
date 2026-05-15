# Plan Critique 1 — 2026-05-14-skills-project-breakdown

critical 이슈는 없음.

## Issues

### 1. severity: major
- **위치(plan 섹션)**: 개요, WU-3, WU-5, 검증 시나리오 S4/S7
- **한 줄 설명**: 명세는 호버 시 "풀 분포"를 요구하지만 plan 의 SQL/API/UI 는 Top 5 만 다룬다.
- **권고 수정**: 명세를 "Top 5 + additionalProjectCount"로 낮추거나, full breakdown 필드를 별도 추가하고 R3 페이로드 기준을 재산정한다.

### 2. severity: major
- **위치(plan 섹션)**: WU-5, Decision-3, Decision-7
- **한 줄 설명**: hover 중심 Popover 는 모바일/터치와 키보드 접근성 검증이 부족하다.
- **권고 수정**: 명시적 click/focus trigger 를 기본으로 두고, Escape/outside click/터치 탭/키보드 선택 QA 를 추가한다.

### 3. severity: major
- **위치(plan 섹션)**: WU-5
- **한 줄 설명**: 셀 전체 `Popover.Trigger` 내부에 project `<button>`을 넣으면 nested interactive element 위험이 있다.
- **권고 수정**: popover trigger 와 project 버튼을 형제 구조로 분리한다.

### 4. severity: major
- **위치(plan 섹션)**: WU-3
- **한 줄 설명**: PG `json_build_object` timestamp 출력이 JS `Date.toISOString()` 형식이라는 가정이 불안정하다.
- **권고 수정**: SQL 에서 ISO 문자열로 명시 변환하거나 mapper 가 string/Date 를 ISO 로 정규화하게 한다.

### 5. severity: major
- **위치(plan 섹션)**: 병렬 실행 그룹, WU-2, WU-7
- **한 줄 설명**: WU-7 이 같은 테스트 파일을 수정한다고 쓰면서 별도 WU 가 아니라고 해 충돌 분석이 불일치한다.
- **권고 수정**: WU-7 을 삭제하거나 WU-2 하위 체크리스트로 완전히 병합한다.

### 6. severity: major
- **위치(plan 섹션)**: 검증 시나리오 S13, Decision-8
- **한 줄 설명**: 성공 기준은 P95 +20%인데 plan 은 baseline 부재 시 Content-Length < 40KB 로 대체한다.
- **권고 수정**: 변경 전/후 로컬 latency 비교 절차를 추가하고 Content-Length 는 보조 지표로 둔다.

### 7. severity: minor
- **위치(plan 섹션)**: WU-3
- **한 줄 설명**: `projects p` 는 이름 조회에 필요하지만 `p.org_id` 방어 조건이 없다.
- **권고 수정**: `p.id = sc.project_id AND p.id = ANY(...)` 를 명시하고, 가능하면 `p.org_id = org.id` 도 JOIN 조건에 추가한다.

### 8. severity: minor
- **위치(plan 섹션)**: WU-3
- **한 줄 설명**: `json_agg(... ORDER BY ...) FILTER (...)` 는 PG 호환 문법이지만 근거가 plan 에 없다.
- **권고 수정**: Decision Log 에 PG aggregate `ORDER BY` + `FILTER` 조합을 사용한다고 명시한다.

### 9. severity: minor
- **위치(plan 섹션)**: WU-2, WU-3
- **한 줄 설명**: `projects_json` nullable 처리가 SQL 과 mapper 양쪽에 중복되어 책임 경계가 흐리다.
- **권고 수정**: SQL 최종 SELECT 는 non-null 보장, mapper null fallback 은 방어 로직이라고 구분한다.

### 10. severity: minor
- **위치(plan 섹션)**: Decision-3, WU-4
- **한 줄 설명**: `@base-ui/react/popover` import path 와 `openOnHover` prop 존재 근거가 부족하다.
- **권고 수정**: 구현 전 타입 정의 또는 공식 docs 확인을 WU-4 선행 검증으로 추가한다.

### 11. severity: minor
- **위치(plan 섹션)**: WU-6
- **한 줄 설명**: project 선택 시 기존 `from`/`to` query 보존 규칙이 충분히 명확하지 않다.
- **권고 수정**: `new URLSearchParams(searchParams.toString())` 로 기존 query 를 보존하고 `projectId` 만 set 한다고 명시한다.

### 12. severity: minor
- **위치(plan 섹션)**: Decision Log, 검증 시나리오
- **한 줄 설명**: R1/R2 는 확정값이 일관되지만 R3 는 P95 기준과 대체 기준이 섞여 있다.
- **권고 수정**: R3 를 변경 전/후 로컬 비교로 확정하거나 성공 기준 6 을 낮춰 문서 간 기준을 맞춘다.
