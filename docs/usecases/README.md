# Argos Use Case Catalog

Argos 서비스의 모든 유스케이스를 Alistair Cockburn 의 *Writing Effective Use Cases* 기법에 따라 단일 위치에서 관리한다. 각 유스케이스의 시나리오는 그대로 e2e 테스트로 옮겨도 동작할 만큼 구체적으로 작성한다.

## 디렉터리

```
docs/usecases/
  README.md         ← 이 문서 (포맷·규약·인덱스의 단일 원천)
  _ids.yaml         ← 기계 인덱스 + next-id 카운터
  org/              ← organization 도메인
  project/          ← project 도메인
  session/          ← Claude 세션/이벤트 도메인
  cli/              ← argos-ai CLI / hook
  billing/          ← 결제·플랜·토큰 한도
  auth/             ← 인증·세션 쿠키·역할
  _shared/          ← 여러 도메인 user-goal UC 가 공통 참조하는 subfunction
```

도메인 폴더는 첫 UC 가 들어올 때 생성된다. 추가 도메인이 필요해지면 `_ids.yaml` 의 `next_id` 에 새 prefix 를 추가하면서 폴더를 만든다.

## ID 와 파일명

- ID 형식: `UC-<DOMAIN>-<NNN>` (3자리 zero-pad). 예: `UC-PROJ-002`.
- ID 는 **재발급·재배치 금지**. 파일을 다른 도메인 폴더로 옮기더라도 ID 는 그대로. 더 이상 쓰지 않는 UC 는 삭제 대신 `status: deprecated`.
- 파일명: `UC-<DOMAIN>-<NNN>-<kebab-name>.md`. ID prefix 가 앞에 있어 grep 과 `git log` 가 쉽다.
- 새 ID 발급은 `_ids.yaml` 의 `next_id.<DOMAIN>` 을 1 증가시키며 할당한다. 보통 `.claude/agents/new-task-usecase.md` 가 자동으로 처리한다.

## Cockburn level 가이드

| level | 한글 표기 | 언제 쓰는가 |
|---|---|---|
| `summary` | 요약 (kite 🪁) | 여러 user-goal 의 흐름을 한 줄에 꿴 것. 시나리오 본문이 거의 `[[UC-…]]` 호출의 나열. |
| `user-goal` | 사용자 목표 (sea ⛵) | **대부분의 UC 는 여기**. 주 행위자가 한 번의 상호작용으로 달성하는 단일 목표. |
| `subfunction` | 하위 기능 (fish 🐟) | 두 개 이상의 user-goal UC 가 inline 으로 부르는 재사용 단위. `_shared/` 에 둔다. |

도메인 폴더는 level 과 직교한다. 같은 폴더 안에 `user-goal` 과 `subfunction` 이 섞여 있을 수 있다 (`_shared/` 의 subfunction 은 도메인이 명확하지 않을 때만 사용).

## UC 파일 포맷

각 UC 는 frontmatter 와 본문으로 구성된다.

### frontmatter

```yaml
---
id: UC-PROJ-002
name: 프로젝트를 다른 org 로 이동시킨다
level: user-goal              # summary | user-goal | subfunction
scope: 웹 대시보드 + 백엔드 API
primary_actor: 출발·대상 org 양쪽 OWNER 사용자
status: active                # draft | active | deprecated
includes: [UC-AUTH-003]       # 시나리오 본문에서 [[…]] 로 부른 하위 UC 목록 (frontmatter 와 본문이 일치해야 함)
related: [UC-PROJ-001]        # 인용은 안 하지만 맥락상 관련 있는 UC
e2e:                          # 빈 배열 + coverage_status: pending 으로 시작 가능
  - file: packages/web/e2e/project-transfer.spec.ts
    covers: [S1-S8, E5a, E6a]
coverage_status: pending      # pending | partial | covered
sources:
  - docs/tasks/2026-05-14-project-transfer-org/01-clarify.md
last_reviewed: 2026-05-14
---
```

### 본문 섹션 (순서 고정)

1. `## 이해관계자와 관심사` — 각 이해관계자가 이 UC 의 결과에 대해 무엇을 보장받고 싶어 하는가.
2. `## 사전조건` — UC 시작 시점에 이미 참인 시스템 상태. 각 항목에 `P1`, `P2` 식 라벨. (검증하지 않음 — 검증은 시나리오 단계나 확장에서.)
3. `## 트리거` — UC 진입을 일으키는 이벤트. `T1`, `T2`. 여러 트리거가 있으면 모두 적고, 트리거에 따라 시나리오가 갈리면 `## 기술/데이터 변형` 으로 처리.
4. `## 성공 보장 (Postconditions)` — 성공 시 보장되는 시스템 상태. `G1`, `G2`. "## 성공 기준" (clarify) 의 각 항목은 반드시 어떤 UC 의 G_i 로 환원된다.
5. `## 최소 보장` — 실패 경로에서도 지켜지는 불변식. `M1`, `M2`.
6. `## 주 성공 시나리오` — 번호 매긴 단계. 규칙은 아래 별도 절.
7. `## 확장 (Extensions)` — 주 시나리오 단계 번호 + 알파벳 (예: `5a`, `5b`). 각 확장은 그 안에서 종료되거나 주 시나리오의 N 단계로 복귀.
8. `## 기술/데이터 변형` *(있을 때만)* — 입력 채널/포맷 변형. `V1`, `V2`.
9. `## 참고` *(있을 때만)* — 관련 ADR, 데이터 스키마 문서 등.

### 시나리오 단계 작성 규칙 (e2e 직역 보장)

이 규칙을 지키지 않은 단계는 promotion 시 거부된다.

- 각 단계는 **`(<액터> · <표면>)` 접두사** 로 시작. 액터 ∈ {`User`, `System`, `External`}, 표면 ∈ {`UI`, `API`, `DB`, `CLI`, `Hook`, `Worker`}. 한 단계에 여러 표면이 묶이면 `·` 로 나열.
- 한 단계에 단일 동사. "사용자가 X 한다" 또는 "시스템이 Y 한다".
- **UI 단계**: 셀렉터로 식별 가능한 요소 + 동사. ✅ `"Transfer" 버튼을 클릭한다` / ❌ `사용자가 이동을 요청한다`.
- **API 단계**: 메서드 + 경로 + 요청·응답의 핵심 필드. ✅ `POST /api/projects/{id}/transfer { targetOrgSlug } → 200 + Project body` / ❌ `백엔드에 요청을 보낸다`.
- **DB 단계**: row 의 관찰 가능한 변화만. ✅ `Project.orgId 가 targetOrgId 로 갱신된다` / ❌ `Prisma update 호출`.
- **하위 UC 호출**: `[[UC-AUTH-003]]` inline 링크. frontmatter `includes:` 와 1:1.
- 단계 수 ≤ 9. 넘으면 subfunction UC 로 추출.
- 단계 라벨: 자동으로 `S1`, `S2`, … 로 참조한다 (e2e `covers:` 에서 `S1-S8`, `S3,S5` 식으로). 확장은 `E5a`, `E5a.1`.

### 확장 작성 규칙

- 헤딩: `- 5a. <조건>:` 한 줄. 그 아래 들여쓰기로 `5a.1`, `5a.2` 단계.
- 각 확장은 다음 중 하나로 끝나야 한다.
  - (a) **대체 종료**: 에러 응답 + UI 표시 등. 이 경우 G\_i 는 깨지지만 M\_i 는 유지되어야 한다.
  - (b) **주 시나리오 N 단계로 복귀**: 마지막 줄에 `→ 주 시나리오 N 단계로 복귀` 명시.
- 권한 실패·입력 충돌·트랜잭션 실패·외부 API 실패는 명시적 비범위가 아닌 한 모두 다룬다.

## 상위 scope 가 하위 scope 를 포함하는 방식

두 가지 메커니즘을 동시에 유지한다.

1. **인라인 참조** — 시나리오 본문에 `[[UC-AUTH-003]]` 한 줄. 호출 지점이 시각적으로 드러남.
2. **frontmatter `includes:`** — 위 인라인 참조 전부를 배열로 미러. 기계 traversal (그래프 빌드, lint) 가 가능.

Summary-level UC 의 주 시나리오는 거의 전적으로 `[[UC-…]]` 호출의 나열이 된다. 예시:

```
## 주 성공 시나리오
1. (User · UI) [[UC-ORG-001]] 로 organization 을 만든다.
2. (User · UI) [[UC-PROJ-001]] 로 첫 프로젝트를 만든다.
3. (User · CLI) [[UC-CLI-001]] 로 로컬에서 hook 을 연결한다.
```

## e2e 테스트와의 결속

- frontmatter `e2e:` 가 단일 진실. 각 항목은 `{ file, covers: [step-ID 또는 range] }`.
- 테스트 파일 헤더에 주석 한 줄을 둔다: `// @uc UC-PROJ-002 covers S1-S8, E5a, E6a`. 코드 → UC 방향의 grep 가능.
- 테스트 함수 이름에 step ID 를 넣는 것은 권장이지만 강제하지 않는다 (`it('S6: orgId is updated atomically', …)`).
- e2e 하네스가 아직 없는 동안에는 `e2e: []` + `coverage_status: pending` 으로 두고, 도입 시 일괄 채운다.

## 상태 (status) 와 커버리지 (coverage\_status)

- `status: draft` — UC 문서는 있지만 그 동작이 아직 코드에 없거나 의심스러움. 보통 task 의 implement/evaluate 전.
- `status: active` — 코드에 구현되어 있고 시나리오가 현재 동작을 반영함.
- `status: deprecated` — 더 이상 유효하지 않음. 파일/ID 는 보존, 본문 맨 위에 deprecation 사유 한 줄.
- `coverage_status: pending` — 매핑된 e2e 가 0개.
- `coverage_status: partial` — 일부 단계/확장만 e2e 로 덮임.
- `coverage_status: covered` — 모든 주 시나리오 단계 + 모든 확장이 e2e 에 매핑됨.

## 라이프사이클

1. `new-task` 의 clarify 단계에서 task 본인의 후보 UC 가 `docs/tasks/<slug>/01-clarify.md` 에 초안으로 작성된다. 초안 ID 는 `UC-DRAFT-<slug>-<n>`.
2. evaluate 가 통과한 뒤, 메인 세션이 `new-task-usecase` 서브에이전트를 호출한다.
3. 서브에이전트는 clarify 초안을 읽고 (a) 신규 UC 면 `_ids.yaml` 에서 새 ID 를 할당해 정식 파일 생성, (b) 기존 UC 의 동작을 바꾼 task 면 해당 UC 의 본문/`last_reviewed`/`sources` 를 업데이트.
4. e2e 가 추후 추가될 때 `e2e:` 와 `coverage_status:` 를 갱신.

## 백필 (backfill)

이 카탈로그는 비어있는 상태에서 시작한다. 기존 동작(현재 코드에 이미 구현된 기능) 은 별도 backfill task 로 채워 넣는다. 새 기능은 항상 `new-task` 파이프라인을 통해 들어오므로 자연스럽게 추가된다.

## 자주 묻는 결정

- **CRUD 마다 UC 하나?** — 아니다. 사용자 관점의 결과 단위. "프로젝트를 생성한다" 는 하나의 UC, "프로젝트 이름을 바꾼다" 는 보통 별개 UC. 하지만 "프로젝트 설정의 한 필드를 바꾼다" 같은 잡다한 건 묶거나 subfunction 으로.
- **버튼 색깔/문구 같은 디테일?** — 시나리오에 넣지 않는다. UC 는 동작의 계약. 디자인은 별도.
- **권한 검증은 사전조건인가 단계인가?** — 단계. 사전조건은 "이미 참" 인 것만. 검증을 거쳐 분기가 가능한 것은 시나리오 단계 + 확장.
- **외부 API 실패는?** — 명시적 비범위가 아니면 확장에 포함. `External` 액터로 표기.
