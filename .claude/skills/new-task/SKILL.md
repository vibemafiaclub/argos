---
description: 새 작업 한 건을 처음부터 끝까지 5단계(clarify → context → plan → implement → evaluate) 파이프라인으로 진행한다. 각 단계는 sub-agent 가 수행하고, 메인 세션은 사용자와 대화 + 파일 경로만 받는 오케스트레이터로 동작한다. 명시적으로 `/new-task` 로 호출될 때만 발동한다.
---

# new-task

5단계 파이프라인으로 새 task 한 건을 완료한다. 메인 세션의 컨텍스트를 최대한 절약하면서도 산출물 품질을 보장하기 위한 규약이 강하게 박혀 있다.

## 최상위 원칙 (모두 컨텍스트 보호용 — 어기면 후속 단계 정확도 급락)

1. **메인 세션은 sub-agent 산출물의 전체 텍스트를 절대 인용하거나 메인 컨텍스트에 풀어놓지 않는다.** 항상 **파일 경로 + 5~10줄 요약** 만 받는다.
2. **sub-agent 호출 시 메인은 이전 단계 산출 파일 경로만 전달**한다. 그 파일 텍스트를 프롬프트에 그대로 박아 넣지 않는다 (sub-agent 가 Read 한다).
3. **사용자 대화는 짧게, 묶음으로**. clarify/단계 진행 확인 외에는 사용자에게 굳이 묻지 않는다.
4. **각 단계의 산출 파일을 직접 길게 읽지 않는다**. 필요시 grep 으로 부분만.
5. **사용자가 "그 부분 보여줘" 했을 때만** 산출 파일을 Read 해서 해당 섹션을 노출한다.
6. **5단계 구조는 사용자 명령 없이 임의로 건너뛰거나 합치지 않는다**.

## 사전 준비 — 모든 단계 진입 직전 메인이 수행

### 0.1 활성 task slug 결정 및 포인터 기록

처음 `/new-task` 가 호출될 때:

1. 사용자 발화로부터 짧은 kebab-case slug 후보를 3~5단어로 생성. 형식: `YYYY-MM-DD-<kebab>`. 오늘 날짜는 환경 컨텍스트의 `currentDate` 참조.
2. 사용자에게 슬러그를 한 줄로 보여주고 즉시 확정(별도 confirm 없이 그대로 진행 — 마음에 안 들면 다음 메시지에서 사용자가 수정 명령).
3. `.claude/state/active-task` 파일에 slug 만 1줄 기록 (이 파일이 있어야 hook 이 메인 세션 대화를 `_conversation.md` 에 누적함).
4. `docs/tasks/<slug>/` 디렉토리를 mkdir.

### 0.2 code-convention 문서 확인 (Q3 결정 반영)

- 처음 한 번만: `docs/code-convention.md` 존재 여부 확인.
- 없으면 사용자에게 "코드 컨벤션 문서가 없습니다. 짧게 (50줄 이하) 초안을 만들고 진행할까요?" **단 한 번만** 묻는다. 답이 yes 면 메인이 직접 짧은 초안 생성 후 진행. no 면 패스하고 review 단계에서 `CLAUDE.md` + 추출 ADR 만 기준으로 진행.

### 0.3 사용자 진행 명령 트리거

각 단계가 끝나면 메인은 사용자에게 **그 단계 요약 5~10줄 + "다음 단계로 진행할까요?"** 한 줄을 보낸다. 사용자가 명시적으로 "ㄱ", "다음", "진행", "OK" 등 진행 의사를 표시하기 전까지는 다음 단계로 안 넘어간다. 그 사이 사용자가 추가 지시/수정을 주면 같은 단계 sub-agent 를 followup mode 로 재호출.

---

## Step 1 — Clarify

### 호출

`Agent` tool 로 `subagent_type="new-task-clarify"` 호출. 프롬프트에 자체완결적으로:

- `task_slug`, `mode` (`initial`/`followup`/`finalize`), `prior_path` (있을 때), `user_input` (이번 라운드 사용자 텍스트)
- 도구 설명 외에 "메인 세션 컨텍스트 절약을 위해 산출은 반드시 파일에 쓰고 경로 + 요약만 반환" 명시

### 흐름

1. 메인이 사용자의 첫 발화를 정제해 `user_input` 으로 전달 → `mode=initial` 호출.
2. sub-agent 가 묶음 질문 파일 (`01-clarify-round-1.md`) 생성 + 메인에 경로 + 요약 반환.
3. 메인은 산출 파일을 Read 하여 **질문만** 추출해 사용자에게 그대로 옮긴다.
4. 사용자 답변 → `mode=followup`, `prior_path=01-clarify-round-1.md`, `user_input=<답변>` 으로 재호출 → `01-clarify-round-2.md` 생성. 추가 질문 있으면 반복.
5. 사용자가 "다음 단계 ㄱ" → `mode=finalize` 호출 → 최종 `01-clarify.md` 생성.

### 메인이 절대 하지 말 것

- clarify-round-N.md 의 본문 텍스트를 메인 채팅에 길게 인용해 사용자에게 보여주기 (질문 목록만 발췌).

---

## Step 2 — Context Gathering

### 호출

`Agent` tool 로 `subagent_type="new-task-context"`.

- 입력: `task_slug`, `clarify_path=docs/tasks/<slug>/01-clarify.md`
- 산출: `docs/tasks/<slug>/02-context.md` (관련 코드 위치 ≤15, 관련 ADR, negative space, 폴더 구조 메모)

### 흐름

1. sub-agent 1회 호출 → 산출 + 요약 받음.
2. 사용자에게 요약 (관련 위치 N개, 관련 ADR M개, negative space K개) + 다음 단계 진행 의사 확인.
3. 사용자가 추가 지시 주면 followup 호출.

---

## Step 3 — Plan (+ codex critique + ADR background)

### 호출

`Agent` tool 로 `subagent_type="new-task-plan"`.

- 입력: `task_slug`, `clarify_path`, `context_path`, (선택) `user_directives`
- sub-agent 내부에서 codex critique 루프 최대 3회 자동 진행 (종료 조건은 sub-agent 정의 참조)
- 산출: `docs/tasks/<slug>/03-plan.md` (Decision Log 포함) + `03-plan-critique-<N>.md` 들

### Plan 확정 직후 → ADR sub-agent 를 BACKGROUND 로 띄움

```
Agent({
  subagent_type: "new-task-adr",
  run_in_background: true,
  prompt: 입력 경로 4개 (task_slug, plan_path, conversation_path=docs/tasks/<slug>/_conversation.md, clarify_path, context_path)
})
```

- ADR sub-agent 완료는 자동 알림으로 메인에 도달. 폴링/sleep 금지.
- **메인은 곧장 Step 4 로 진행**. evaluate 가 끝날 무렵 ADR 도 끝나 있다.

### 흐름

1. plan sub-agent 호출 → 산출 + 요약 받음 (work unit 개수, 병렬 그룹 수, 주요 리스크).
2. ADR sub-agent background 띄움.
3. 사용자에게 plan 요약 + 진행 의사 확인.
4. 사용자가 plan 에 손대고 싶다면 plan sub-agent followup 호출 후 다시 확인. 사용자 만족 → Step 4.

---

## Step 4 — Implement

### 호출 (병렬 fan-out)

메인이 `03-plan.md` 의 **"병렬 실행 그룹"** 섹션만 Read (전체 plan 읽지 말 것 — grep 으로 그 섹션만).

각 그룹을 순서대로 실행:

- 그룹 내 work unit 들에 대해 **하나의 메시지에서 여러 Agent 호출을 동시 발사** (병렬).
- 각 호출: `subagent_type="new-task-implement"`, 입력: `task_slug`, `plan_path`, `wu_id`.
- 그룹 내 모든 worker 완료 후 다음 그룹.

### 흐름

1. 그룹 A 병렬 발사 → 모두 완료 신호 받음.
2. 그룹 B 병렬 발사 → ...
3. 모든 그룹 끝나면 사용자에게 변경 파일 통계 (변경 N파일, +X/-Y lines) + 진행 의사 확인.

### 메인이 절대 하지 말 것

- 각 worker 의 `04-implement-<wu>.md` 본문을 길게 인용. 통계 + 3줄 요약만.
- 도중에 한 worker 의 출력에 반응해 다른 worker 영역을 메인이 직접 수정. 모든 코드 변경은 worker 가 자기 영역 안에서.

---

## Step 5 — Evaluate

### 호출 (병렬)

ADR background 가 아직 안 끝났으면, 메인은 그냥 evaluate 두 개를 띄운다. ADR 완료 알림이 도착하는 즉시 join.

**병렬 발사 (한 메시지에 두 tool call):**

1. **Code Review** (headless claude code):
   - Bash 로 `claude -p "/review"` 를 실행. 작업 디렉토리에서 실행되며, `/review` 가 변경분을 자동 인식.
   - 출력을 `docs/tasks/<slug>/05-review.md` 에 저장. 명령 예:
     ```bash
     claude -p "/review. 추가로 docs/adr.md 의 task:<task_slug> 태그가 붙은 신규 ADR 들과 일관성도 점검해줘. 결과 텍스트만 출력해줘 (마크다운)." > docs/tasks/<task_slug>/05-review.md
     ```
2. **QA**: `Agent` tool `subagent_type="new-task-evaluate-qa"`. 입력: `task_slug`, `plan_path`, `clarify_path`.

### Evaluate 입력 컨텍스트 최적화

- review/QA 두 호출 모두 **`git diff` 기반**. 메인이 `git diff main...HEAD --stat` 같은 짧은 stat 만 우선 한번 보고, 두 호출에 `<base>` 가 필요하면 명시.
- 두 sub-agent 결과는 메인이 곧바로 읽지 않는다 — **요약(이슈 수 + 심각도 분포) 만** 받는다.

### ADR background join

- evaluate 호출 전 또는 도중에 ADR 완료 알림이 도착했다면 그 알림에 잠깐 응대하고 다시 evaluate 로.
- evaluate 가 모두 끝났는데 ADR 이 아직 안 끝났다면, 사용자 브리핑 직전까지 잠시 기다린다 (자동 알림에 의존, 폴링 금지).

---

## 최종 브리핑 + 사용자 반영 선택

evaluate 두 결과 + ADR 완료까지 모두 join 되면 메인이 사용자에게 다음 형식으로 단 하나의 브리핑을 보낸다:

```
## new-task 완료: <slug>

산출물:
- 요구사항: docs/tasks/<slug>/01-clarify.md
- 컨텍스트: docs/tasks/<slug>/02-context.md
- 계획: docs/tasks/<slug>/03-plan.md (critique <N>회)
- 구현: <변경 N파일, +X/-Y lines>
- 코드리뷰: docs/tasks/<slug>/05-review.md (critical C / major M / minor m / nit n)
- QA: docs/tasks/<slug>/05-qa.md (pass P / fail F)
- ADR 추가: ADR-NNN, ADR-NNN+1 (docs/adr.md)

발견 이슈 (반영 여부 선택):
[#1] critical | path:line | 한 줄 설명 — 권고: 한 줄
[#2] major   | path:line | ...
...

어떤 이슈를 반영할까요? (예: "1,3 반영", "모두 반영", "스킵")
```

- 이슈 목록은 **review + QA 양쪽에서 critical/major 만 추려** 단일 번호 매김으로 메인이 통합. minor/nit 은 파일에 있으니 굳이 본문에 끌어오지 않는다.
- 사용자가 "1,3 반영" 같이 답하면 **메인 세션이 직접** 해당 이슈를 처리 (가장 깊은 컨텍스트가 메인이므로 — 별도 세션 띄우지 말 것).
- 사용자가 "스킵" / "다 무시" / "끝" 하면 다음 단계로.

## 파이프라인 자기개선 (background, 마지막)

사용자 결정(반영 또는 스킵)이 끝난 직후, 메인이 background sub-agent 를 띄운다:

```
Agent({
  subagent_type: "new-task-pipeline-improver",
  run_in_background: true,
  prompt: task_slug + 모든 산출물 경로 + _conversation.md 경로
})
```

완료 알림이 오면 메인은 한 줄로만 보고 ("파이프라인 개선 N건 자동 반영, K건 보류 — `_pipeline-improvements.md`").

## 세션 종료 정리

위 모두 끝나면 메인이 마지막으로:

1. `.claude/state/active-task` 파일 삭제 (hook 비활성화).
2. 사용자에게 한 줄: "active-task 해제. 새 task 는 `/new-task` 로 다시 시작하세요."

## 단계별 산출물 경로 일람

```
docs/tasks/<slug>/
  _conversation.md             # hook 자동 누적
  01-clarify-round-1.md ...    # clarify 라운드별
  01-clarify.md                # clarify 최종
  02-context.md
  03-plan.md
  03-plan-critique-1.md ...
  04-implement-<wu_id>.md ...
  05-review.md
  05-qa.md
  _pipeline-improvements.md    # background 산출
docs/adr.md                    # ADR append
.claude/state/active-task      # 진행 중일 때만 존재
```

## 호출 규칙 요약

- 모든 sub-agent 호출: `Agent` tool. `subagent_type` 은 `new-task-*` 중 하나.
- background 띄우는 sub-agent: ADR, pipeline-improver. `run_in_background: true`.
- 병렬 발사 (implement 그룹 내, evaluate review+QA): **한 메시지에 여러 tool call** 동시 발사.
- 메인이 직접 사용자와 대화하는 것은 (a) 단계 종료 확인 (b) 최종 브리핑/이슈 반영 선택 — 이 두 곳이 본진. clarify 단계의 질문 옮기기는 sub-agent 산출 파일에서 질문 부분만 발췌해 전달.

## 하지 말 것

- 한 메시지에서 5단계를 한꺼번에 자동 진행 금지. 매 단계 사용자 진행 명령 대기.
- sub-agent 산출 텍스트를 메인 채팅에 길게 인용 금지.
- sub-agent 프롬프트에 이전 단계 산출 텍스트 박아 넣기 금지 (경로만 줘서 sub-agent 가 Read).
- background sub-agent 폴링/sleep 금지 — 자동 알림에 의존.
- 이슈 반영 시 별도 세션/sub-agent 생성 금지 — 메인 세션이 가장 깊은 컨텍스트이므로 메인이 직접 처리.
- `.claude/state/active-task` 정리 누락 금지. 누락되면 다음 무관 세션에서 hook 이 잘못된 폴더에 쓴다.
- evaluate 이슈에서 minor/nit 까지 브리핑 본문에 끌어오기 금지. 파일에 있으므로 사용자가 원하면 그때 Read.
