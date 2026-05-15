# Clarify Round 2 — project-transfer-org

## 라운드 1 답변 정리

| 항목 | 결정 |
|---|---|
| Q1. 권한 | **(a)** 출발 org OWNER + 대상 org에서도 OWNER 멤버여야 transfer 가능 |
| Q2. 입력 위치 | **(a)** 웹 대시보드만 (CLI 명령어 추가 없음) |
| Q3. slug 충돌 | **재질문 필요** — 라운드 1에서 "슬러그 충돌이 무슨 뜻인지 모르겠다"고 답함. 아래 Q3'에서 재질문. |
| Q4. ProjectMember | **(a)** 이동 시 `ProjectMember` 레코드 모두 삭제. 대상 org에서 새로 부여하는 흐름 |
| Q5. CLI `.argos/project.json` stale orgId | **부분 보류** — 기본 추천(MVP 비범위)에 동의했으나, "stale 해도 작동에 이상 없게 만들 수 있냐"는 질문이 추가로 들어옴. 아래 Q5'에서 옵션 제시. |
| Q6. 비범위 항목 | **추천대로** — 알림/audit log/undo/in-flight/일괄이동 모두 비범위 |

---

## 코드 확인 결과 (Q5 관련 사실관계)

`.argos/project.json` 의 stale orgId 가 정말 무해한지 확인했더니 **무해하지 않다**.

- `.argos/project.json` 에는 `orgId`, `orgSlug`, `projectId`, `projectSlug` 가 모두 박혀 있다 (git 커밋 대상).
- CLI hook 실행 경로에서 `joinOrg(orgSlug ?? orgId)` 와 `ensureMembership(orgSlug ?? orgId)` 를 호출한다.
- 즉 transfer 후 git pull 받지 않은 팀원의 머신에서는 **이전(잘못된) org 에 join/membership 시도**가 발생한다 — 권한/소속 측면에서 silently 잘못된 동작.
- 따라서 "그냥 두면 알아서 잘 됨"은 사실이 아니며, 어느 정도의 stale tolerance 설계가 필요하다. **단, 이 처리를 이번 task 에 포함할지 여부는 사용자가 결정**.

---

## 이번 라운드 질문 (2개)

### Q3'. (재질문) 대상 org 에 같은 이름의 프로젝트가 이미 있을 때

**상황 설명**: 프로젝트는 org 안에서 **고유한 짧은 이름(slug)** 을 가진다. 예를 들어 org `acme` 안에 `web-app` 이라는 프로젝트가 있고, 이걸 org `beta` 로 옮기려는데 `beta` 에도 이미 `web-app` 이라는 프로젝트가 있다면 — DB 가 같은 org 안에 같은 이름 두 개를 허용하지 않으므로 이동이 그냥은 안 된다. 이때 어떻게 할지.

**왜 묻는지**: 사용자 경험이 갈리는 지점이라 임의 결정 곤란. (a) 는 사용자에게 책임을 넘기고 단순함, (b) 는 자동으로 처리하지만 결과 이름이 자동 생성되어 어색할 수 있음, (c) 는 가장 매끄럽지만 UI 에 추가 입력란 필요.

선택지:
- (a) **거부 + 안내** — "대상 org 에 같은 이름의 프로젝트가 이미 있어 이동할 수 없습니다. 한쪽 이름을 먼저 바꿔주세요." 라고 띄우고 끝. 사용자가 이름 변경 후 재시도 ← **기본 추천 (가장 단순)**
- (b) **자동 이름 변경** — 충돌하면 `web-app` → `web-app-2`, `web-app-3` … 식으로 뒤에 숫자를 붙여 자동으로 옮김
- (c) **새 이름 입력 받기** — 충돌하면 UI 가 "대상 org 에서 사용할 새 이름" 입력란을 띄워 받음
- (d) 기타 / 직접 적기

---

### Q5'. CLI 의 `.argos/project.json` stale orgId 처리

**상황 설명**: 위 코드 확인 결과대로, transfer 후 다른 팀원 머신의 `.argos/project.json` 에 박힌 옛 orgId/orgSlug 가 **틀린 org 에 join 시도**를 일으킨다. 이걸 "어떻게든" 자동으로 자기치유(self-healing) 되게 하려면 다음 중 하나가 필요.

**왜 묻는지**: 셋 다 "이번 task" 에 포함시키면 스코프가 커진다. 사용자가 "이상 없이 작동했으면 좋겠다"고 명시했으므로, 어느 비용까지 감수할지 골라야 함.

선택지:

- **(a) 서버측 self-heal — project lookup 응답에 항상 현재 orgId/orgSlug 포함, CLI 가 받아서 `.argos/project.json` 자동 갱신**
  - 동작: hook 시작 시 CLI 가 projectId 로 서버에 조회 → 서버가 현재 정답 org 정보 응답 → CLI 가 로컬 파일과 다르면 덮어씀 → 다음 commit 에 자동 반영
  - 장점: 깨끗하게 self-healing. CLI 가 항상 정답을 알게 됨. 사용자 액션 불필요.
  - 단점: hook 마다 추가 네트워크 round-trip 1회 (이미 있을 수도 있음 — 확인 필요), `.argos/project.json` 자동 수정에 대한 git diff 가 떠서 사용자가 의아해 할 수 있음
  - 구현 복잡도: **중**. 서버 응답 스키마 1줄 + CLI 파일 갱신 로직.

- **(b) 서버측 silent 정정 — joinOrg/ensureMembership 가 받은 orgId 가 project 의 실제 org 와 다르면 서버가 자동 보정**
  - 동작: CLI 는 stale orgSlug 그대로 보냄 → 서버가 projectId 로 정답 org 찾아서 그쪽으로 처리 → CLI 는 모름
  - 장점: CLI 변경 없음. 서버에서만 끝남.
  - 단점: 서버가 "내가 받은 식별자랑 다른 org 에 작업했다" 는 의미적으로 더러운 동작. 디버깅/감사 시 혼란. `.argos/project.json` 은 영원히 stale. 향후 hook 외 다른 CLI 명령(예: `argos project list`)에서 또 같은 문제 반복.
  - 구현 복잡도: **하**. 그러나 의미적으로 비추천.

- **(c) CLI 측 lookup 우선 — hook 실행 시 projectId 로 먼저 server lookup → 정답 orgId 받아서 그걸로 joinOrg**
  - 동작: (a) 와 거의 같지만, 로컬 파일 갱신은 안 함. 매번 새로 lookup.
  - 장점: 로컬 파일 수정 없음 (git diff 안 뜸).
  - 단점: 매 hook 마다 round-trip. 영구 갱신이 안 되어 매번 lookup 비용. (a) 의 일회성 갱신이 더 깔끔.
  - 구현 복잡도: **중**.

- **(d) 비범위 유지 — transfer task 에서는 손대지 않음. 사용자가 transfer 후 팀원에게 "git pull + `.argos/project.json` 새로 받기" 안내**
  - 장점: 스코프 최소.
  - 단점: pull 안 한 머신에서 잘못된 join 호출 발생. silently fail 하거나 잘못된 org 에 membership 쌓일 위험 잔존.

**추천**: 의미적으로 깨끗하면서 한 번 해두면 끝나는 **(a)**. 다만 task 스코프가 커지므로 (d) 로 일단 분리하고 별도 task 로 빼는 것도 합리적. 사용자가 골라달라.

---

## 메모 (메인 세션 참고)

남은 질문 2개만 답 받으면 finalize 가능. 다음 호출은 `mode=finalize` 로 가도 무방.
