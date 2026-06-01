# Clarify Round 1 — skills-project-breakdown

## 현재까지의 이해

org 단위 `/dashboard/[orgSlug]/skills` 페이지는 `SkillStat[]` 를 테이블로 보여준다 (skill 이름 + invocations / sessions / users / median duration / last used). `projectId` 가 URL 쿼리에 있으면 그 project 로 *필터* 만 적용되고, "이 skill 이 어떤 project 들에서 쓰였는가" 의 분포는 어디에도 표시되지 않는다.

데이터 측면에서 `events.project_id`, `claude_sessions.project_id` 가 이미 존재하므로 skill × project 분포는 SQL 한 번에 만들 수 있다 (`packages/web/src/app/api/orgs/[orgSlug]/dashboard/skills/route.ts` 의 CTE 에 project_id 를 끼워넣는 형태).

핵심 결정 포인트는 (a) UI 형태 — 인라인 컬럼 vs drill-down vs 확장 행, (b) 분포 표현 — 단순 project 개수 / Top-N 이름 / 전체 분포 막대, (c) 정렬·표시 한도, (d) 권한·프라이버시 (멤버가 아닌 project 의 이름도 노출해도 되나), (e) projectId 필터가 활성일 때의 동작.

## 질문 (한 묶음)

### Q1. UI 형태 — 어디에 노출할지

skill 별 project 분포를 어디에 보여줘야 가장 자연스러운가?

옵션:
- (a) **테이블에 컬럼 추가**: 기존 "All skills" 테이블에 "Projects" 컬럼을 추가. 셀에는 요약(예: project 개수 + 상위 1~2개 이름)이 들어가고, 호버/클릭으로 상세 보기.
- (b) **행 확장 (expandable row)**: 각 skill 행을 클릭하면 그 아래로 project 별 분포(이름 + invocations + last used)가 펼쳐진다.
- (c) **별도 섹션**: 페이지 하단에 "Skills × Projects" 라는 매트릭스/히트맵 또는 누적 막대 차트를 따로 둔다.
- (d) **drill-down 페이지**: skill 이름 클릭 시 `/skills/<skillName>` 같은 별도 페이지로 이동, 거기서 project 분포 + 시계열을 본다.

(묻는 이유: 정보 밀도 vs 클릭 코스트 vs 구현 범위가 옵션마다 크게 다르고, 한번 정하면 데이터 응답 모양과 컬럼 width 가 결정된다. 복수 선택 가능 — 예: "(a) + 호버 시 (c) 형태의 상세".)

### Q2. 분포 표현 — 어디까지 보여줄지

선택한 UI 영역에 실제로 어떤 정보를 보여줄 것인가?

옵션:
- (a) **count 만**: "쓰인 project 수: 3" 처럼 distinct project 개수만.
- (b) **Top-N 이름**: invocations 기준 상위 N 개 project 이름 (예: "argos-web, argos-cli (+2 more)"). N 은 2~3.
- (c) **전체 분포**: 각 project 별 invocations 비율을 가로 누적 막대 또는 작은 sparkline 으로 시각화.
- (d) **(b) + (c) 조합**: 상위 N 이름은 텍스트로, 풀 분포는 호버/확장 시 표시.

(묻는 이유: SQL group by 형태와 응답 페이로드 크기, 그리고 테이블 가로 폭이 결정된다. skill 50개 × project N개 면 페이로드가 빠르게 커진다.)

### Q3. project 식별자 — 이름인가 slug 인가, 그리고 링크 동작

분포에 노출되는 project 식별자는 어떤 형태이고, 클릭 시 어디로 이동해야 하나?

옵션:
- (a) **project name 텍스트만** (링크 없음).
- (b) **project name + 클릭 시 해당 project 필터 적용된 skills 페이지** (`?projectId=<id>` 로 같은 페이지 reload, 기존 필터 동작 재활용).
- (c) **project name + 클릭 시 해당 project 의 overview 페이지로 이동** (`/dashboard/<orgSlug>/overview?projectId=<id>`).

(묻는 이유: 기존 dashboard 의 project 링크 관행(`overview?projectId=...`)과 일치시킬지, 아니면 skills 컨텍스트를 유지할지가 UX 일관성 결정.)

### Q4. `projectId` 필터가 이미 걸려 있을 때의 동작

URL 에 `?projectId=<X>` 가 이미 있어 단일 project 로 필터된 상태라면, "skill 별 project 분포" 는 무엇을 보여줘야 하나?

옵션:
- (a) **숨김**: 이미 단일 project 로 한정되어 있으므로 분포 컬럼/섹션 자체를 안 보여준다.
- (b) **그대로 표시하지만 항상 1개로 단일화**: count = 1, 이름 = 그 project. 시각적으로는 disabled.
- (c) **필터 무시하고 org 전체 분포 표시**: 사용자가 "이 skill 은 다른 project 들에서도 얼마나 쓰이는지" 비교할 수 있게.

(묻는 이유: 페이지 단일성 vs 비교 기능. 보통 (a) 가 자연스럽지만, 사용자가 "이 skill 은 우리 org 의 어느 project 들에 퍼져 있나" 를 보고 싶으면 (c) 가 필요.)

### Q5. 권한·프라이버시 — 멤버가 아닌 project 의 노출

org 안에 사용자가 멤버가 아닌 project 가 있을 수 있다. 그런 project 가 어떤 skill 을 호출했을 때, 이 사용자의 화면에 그 project 이름을 노출해도 되나?

옵션:
- (a) **노출하지 않음 (현 RBAC 유지)**: `resolveOrgScopedProjectIds` 가 이미 사용자가 접근 가능한 project 들로만 한정하므로, 분포도 그 안에서만 나온다. 즉 "현재 보이는 skill 별 invocations 총합 = 분포 합" 이 보장된다.
- (b) **익명 버킷으로 합산**: 접근 권한 없는 project 들의 호출은 "Other (N projects)" 같은 익명 버킷으로 합산해 표시.
- (c) **OWNER/ADMIN 한정 노출**: 권한 있는 사용자(역할 OWNER, ADMIN)에게만 모든 project 이름을 보여주고, 일반 MEMBER 에게는 (a).

(묻는 이유: 현재 dashboard 전반의 권한 모델이 (a) 인 것으로 보이지만, 이 task 가 그 정책에 새로운 표면을 추가하므로 명시 컨펌이 필요. 기본은 (a) 라고 가정해도 되는지.)

### Q6. 정렬·표시 한도 — skill 한 개당 project 몇 개까지

skill 한 개의 분포 안에서, project 정렬·한도는 어떻게?

옵션:
- (a) **invocations 내림차순, 모두 표시** (project 수가 적은 org 가 대부분일 것).
- (b) **invocations 내림차순, Top 5 + "+N more"** (절대 한도 5).
- (c) **invocations 내림차순, Top N (사용자 화면에서 조절 가능)**.

(묻는 이유: 현재 skills 자체도 LIMIT 50 으로 잘려 있고, project 한 개당 도 적절한 한도가 없으면 페이로드가 커진다. 5 정도가 흔하지만 컨펌 필요.)

### Q7. (참고) 이 라운드로 finalize 해도 되는지

위 Q1~Q6 답변만으로 충분한 명세가 나오면, 추가 라운드 없이 바로 finalize (`01-clarify.md` + 유스케이스 초안) 로 진행해도 되나? 아니면 답변 후 한 번 더 확인 라운드를 원하나?

옵션:
- (a) **답변 후 바로 finalize 진행.**
- (b) **답변 본 뒤 finalize 전에 한 번 더 확인.**

(묻는 이유: 라운드 수는 메인 컨텍스트 비용 중 가장 큰 변수. 사용자가 (a) 를 명시하면 메인이 곧장 finalize 모드로 호출.)

## 메모 (메인 세션 참고)

- `useDashboardSkills` 와 `/api/orgs/[orgSlug]/dashboard/skills` 가 단일 진입점이라 API 응답 스키마(`SkillStat`) 에 `projects: Array<{ projectId, projectName, callCount, lastUsedAt }>` 형태를 추가하는 모양이 자연스럽다. Q1·Q2 답변에 따라 필드 모양이 결정된다.
- `resolveOrgScopedProjectIds` 가 이미 권한 필터를 적용하므로 Q5 의 (a) 가 기본 가정으로 부합. 컨펌만 받으면 됨.
- 라운드 1 — finalize 까지 1~2 라운드 안에 끝낼 수 있을 것으로 보인다.
