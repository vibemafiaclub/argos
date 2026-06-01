# Pipeline Improvements — 2026-05-14-yellow-skill-bars

발견된 개선 후보들. applied=yes 는 이번 사이클에 자동 반영됨.

## #1 plan critique 가 "단일 출처(single source of truth) 위반" 을 명시적으로 점검하지 않음

- **근거**: `05-review.md` L13 — 머지바 head `bg-muted-foreground` 하드코딩이 helper `segmentVisuals` 의 결정과 분리돼 있다는 "잠재 불일치" 를 코드리뷰가 처음 잡아냄. critique-1/critique-2 (총 13개 지적) 어디에도 SSoT 항목 없음.
- **변경 대상**: `.claude/agents/new-task-plan.md` §codex 호출 규약 (비평 프롬프트)
- **변경 내용**:
  ```
  - "plan 의 work unit 분할, 병렬 그룹의 파일 충돌, Decision Log 의 근거 충분성, 검증 시나리오의 누락 여부에 특히 집중."
  + "plan 의 work unit 분할, 병렬 그룹의 파일 충돌, Decision Log 의 근거 충분성, 검증 시나리오의 누락 여부, 그리고 **동일 의미값이 helper/JSX/CSS 등 여러 위치에 하드코딩돼 단일 출처가 깨지는지** 에 특히 집중."
  ```
- **applied**: yes
- **이유 (왜 디폴트로 박는가)**: 색·토큰·분류기 같은 결정은 한 곳에 모이지 않으면 미래 회귀의 1순위. plan critique 이 review 보다 먼저 잡아야 evaluate 단계 부담이 준다.

## #2 plan agent 가 "task surface 대비 plan 크기" 을 자기검열하지 않음

- **근거**: `03-plan.md` 225줄·Decision 6개·critique 2회 — `04-implement-WU-1.md` L4 의 실제 변경은 한 줄 분기 + helper 추출. plan 분량이 변경 LOC 의 10배 이상이고 critique 가 잡은 13개 중 8개는 "이미 plan 본문이 다룬 것을 더 명료하게 표기" 류였다. 즉 자기개선 루프가 의미 있는 발견을 만든 비율이 낮음.
- **변경 대상**: `.claude/agents/new-task-plan.md` §작업 절차
- **변경 내용**:
  ```
  + 3-0. critique 루프 진입 전 self-check: "이번 task 의 실제 변경 LOC 예상치 < 50 이고 work unit 1개이며 negative space 가 협소" 면 critique 1회로 종료 가능. critique 결과가 모두 표현/위치 조정 minor 면 round 2 생략. 종료 사유에 그렇게 적는다.
  ```
- **applied**: no
- **이유 (보류)**: SKILL.md 의 "최대 3회" 정책과 직접 충돌은 아니지만 단계 운영 정책에 가까움. 새 규칙 도입은 사용자 결정 영역. 후보로만 기록.

## #3 QA worker 가 환경 의존성 차단을 사전에 식별하지 못함

- **근거**: `05-qa.md` L33-35 — 시나리오 16/17/18 모두 `로컬 .env 부재로 DB 접속 불가` 로 blocked. 워커가 dev 서버까지 띄운 다음 차단을 알아챔. `new-task-evaluate-qa.md` §작업 절차 3 은 "앱 기동" 만 명시할 뿐 환경 의존 사전점검 단계가 없음.
- **변경 대상**: `.claude/agents/new-task-evaluate-qa.md` §작업 절차 (3 앱 기동 직전 사전점검 추가)
- **변경 내용**:
  ```
  + 2.5. **환경 의존 사전점검**: plan 의 QA 시나리오에 DB / 인증 / 외부 API 호출이 포함되면, 실행 전에 `.env` / credentials / 네트워크 상태를 확인한다. 누락이면 해당 시나리오를 `blocked` 로 분류하고 사유 ("로컬 .env 부재" 등) 를 미리 메모. 그 외 시나리오는 정상 진행.
  ```
- **applied**: yes
- **이유 (왜 디폴트로 박는가)**: blocked 시나리오 자체는 정당하지만, 사전점검을 통해 앱 기동/탐색 비용 없이 분류만 끝내 QA 시간이 짧아진다. QA worker 의 산출 품질도 균일해진다.

## #4 implement worker 의 "pre-existing 실패 분리" 가 모호하게 처리됨

- **근거**: `04-implement-WU-1.md` L18-19, L26 — `tsc --noEmit` 의 pre-existing 에러 (`@argos/shared` 미빌드 / ESM-CJS 혼용) 를 워커가 자발적으로 "본 WU 무관" 으로 분리해 리포트. 현 `new-task-implement.md` L54 "검증 실패한 채 완료 보고 금지" 는 이런 경우와 회색지대. 워커가 알아서 처리했지만 다음 워커가 다르게 처리하면 일관성 깨짐.
- **변경 대상**: `.claude/agents/new-task-implement.md` §금지 사항 (산출 스키마 보강)
- **변경 내용**:
  ```
  - ## 잠재 이슈 / 후속 메모
  - - <있으면. 없으면 "없음">
  + ## 잠재 이슈 / 후속 메모
  + - <있으면. 없으면 "없음">
  +
  + ## Pre-existing 실패 (있을 때만)
  + - 본 WU 가 도입한 것이 아닌 검증 실패는 여기에 분리 기록. 도입 시점·원인 추정 1줄 + 본 WU 와 무관함을 명시. 분리 보고가 어려우면 "검증 실패한 채 완료" 로 간주.
  ```
- **applied**: yes
- **이유 (왜 디폴트로 박는가)**: monorepo 에서 다른 패키지 빌드 의존이 흔한 pre-existing 노이즈를 만든다. 워커마다 다르게 분리하면 evaluate 비용이 늘어남. 표준 슬롯을 두면 review/QA 가 무시할 부분을 명확히 안다.

## #5 plan 의 "DOM 단언 불가" 시 정적 grep 가드 패턴이 암묵지로 남음

- **근거**: `03-plan.md` CP-4(a)(b) (L97~100), `05-qa.md` 시나리오 9·10 — DOM 단위 테스트 없이 `rg "bg-muted-foreground" ribbon.tsx` 정적 grep + git diff 비변경 확인 + 인접 모듈의 회귀 케이스 추가, 세 가지 조합으로 성공 기준 4 를 가드. 이 기법은 이번 plan 에서 처음 시도됐고 효과적이었지만 plan agent 정의에는 패턴화돼 있지 않음.
- **변경 대상**: `.claude/agents/new-task-plan.md` §plan 스키마 (검증 시나리오 자동 검증 부분)
- **변경 내용**:
  ```
  - - **자동**: `pnpm test ...`, `pnpm build ...`, 타입체크.
  + - **자동**: `pnpm test ...`, `pnpm build ...`, 타입체크.
  +   - DOM/렌더 단언이 어렵고 인프라 도입이 비범위면: (a) 변경 금지 라인의 정적 grep + git diff 비변경 확인, (b) 인접 분류·생성 로직의 회귀 케이스 추가 — 두 가드를 조합해 의도 한 단계 위에서 보호한다.
  ```
- **applied**: no
- **이유 (보류)**: 같은 파일(`new-task-plan.md`) 에 이미 #1, #3 두 건의 자동 변경이 모이므로 안전 가드 "한 파일당 한 사이클 한 곳" 에 걸려 보류. 다음 사이클로 미룸.

## 미적용 후보 (자동 변경에서 제외)

- 사용자가 round-1 단답("ㄱ", "ㄱㄱ", "모두") 으로만 진행한 패턴은 clarify 의 "사용자 답을 묻기 전에 디폴트 가정으로 박을 만한 질문" 을 더 공격적으로 판단하라는 신호일 수 있으나, 사용자 정책 추정이 포함돼 SKILL.md/clarify agent 자동 변경 금지에 해당. 보류.
