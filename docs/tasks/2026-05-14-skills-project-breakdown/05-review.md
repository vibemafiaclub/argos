다음은 현재 브랜치 변경사항(`worktree-dynamic-shimmying-kazoo` — open PR 없음, unstaged diff)에 대한 리뷰입니다. ADR-023~ADR-029 와의 일관성도 함께 점검했습니다.

# 리뷰: skills × project 분포 컬럼 추가

## 변경 개요
- `dashboard/skills` API: `all_skill_calls` CTE 승격 + `skill_project_aggregates`/`_ranked`/`_breakdown` 3단 CTE 추가, 응답에 `projects_json` / `total_project_count` 동봉.
- `dashboard.ts` (shared): `SkillProjectEntry`, `SkillStat.projects`, `additionalProjectCount` 추가.
- `dashboard-row-mapping.ts`: `parseProjectsJson` 방어 파서, mapper에서 `additionalProjectCount = max(0, total - projects.length)`.
- `skill-projects-cell.tsx`: 신규 셀 — inline 버튼 + base-ui Popover (hover 보강), `isProjectFiltered` 시 disabled.
- `popover.tsx`: shadcn 톤 base-ui Popover wrapper.
- `skills/page.tsx`: 컬럼 추가 + `setProjectIdQuery` 쿼리 갱신 핸들러.

## 정확성 / 잠재 이슈

- **`skill_events` 외부 ORDER BY가 ADR-024 위반.** `route.ts:185` 가 `ORDER BY e.call_count DESC` 단일 키. 같은 task 의 ADR-024는 "metric DESC, name ASC, id ASC" 3단 tiebreaker를 표준으로 못 박았는데, 정작 이번 변경의 최상위 정렬이 그 표준을 안 지킴. `e.call_count DESC, e.skill_name ASC` 로 수정 필요. (skill_name이 사실상 id)
- **`SkillProjectsCell`의 `truncate` + flex children 조합이 ellipsis로 동작하지 않음.** `skill-projects-cell.tsx:68` `truncate flex items-center` 부모 + 자식들이 `whitespace-nowrap`이라, viewport 좁아져 overflow가 일어나도 inline 버튼들이 잘리기만 하고 `…` 가 찍히지 않음. ADR-026("CSS truncate 표준") 의도와 어긋남. 두 가지 선택:
  - inline 영역을 `block` + `truncate`로 두고 자식들을 inline span으로 (현재 button 클릭성 유지하려면 wrapper로 감쌈).
  - 또는 콤마-join 텍스트를 `truncate`된 한 노드로 두고, 개별 project 클릭은 팝오버 안에서만 노출(요약은 표시-only로 단순화).
- **`isProjectFiltered` 분기에서 `<button disabled>` 가 의미 없는 noop 컨트롤.** `skill-projects-cell.tsx:50-57` 클릭 가능한 affordance(밑줄/색)도 없고 비활성 button. 그냥 `<span>` 이면 충분 — DOM 의미상 더 정확하고 a11y 노이즈 감소.
- **`additionalProjectCount` 가 mapper 방어 폴백과 결합되면 과대표시.** `parseProjectsJson` 이 잘못된 shape 를 drop 하면 `total - 0 = total` 이 그대로 노출(테스트도 그렇게 단언). 정상 동작에선 발생하지 않지만, 만약 한 entry라도 깨지면 "+12 more" 같은 거짓 메시지가 뜸. fallback 시 telemetry/console.warn 한 줄이라도 남기는 게 디버깅 친화적.
- **`skill_project_aggregates` WHERE 가 redundant.** `route.ts:129` `sc.project_id = ANY(${projectIds})` 는 base CTE 가 이미 가드. 주석에서 "명시적 재가드"라고 의도를 밝혔는데 — 의도로는 OK이나, base CTE 의 가드가 사라지면 같이 깨지는 실제 안전망 역할은 못함(coupling). 진짜 격리는 `JOIN projects ... AND p.org_id = ${access.org.id}` 하나로 충분. 코드 noise는 의식적으로 둔 것이긴 한데 정당화가 약함.
- **`message_slash_calls` 의 slash command 정규식과 mapper 의 timestamp 직렬화 일관성** — 양쪽 모두 ISO UTC string으로 통일됨. 좋음.

## ADR ↔ 코드 일관성

| ADR | 점검 결과 |
|---|---|
| **ADR-023** (window function Top-N) | 적용됨 — `skill_project_ranked` 의 `ROW_NUMBER() OVER (PARTITION BY skill_name ...)`. ✅ |
| **ADR-024** (정렬 tiebreaker `metric DESC, name ASC, id ASC`) | **부분 위반** — `skill_project_ranked` / `json_agg ORDER BY` 는 준수 (`invocations DESC, project_name ASC, project_id ASC`)지만, **외부 `skill_events` ORDER BY는 단일 키**. 같은 PR 내에서 표준 채택 + 위반이 동시 존재. |
| **ADR-025** (base-ui Popover, click/focus 기본 + hover 보강) | 적용됨 — `Popover.Trigger openOnHover` + click/focus 기본. ✅ 단, hover 트리거는 데스크탑 마우스 전용이므로 `delay/closeDelay` 값이 ADR엔 표준화돼 있지 않음 — 후속 ADR/패턴 정리 여지. |
| **ADR-026** (CSS truncate) | **부분 위반** — JS substring은 안 씀(좋음)이나, `truncate` 가 flex children 위에서 실제로 동작하지 않음(위 항목). 의도는 ADR이지만 결과가 다름. |
| **ADR-027** (Top-N + `additional<X>Count` 서버 계산) | 적용됨 — `additionalProjectCount` 명명 규약·서버 계산 모두 준수. ✅ |
| **ADR-028** (변경 전/후 10회 median 비교) | 코드로 검증 불가 — diff에 측정 결과 보고서가 없음. evaluate 단계 산출물이 따로 있다면 OK. |
| **ADR-029** (`json_agg(... ORDER BY ...) FILTER (WHERE rn <= N)` + ISO8601 `to_char`) | 적용됨 — 형식·timezone·non-null COALESCE 모두 준수. ✅ ADR-023 본문은 "PG14+", ADR-029 본문은 "PG 11+" 라 서로 살짝 어긋나는데, 둘 다 사용 문법은 PG 11+에서 안전 — 사소한 문서 불일치. |

## 보안 / 권한
- **org 격리는 이중 가드(base CTE projectIds + JOIN p.org_id).** OK.
- 신규 raw SQL은 모두 Prisma `$queryRaw` 템플릿으로 파라미터화 — injection 위험 없음.
- `projects.name` 이 응답 페이로드에 포함되지만, projectIds 가 `resolveOrgScopedProjectIds` 를 통과한 것만 노출되므로 RBAC 일관됨.

## 테스트
- mapper 단위테스트 5케이스 (null / 정상 3·5건 / 잘못된 shape) — 매우 좋음.
- **누락**: SQL 동작에 대한 통합 테스트 0. ADR-024 tiebreaker 의 결정성, `projects.length === 5` cap, `additionalProjectCount = total - 5` 계약을 회귀로 잡으려면 fixture 기반 통합 테스트 1~2개 권장.
- **누락**: `SkillProjectsCell` 의 a11y/상호작용 테스트 (popover 열림, disabled 상태, +N more 표기) 없음.
- **누락**: ADR-028 perf 측정 결과 — diff에서 확인 불가. evaluate 보고서에 수치 첨부됐는지 별도 확인 필요.

## 성능
- `all_skill_calls` 를 독립 CTE로 승격해 union 중복 제거 — 좋은 변경.
- `skill_project_aggregates` 가 `JOIN projects` 추가하지만 50개 skill × 평균 N 프로젝트 규모면 무시 가능.
- 응답 크기 증가는 skill당 Top5 + count = ~600B 수준. ADR-028 sanity bound (40KB) 안.

## 권장 액션 (우선순위)
1. **(must)** `route.ts:185` 외부 ORDER BY에 `e.skill_name ASC` 추가 — ADR-024 자기준수.
2. **(must)** `SkillProjectsCell` 요약 영역 truncate 동작 수정 — 현재 ellipsis가 안 찍힘.
3. **(should)** `isProjectFiltered` 분기의 `<button disabled>` → `<span>` 로 변경.
4. **(nice)** mapper의 shape-drop 발생 시 console.warn 한 줄, 또는 telemetry hook.
5. **(nice)** ADR-023 본문 "PG14+" 표현을 "PG 9.4+" 또는 ADR-029 와 통일.
6. **(nice)** SkillProjectsCell 컴포넌트 테스트 + SQL 결정성 회귀 테스트 1~2개 추가.
7. **(verify)** ADR-028 perf 측정 수치가 evaluate 보고서에 기록됐는지 확인.
