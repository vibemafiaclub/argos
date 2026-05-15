# Pipeline Improvements — 2026-05-14-skills-project-breakdown

발견된 개선 후보들. applied=yes 는 이번 사이클에 자동 반영됨.

## #1 clarify finalize 시 "응답 스키마 ↔ UI 요구 ↔ 성공 기준" 자기일관성 점검 의무

- **근거**: `01-clarify.md` L36 ("호버 시 풀 분포") 가 같은 파일 L19 의 응답 스키마(Top 5 + count) 및 L40 성공 기준 6 (250 entry 상한) 과 충돌. plan critique-1 의 #1 major 가 정확히 이 모순을 잡았고, plan 이 Decision-9 를 신설해서야 해결됨. clarify 단계에서 self-check 가 있었다면 critique 1라운드 비용 회피 가능.
- **변경 대상**: `.claude/agents/new-task-clarify.md` §유스케이스 작성 규칙 (12번 항목 뒤에 13번 추가)
- **변경 내용**:
  ```diff
   12. **UC 개수는 task 1건 기준 1~3개**. 4개 이상이면 task 가 너무 크다는 신호 — 메모에 분할 가능성 명시.
  +13. **finalize 직전 self-consistency 점검**: 산출 파일 안에서 (a) 응답 스키마/데이터 모양 (b) UI 명세/시나리오 (c) 성공 기준 (d) 가정 — 네 영역이 같은 수치/구조를 말하는지 본인이 한 번 검산한다. 예: "응답에 Top 5 보낸다" + "호버 시 풀 분포 표시" 는 충돌. 충돌이 있으면 finalize 하지 말고 어느 쪽을 단일 진실로 채택할지 1줄 질문으로 followup 라운드를 더 돈다 (또는 메모에 모순 명시 후 plan 단계로 양도). 모순을 그대로 finalize 하면 plan critique 라운드 비용으로 그대로 전가된다.
  ```
- **applied**: yes
- **이유 (왜 디폴트로 박는가)**: 이번 사이클에서 명확히 비용을 만든 패턴. clarify 가 자기검산 한 번만 해도 plan critique 1라운드(평균 +5min, 컨텍스트 수십KB)를 절약. 사용자 정책 추정 없이 "산출 내부 모순 점검" 만 의무화하므로 안전.

---

## #2 plan agent 가 본문 제출 직전 본인 SQL/코드 스니펫과 산문 주장의 일치성 self-check

- **근거**: plan critique-2 가 잡은 세 가지 패턴이 모두 "plan 본문 주장 vs 본인이 쓴 스니펫" 불일치:
  - #2 major: plan 산문은 "`all_skill_calls` 그대로 재사용" 이라 했지만 SQL 초안은 인라인 alias 라 재사용 불가.
  - #1 major: 비교식 `변경 전 median ≤ 변경 후 median × (1/1.20)` 의 부등호 방향이 산문 의도("20% 회귀 허용")와 반대.
  - #5 minor: SQL 주석이 "Decision-8" 을 가리키지만 실제 결정은 Decision-10.
  - #4 minor: `openOnHover` 가 `Popover.Trigger` prop 이라고 Decision-3 에 적었지만 WU-4 본문은 `Popover.Root` prop 처럼 표기.

  네 건 모두 codex critique 가 잡았지만 plan 작성자가 본인 산출을 한 번 grep/cross-check 했다면 critique-2 라운드 자체를 줄일 수 있었음.
- **변경 대상**: `.claude/agents/new-task-plan.md` §작업 절차 (4번과 5번 사이에 4.5 self-cross-check 추가)
- **변경 내용**:
  ```diff
   4. **최종 plan 확정**. Critique Reflection 섹션에 종료 사유 1줄 명시.
  +4.5. **제출 직전 self-cross-check (1~2분)**. 본문의 산문 주장과 본인이 쓴 스니펫/표가 실제로 같은 것을 가리키는지 다음 4축으로 grep 검증:
  +    - (a) **부등호·비율·임계값 방향**: "X 가 Y 의 1.2배 이내" 같은 비교식이 실제 부등호 방향과 맞는가 (좌변·우변 헷갈리기 쉬움).
  +    - (b) **CTE/함수 재사용 주장**: "X 를 재사용한다" 고 적었으면 본인이 쓴 SQL/코드에서 정말 X 를 from 절·import 로 참조하는가 (인라인 복제 아님).
  +    - (c) **Decision-N 교차참조**: 본문에서 "Decision-N" 을 인용했으면 그 N 번이 실제 결정 번호인가 (편집 중 번호 시프트로 어긋나기 쉬움).
  +    - (d) **라이브러리 API prop 위치**: "X prop 은 Component.Y 에 붙는다" 고 두 곳 이상에서 언급했으면 두 위치가 같은 컴포넌트를 가리키는가.
  +    - 모순 발견 시 본문 수정 후 다음 단계로. 이 self-check 가 critique 의 minor/major 1~3건을 사전 흡수해 critique 루프 수를 줄인다.
   5. 메인에 반환: plan 파일 경로 + 6~10줄 요약 (work unit 개수, 병렬 그룹 수, 주요 리스크 1~2개).
  ```
- **applied**: yes
- **이유 (왜 디폴트로 박는가)**: 이번 사이클의 critique-2 4건 중 3건이 이 self-check 로 사전 차단 가능. plan agent 의 단계 구조 변경이 아니라 "제출 직전 검산" 한 단계를 더 박는 것으로 안전 가드의 "단계 구조 자동 변경 금지" 범주 아님.

---

## #3 implement worker 가 본 task 가 도입한 ADR 과 자기 코드의 일관성 self-check

- **근거**: `05-review.md` L15 (정확성/잠재 이슈 #1) — "`skill_events` 외부 ORDER BY 가 ADR-024 위반". **같은 PR 이 ADR-024 의 3단 tiebreaker 표준을 신설하면서, 동시에 같은 PR 의 다른 SQL 라인이 단일 키 정렬로 그 표준을 위반**. ADR-024 는 본 task 가 만든 ADR (`task:2026-05-14-skills-project-breakdown` 태그) 이라 implement worker 가 작업 시점엔 ADR 파일에 없었지만, plan Decision Log 에 Decision-2 로 명시돼 있었다. worker 가 자기 wu 의 변경 라인에 본 task Decision Log 의 결정이 일관 적용됐는지 grep 한 번 했으면 잡았을 패턴.
- **변경 대상**: `.claude/agents/new-task-implement.md` §작업 절차 (4번 항목에 새 sub-bullet 추가)
- **변경 내용**:
  ```diff
   4. 검증 명령 실행 (`pnpm test ...`, `pnpm build`, 타입체크 등 plan 에 명시된 것). 실패하면 디버깅 후 재시도.
  +   - **본 task 의 Decision Log 일관성 self-check**: 자기 wu 가 만진 파일에 `plan_path` 의 Decision Log 결정(아직 ADR 파일에 없을 수 있음 — background 작성 중)이 모순 없이 적용됐는지 grep 한 번. 특히 "표준 결정 vs 같은 PR 내 위반" 패턴 — 예: tiebreaker 3단 표준을 도입했는데 같은 PR 의 다른 ORDER BY 가 단일 키. 자기 wu 영역 안에서 위반이 보이면 같이 고친다. 다른 wu 영역의 위반이면 잠재 이슈 메모로 보고.
  ```
- **applied**: no
- **이유 (보류)**: 안전 가드 "변경은 한 파일당 한 사이클에 한 곳만". `.claude/agents/new-task-implement.md` 는 이전 사이클(2026-05-14-project-transfer-org)에서 typecheck self-check 가 이미 추가되어 있어, 같은 파일에 또 변경이 누적되는 패턴을 회피. 다음 사이클로 미룬다.

---

## #4 QA worker 가 "런타임 검증" 과 "코드 검토 검증" 을 결과 컬럼에서 구분하도록 의무화

- **근거**: `05-qa.md` 시나리오 표 — S4/S14/S15/S16 네 건이 `pass (코드 검토)` 로 기록됨. 헤드리스 브라우저 driver 부재 사유는 정당하나, **같은 "pass" 라벨 아래에 런타임 통과(S1/S2/S3/S5/S13)와 정적 코드 검토(S4/S14)가 섞이면 머지 결정자가 위험 분포를 잘못 읽음**. 실제로 review L16-18 가 잡은 `truncate + flex children` 동작 누락은 정확히 "코드 검토만 한 시나리오" 의 시각 회귀였다. QA worker 정의에는 결과 라벨에 검증 방식 메타가 박혀 있지 않음.
- **변경 대상**: `.claude/agents/new-task-evaluate-qa.md` §산출 스키마 (시나리오 결과 표의 결과 컬럼 정의 보강)
- **변경 내용**:
  ```diff
   | # | 시나리오 | 결과 | 심각도 | 메모 |
   |---|---------|------|--------|------|
  -| 1 | 로그인 → 대시보드 진입 | pass | - | - |
  -| 2 | 비어있는 목록 상태에서 신규 추가 | fail | major | 토스트 alert 가 노출되지 않음 |
  -| 3 | ... | | | |
  +| 1 | 로그인 → 대시보드 진입 | pass(runtime) | - | - |
  +| 2 | 비어있는 목록 상태에서 신규 추가 | fail(runtime) | major | 토스트 alert 가 노출되지 않음 |
  +| 3 | 키보드 a11y 흐름 | pass(static) | - | 헤드리스 driver 부재 — 컴포넌트 코드 검토로 검증 |
  +| 4 | ... | blocked | - | env 미설정 등 사유 |
  +
  +결과 라벨 규약:
  +- `pass(runtime)` / `fail(runtime)`: 실제 앱 기동 후 동작/응답으로 검증.
  +- `pass(static)` / `fail(static)`: 헤드리스 브라우저·driver 부재로 컴포넌트 코드 검토·grep 으로 갈음한 검증. 시각 회귀·실제 이벤트 흐름은 잡을 수 없으므로 항상 "메모" 에 갈음 사유 1줄.
  +- `blocked`: 환경·시드·credentials 부재로 실행 불가. 사유 명시.
  +
  +총괄 보고는 `pass(runtime) X / pass(static) Y / fail Z / blocked B` 로 분리 표기. 같은 pass 안에서도 분포가 보이도록.
  ```
- **applied**: yes
- **이유 (왜 디폴트로 박는가)**: 산출 스키마의 명시 보강이며, 사용자 정책 추정 없음. 머지 결정자가 위험 분포를 정확히 보게 되어 이번 사이클의 `truncate + flex` 류 시각 회귀가 머지 전에 더 잘 잡힌다. SKILL.md 단계 구조와 무관.

---

## #5 plan critique 프롬프트에 "동일 PR 내 표준 도입 + 동시 위반" 항목 명시

- **근거**: #3 과 같은 사례 — 본 PR 이 ADR-024(3단 tiebreaker)를 도입하면서 같은 PR 의 `skill_events ORDER BY e.call_count DESC` 가 그 표준을 위반. critique-1/critique-2 모두 이 패턴을 놓치고 코드 리뷰가 발견. critique 프롬프트에 "결정 도입과 자기 PR 내 적용 일관성" 점검 항목이 없음.
- **변경 대상**: `.claude/agents/new-task-plan.md` §codex 호출 규약 (비평 프롬프트 문자열)
- **변경 내용** (제안만, 미적용):
  ```diff
  - "plan 의 work unit 분할, 병렬 그룹의 파일 충돌, Decision Log 의 근거 충분성, 검증 시나리오의 누락 여부, 그리고 동일 의미값(색·토큰·분류 술어 등)이 helper/JSX/CSS 등 여러 위치에 하드코딩돼 단일 출처가 깨지는지에 특히 집중."
  + "plan 의 work unit 분할, 병렬 그룹의 파일 충돌, Decision Log 의 근거 충분성, 검증 시나리오의 누락 여부, 동일 의미값(색·토큰·분류 술어 등)이 helper/JSX/CSS 등 여러 위치에 하드코딩돼 단일 출처가 깨지는지, 그리고 **Decision Log 가 새로 도입한 표준(예: 정렬 tiebreaker 패턴, 응답 필드 스키마)이 같은 plan 안의 다른 SQL/코드 스니펫에 일관 적용됐는지** 에 특히 집중."
  ```
- **applied**: no
- **이유 (보류)**: 안전 가드 "변경은 한 파일당 한 사이클에 한 곳만". `.claude/agents/new-task-plan.md` 에 이번 사이클 #2 self-cross-check 가 이미 적용되므로 동일 파일 두 번째 자동 변경은 회피. 다음 사이클로 미룸. (#2 의 self-check 가 "Decision-N 교차참조" 축에서 일부 흡수하므로 우선순위 두 번째.)
