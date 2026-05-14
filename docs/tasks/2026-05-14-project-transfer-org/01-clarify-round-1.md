# Clarify Round 1 — project-transfer-org

## 사용자 발화 (원문)
> 내가 owner인 organization에서, 특정 프로젝트를 다른 organization으로 이동시킬 수 있는 기능을 만들자. 이동 대상 organization의 slug를 입력받으면된다. 별도 수락과정 없이 이동된다.

## 기존 문서/코드에서 이미 결정된 것 (가정으로 진행)

다음은 기존 문서/코드에 명시되어 있어 별도 질문 없이 가정으로 잡고 가는 항목이다. 사용자가 이의 있으면 답변에서 뒤집어 달라.

- **Role 모델은 OWNER / MANAGER / MEMBER / VIEWER 4단계** (`packages/web/prisma/schema.prisma`의 `OrgRole`). PRD에는 OWNER/MEMBER 2단계로 적혀 있지만 실제 코드는 4단계 — **코드가 진실**(spec.md §"계약의 원천").
- **권한 체크 위치**: `packages/web/src/app/api/projects/[projectId]/route.ts`의 PATCH/DELETE 패턴을 그대로 따라간다 (Next.js App Router, `requireAuth` + role 체크).
- **데이터 모델 영향 범위**: `Project.orgId`만 갱신. `ClaudeSession`/`Event`/`UsageRecord`/`Message`/`DailyProjectStat`는 모두 `projectId`에 매달려 있어 자동으로 따라온다 (DB 스키마상 추가 마이그레이션 불필요).
- **`Project.slug`는 `(orgId, slug)` 유니크**. 대상 org에 같은 slug 프로젝트가 있으면 충돌이 발생할 수밖에 없다.

---

## 질문 (이번 라운드: 6개)

답변은 각 번호 옆에 짧게 적어주면 된다. 모르겠으면 "추천대로"라고 적어도 됨.

### Q1. 권한 — 누가 transfer를 실행할 수 있나? (스코프/권한)
**왜 묻는지**: "내가 owner인 organization" 표현에서 출발 org의 OWNER만 가능한 것은 명확하지만, 대상 org에서의 권한 요구가 빠져 있다. 권한 누락 시 임의 organization slug만 알면 남의 org에 프로젝트를 욱여넣을 수 있게 된다.

선택지:
- (a) 출발 org OWNER + 대상 org에서도 OWNER 멤버여야 함 ← **기본 추천**
- (b) 출발 org OWNER + 대상 org에서 OWNER 또는 MANAGER 멤버
- (c) 출발 org OWNER만 — 대상 org 멤버십 무관 (사용자 발화의 "별도 수락과정 없이"를 가장 곧이곧대로 해석)
- (d) 기타

### Q2. 입력 받는 위치 — UI / API / CLI 중 어디에 노출? (스코프)
**왜 묻는지**: 구현 범위가 크게 갈린다. 기존 settings 페이지(`dashboard/[orgSlug]/settings/projects`)와 일관성을 맞출지, CLI까지 포함할지.

선택지:
- (a) 웹 대시보드의 프로젝트 설정 화면에만 노출 (API + UI) ← **기본 추천**
- (b) API만 (UI 없음, curl/스크립트 전용)
- (c) 웹 + CLI 모두 (`argos project transfer <new-org-slug>` 같은 커맨드)
- (d) 기타

### Q3. slug 충돌 처리 (성공 기준 / 엣지케이스)
**왜 묻는지**: `Project.slug`는 org 내 유니크다. 대상 org에 같은 slug 프로젝트가 이미 있으면 어떻게?

선택지:
- (a) 409 CONFLICT 반환하고 사용자에게 "대상 org에 같은 slug가 이미 존재합니다" 안내. 사용자가 직접 이름/slug 변경 후 재시도 ← **기본 추천**
- (b) 자동으로 slug에 suffix(`-2`, `-3`) 붙여 충돌 회피
- (c) 사용자에게 "새 slug 입력" 추가 입력란을 띄움
- (d) 기타

### Q4. ProjectMember 처리 (성공 기준)
**왜 묻는지**: 현재 프로젝트에는 `ProjectMember` 테이블로 등록된 MEMBER/VIEWER 접근권자들이 있을 수 있다. 이들은 새 org의 멤버가 아닐 수 있는데, 이동 후 어떻게?

선택지:
- (a) `ProjectMember` 레코드를 모두 삭제 (대상 org에서 새로 부여) ← **기본 추천 (가장 안전)**
- (b) 그대로 유지 (대상 org 비멤버여도 프로젝트엔 계속 접근) — 권한 모델 누수
- (c) 대상 org의 멤버인 사람만 남기고 나머지 삭제

### Q5. CLI 측 영향 — `.argos/project.json`의 `orgId` (위험요소)
**왜 묻는지**: 팀원 머신의 `.argos/project.json`에는 `orgId`가 박혀 있고 git에 커밋된다 (`flow.md` Flow 1). 이동 후 이 파일은 stale해진다. CLI hook은 `projectId`만 보고 동작하지만, `.argos`의 `orgId`가 더 이상 맞지 않게 된다.

선택지:
- (a) MVP 범위 밖 — 이 task에서는 서버 데이터 이동만. `.argos/project.json` 갱신은 사용자가 수동으로 다음 commit에 포함 ← **기본 추천**
- (b) 이 task에서 같이 처리 — CLI에 stale orgId 감지 + 자동 갱신 흐름 추가 (스코프 크게 확장)
- (c) 기타

### Q6. 비범위 / 명시적 제외 (out of scope)
**왜 묻는지**: 다음 항목들은 "transfer" 라는 단어에서 떠올릴 수 있지만 이번 task에 포함하지 않으려고 한다. 빠뜨린 게 있으면 추가해 달라.

이번 task에서 **다루지 않는다**고 보는 것들:
- 이동 알림(이메일/슬랙) — 사용자 발화상 "별도 수락과정 없이"라 알림도 자연스레 비범위
- 이동 이력(audit log) 테이블 — 새 모델 추가 필요. 별도 task로 미룸
- undo / 롤백 기능 — 다시 transfer 호출하면 원복 가능
- 이동 도중 발생한 in-flight 이벤트 처리 — 트랜잭션 한 번으로 끝나므로 race condition은 무시
- 여러 프로젝트 일괄 이동 — 1건씩만

이 중 **포함해야 한다**고 보는 게 있으면 알려달라. 추가 비범위 항목도 환영.

---

## 메모 (메인 세션 참고)
이번 라운드는 가벼운 결정 위주라 6문항이면 finalize 가능 상태에 도달할 가능성이 높다. 사용자 답변이 모두 추천안 수용에 가깝다면 다음 호출은 바로 `finalize`로 가도 무방.
