# Pipeline Improvements — 2026-05-14-project-transfer-org

발견된 개선 후보들. applied=yes 는 이번 사이클에 자동 반영됨.

## #1 review headless 실행을 절대 경로 + 절대 binary 로 명시

- **근거**: 이번 사이클에서 메인이 이전 단계에서 `cd packages/web` 한 후 evaluate 를 띄웠더니, (a) 출력 리다이렉트 상대 경로가 깨졌고 (b) `claude` 가 사용자 zsh alias (`/Users/choesumin/.claude/local/claude`) 라 비대화형 Bash 에서 안 먹혀 1차 headless review 가 실패. SKILL.md 의 명령 예시가 그대로 alias 와 상대 경로를 쓰고 있어 그대로 베끼면 재발한다.
- **변경 대상**: `.claude/skills/new-task/SKILL.md` §Step 5 — Evaluate, "Code Review (headless claude code)" 명령 예시
- **변경 내용**:
  ```diff
  1. **Code Review** (headless claude code):
     - Bash 로 `claude -p "/review"` 를 실행. 작업 디렉토리에서 실행되며, `/review` 가 변경분을 자동 인식.
  -   - 출력을 `docs/tasks/<slug>/05-review.md` 에 저장. 명령 예:
  -     ```bash
  -     claude -p "/review. 추가로 ..." > docs/tasks/<task_slug>/05-review.md
  -     ```
  +   - **반드시 절대 경로 + 절대 binary 로 실행**. `claude` 는 사용자 shell 의 alias 라 비대화형 Bash 에서는 동작하지 않는다. 또한 메인 세션의 cwd 가 이전 단계에서 `cd packages/<pkg>` 등으로 변경됐을 수 있으므로 출력 리다이렉트도 절대 경로로 적는다. 명령 예:
  +     ```bash
  +     /Users/<user>/.claude/local/claude -p "/review. ..." > /Users/<user>/Desktop/dev/vmc/argos/docs/tasks/<task_slug>/05-review.md
  +     ```
  +     `which claude` 로 실제 binary 경로를 한 번 확인해서 박는다 (alias 가 가리키는 실제 파일).
  ```
- **applied**: yes
- **이유 (왜 디폴트로 박는가)**: SKILL.md 의 단계 구조나 사용자 대화 규약이 아니라 evaluate 단계의 Bash 명령 예시 1개를 더 견고하게 바꾸는 것. 안전 가드의 "단계 구조 자동 변경 금지" 에 해당하지 않음 — 실행 명령 디테일만 보정. 이번 사이클에 실제 1차 실패가 있었던 패턴이라 즉시 박는 것이 옳다.

---

## #2 implement worker 가 자기 영역 종료 전 typecheck self-check 의무

- **근거**: WU-2 worker 가 `db.$transaction` mock 시그니처를 만들면서 vitest (`pnpm --filter @argos/web test`) 는 통과시켰지만 `pnpm --filter @argos/web typecheck` 는 TS2345 두 건으로 깨졌다. QA `05-qa.md` L37 / 이슈 #1 (`TxClient` 가 Prisma `TransactionClient` 시그니처와 불일치) 에서 발견. WU-2 의 검증 결과 (`04-implement-WU-2.md` L15) 에는 "tsc --noEmit (web 패키지) → 에러 없음" 으로 적혀 있었지만, 이는 `prisma generate` 직후 일시적 상태였고 테스트 파일까지 포함한 패키지 전체 typecheck 는 깨진 상태로 종료됐다.
- **변경 대상**: `.claude/agents/new-task-implement.md` §작업 절차 4번 항목
- **변경 내용**:
  ```diff
  4. 검증 명령 실행 (`pnpm test ...`, `pnpm build`, 타입체크 등 plan 에 명시된 것). 실패하면 디버깅 후 재시도.
  +   - **자기 영역 종료 전에 자기 패키지의 typecheck 를 반드시 self-check 한다**. vitest 는 ts-loader 가 관대해서 통과시켜도 `tsc --noEmit` 은 깨지는 케이스가 잦다 (대표적으로 `db.$transaction` 같은 Prisma 오버로드 mock, 복잡한 generic, `as` cast 누락). 명령 예: `pnpm --filter <pkg> typecheck` (또는 그 패키지 root 에서 `pnpm exec tsc --noEmit`). typecheck 가 깨지면 followup 라운드 비용이 크므로 반드시 자기 영역에서 막는다.
  ```
- **applied**: yes
- **이유 (왜 디폴트로 박는가)**: 이번 사이클의 가장 비용이 큰 회귀였고, plan 의 "검증 명령" 에 typecheck 가 명시되지 않은 wu 도 있어 worker 가 누락하기 쉬움. test=pass 가 typecheck=pass 를 함의하지 않는다는 mental model 을 worker 시스템 프롬프트에 박아두면 동일 패턴 반복을 막는다.

---

## #3 implement worker 의 test mock 에서 `as any` / 무caster cast 금지, Prisma 타입 차용 권고

- **근거**: WU-2 (`project-actions.test.ts` 의 `TxClient` 정의) 와 WU-4 worker 들이 ESLint `no-explicit-any` 위반을 다수 만들어 build 가 한 번 실패, followup 라운드를 따로 돌려야 했음. 더 깊은 원인은 worker 들이 mock 객체에 `as any` 를 무심하게 박고 있었던 것. 권장 패턴은 `as unknown as Awaited<ReturnType<typeof db.$transaction>>` 또는 `Parameters<typeof db.$transaction>[0]` 같이 **Prisma 가 export 하는 타입 그 자체를 차용** 하는 것. 이 한 줄 가이드만 시스템 프롬프트에 있어도 위반을 크게 줄였을 가능성.
- **변경 대상**: `.claude/agents/new-task-implement.md` §금지 사항 (test mock 가이드 추가)
- **변경 내용** (제안만, 미적용):
  ```diff
  ## 금지 사항
  + - test mock 에서 `as any` / `: any` 사용 금지 (`no-explicit-any` 가 ESLint 에서 error 다). Prisma 같은 generic API 를 mock 할 때는 `as unknown as Awaited<ReturnType<typeof <fn>>>`, `Parameters<typeof <fn>>[N]`, `Prisma.<Model>GetPayload<...>` 처럼 **라이브러리가 export 하는 타입을 차용** 한다.
  ```
- **applied**: no
- **이유 (왜 보류)**: 안전 가드 "변경은 한 파일당 한 사이클에 한 곳만" 에 따라 `.claude/agents/new-task-implement.md` 에는 이번 사이클에 #2 만 적용. 이 항목은 다음 사이클로 미룬다. (#2 가 typecheck self-check 를 강제하므로 `no-explicit-any` 위반도 typecheck/lint 단계에서 worker 가 자체 잡게 되어 우선순위 두 번째.)
