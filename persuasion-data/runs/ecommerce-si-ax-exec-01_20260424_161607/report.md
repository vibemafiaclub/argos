---
report_type: simulation_report
run_id: ecommerce-si-ax-exec-01_20260424_161607
persona_id: ecommerce-si-ax-exec-01
persona_version: 1
final_verdict: 실패
failure_reason: keyman_gives_up
execution_risk: 높음
created_at: 2026-04-24T17:15:00+09:00
---

# 최종 판정

**실패 (keyman_gives_up)**. keyman은 5a에서 `convince_stakeholders / confidence 78`로 출발해 본부장·개발팀장·고객사임원·CEO 순의 설득 계획을 세웠으나, 5b에서 4명 중 3명(CEO·개발팀장·고객사임원)이 drop 판정을 내렸다. 5c 재응답 라운드에서 고객사임원·개발팀장에는 `reconvince`를 선택했으나 **CEO 응답에서 `drop`을 선언(confidence 80)**, 증거(레퍼런스·TCO 구간·UX probe·파일럿 실데이터)가 전무한 상태에서 재설득이 trust만 깎을 것이라 판단해 run 종결. 5d 실무자 BFS 단계는 도달하지 못했다.

# 단계별 요약

- **5a keyman 초기**: `convince_stakeholders` / confidence 78
  - 핵심 사유: 거버넌스 서사(docs/metrics-methodology)를 고객사 veto 완화 카드로 쓸 수 있고, 파일럿 비용이 낮으며 토큰 중심 서사가 구독 플랜 현실과 맞음. 단, PG·batch 통합 실증과는 무관한 "후행 조치"이며 레퍼런스·가격 구간·제품 성숙도 증거 부재가 약점.

- **5b 직접 stakeholder**: accept 1 / drop 3
  - `sh-div-head` (본부장): **accept** / 74 — 임원진 컨센서스 연장선, 파일럿 비용 낮음. 다만 가격 상한·50+명 레퍼런스 1건은 "확장 단계 숙제"로 조건부.
  - `sh-ceo` (CEO): **drop** / 62 — 레퍼런스 부재, "협의" 가격, Cursor/Copilot 비교 미완, 본부장·개발팀장 의견 선수렴 미실행. "drop ≠ 파일럿 금지"로 분리 제시.
  - `sh-dev-lead` (개발팀장): **drop** / 58 — 위협도 설계(코드 비전송/셀프호스트/자동판정 없음)는 긍정하나, 본질 관문(레거시 자체 솔루션 이해) 불일치 + 감시 도구 정치 리스크. 5가지 보강 요구 명시.
  - `sh-client-exec` (고객사임원): **drop** / 42 — "이 건은 나에게 올릴 것이 아니다" 절차 논리. SI 내부 도구가 발주자 승인 사안으로 올라온 프레임 자체가 감점.

- **5c keyman 재응답 라운드**:
  - `sh-ceo` → **drop (gives up)** / 80. 사유: 새 근거 0개, 증거 없는 재설득은 trust 75를 깎을 뿐. run 종결 수용.
  - `sh-client-exec` → **reconvince** / 52. 프레임 리프레이밍(검토 요청 → 사전 인지 공유), 4조건 중 2개(비용 SI 자체 부담·OSS 셀프호스트 디폴트) 즉답 확약.
  - `sh-dev-lead` → **reconvince** / 62. 결정 스코프를 "전사 표준"에서 "팀장 지정 소규모 팀 4-6주 파일럿"으로 축소, 인사평가 분리를 AX 임원 명의 문서화로 즉답, 파일럿 리더십을 개발팀장에게 이양.
  - (단, keyman이 CEO에서 drop 결정을 내린 이상 run은 종결되므로 후속 4/5 단계는 실행되지 않음)

- **5d 실무자 (BFS)**: 미실행 (run 종결)
  - reject 0 / critical_accept 0 / accept 0 / positive_accept 0

# 실행 리스크

시뮬 상 실패했으나 "가정적으로 통과했다면" 관점의 잔여 리스크는 **높음**.

- keyman의 `decision_authority: partial` → 전사 표준 채택은 CEO 품의가 필수인데, CEO는 레퍼런스·TCO 구간·파일럿 실데이터 등 구조적 증거를 요구하고 있어 본 시뮬이 만약 형식적으로 통과했다 해도 **전사 확산은 실질적으로 차단된 상태**.
- 직접 stakeholder 4명 중 3명 drop(75%)이며, 특히 **실무축 정점(개발팀장)과 veto권자(고객사임원) 동시 반발**. 개발팀장이 반대 스탠스에서 "표면 수용 + 내부 저항 → 파일럿 데이터 왜곡" 시나리오를 스스로 경고한 점은 실무자 단계 critical_accept 비율을 크게 끌어올렸을 것(시니어 sh-dev-senior trust weight 80이 개발팀장과 일치 방향으로 움직이는 구조).
- 본부장의 accept도 confidence 74이며 "확장 단계에서 가격 상한·레퍼런스 1건은 반드시" 조건부 → 파일럿 단계는 통과해도 scale-up 품의에서 실질 도입은 불확실.
- 요약: "keyman partial 권한 + 실무자 반발 많음" 조합으로 **"파일럿은 돌 수 있으나 전사 채택 확산은 매우 불확실"**. 개발팀장이 제시한 kill-switch가 발동될 시 파일럿조차 종료될 리스크.

# 가치제안 개선 포인트

1. **레퍼런스 공백 (50+명 SI 프로젝트 실사례)** — 4/4 세션에서 공통 지적. 대표 발화: "50+명 시나리오는 '시나리오'이지 '사례'가 아니다"(sh-client-exec), "우리가 그 레퍼런스 1호가 되는 것"(sh-dev-lead), "오너 입장에서 기본 drop 사유"(sh-ceo), "본부장 accept confidence가 80 이상으로 올라가지 못한 주된 이유"(sh-div-head). 업종·기간·이탈률 데이터를 동반한 최소 1건 레퍼런스가 가장 비가역적으로 중요.

2. **가격 구간 불투명 (TCO 밴드 미제시)** — 4/4 세션 공통. "상세 가격은 협의"는 CEO 품의 관문에서 자동 차단. 대표 발화: "품의서에 '협의' 단어가 들어가면 재무·법무 단계에서 반드시 막힌다"(sh-ceo), "본격 도입 단계에서 이 부분이 터지면 내가 뒤집어써야 한다"(sh-dev-lead). 50-100명 + 1년 보관 + 고급 리포트 기준의 월 과금 **상·하한 밴드 표기** 필요.

3. **제품 성숙도 증거 부재 (UX probe, UI 스크린샷, 실사용 URL)** — keyman + 3 stakeholder 지적. "증거 부재 자체가 신뢰도 감점 사유"(keyman), "'날 것 숫자만 보여준다'가 raw table 수준인지 실무자가 일상적으로 열어볼 UI인지"(sh-dev-lead, sh-div-head 동일 지적). 데모 영상/스크린샷이 keyman 손에조차 없다는 점이 특히 치명적.

4. **핵심 관문 불일치 (PG·batch·외부 API 통합 실증)** — keyman + 3 stakeholder. "AX 의사결정의 관문은 PG·batch·외부 API 통합 실증인데 Argos는 이를 1mm도 풀어주지 않는다"(sh-dev-lead), "keyman이 스스로 '선결 조건이 아니라 후행 조치'로 분류한 도구를 아직 실증도 안 끝난 시점에 승인하는 건 순서가 어긋난다"(sh-ceo). Claude Code 기반 SI 프로젝트의 **인터페이스 안정성 정량화 사례**를 가치제안에 엮어 제시 필요.

5. **Claude Code 종속 리스크 (Cursor/Copilot 비교 미완)** — keyman + 3 stakeholder. "비교 결과가 나오기 전 Argos까지 묶어 승인하는 건 성급"(sh-ceo), "방향을 틀 경우 즉시 폐기 자산"(sh-dev-lead). Claude Code 도입이 확정되지 않은 고객에겐 Argos가 단일 벤더 종속 프레임으로 읽힘.

6. **감시/인사평가 정치 리스크** — sh-dev-lead + sh-div-head. "팀별·개인별 사용 현황 + 모범 사례 발굴은 표현이 곱더라도 감시·평가 도구로 읽힌다", "토큰 사용량이 개인 KPI로 역전달되는 순간 시니어 저항이 올라온다"(sh-dev-lead). **개인 지표의 인사평가 금지 정책 템플릿 / 거버넌스 가이드라인**을 Argos가 제품 차원에서 제공하면 실무자 저항 완화 가능.

7. **데이터 거버넌스·역산 리스크** — sh-client-exec + sh-dev-lead. "skill/agent 이름은 비즈니스 의도를 드러낸다. `apply-tiered-discount`, `pg-failover-handler` 같은 이름이 외부 SaaS로 흘러가면 시스템 구조 역산 가능"(sh-client-exec). 셀프호스트 디폴트 옵션의 운영 공수 견적과 데이터 삭제 SLA 명시 필요.

# 페르소나 보정 힌트

- **파일: 02_stakeholder_sh-div-head.md** — 본부장이 `accept`를 낸 핵심 근거가 "AX 임원을 공개적으로 깎아내리는 꼴이 된다" "임원 라인 공동 전선"이라는 **정치적 동기**로 수렴. 프로파일의 `trust_with_keyman 80`과 결은 맞으나, 운영 총괄로서의 독립적 실용 판단("운영 리포트 공수 절감")보다 정치적 정렬이 더 무거운 비중으로 적용됨. 본부장의 `tech_literacy: unknown`이 중립 방향이 아니라 "AX 임원 편향" 방향으로 해석된 경향 관찰.

- **파일: 02_stakeholder_sh-client-exec.md** — 고객사임원의 drop 사유가 "SI 내부 도구 선택권은 SI 책임" 같은 **절차적 논리가 중심**인데, 이는 프로파일 `personality_notes`의 "결제·재고·배송 백엔드 안정성에 엄격"보다는 조직 구조 메타 판단에 더 기울어 있음. `tech_literacy: unknown` 필드가 기술적 판단을 비우게 만들면서 판단 축이 "데이터 역산 리스크 + 절차 교정"이라는 보수·형식 논리로 과도하게 수렴했을 가능성.

- **파일: 02_stakeholder_sh-ceo.md** — CEO의 `tech_literacy: unknown`이 결과적으로 "오너/재무·법무 관점의 구조적 거부 사유"로 일관되게 수렴(레퍼런스·가격·사내 절차). 프로파일의 "실패 리스크에 민감"과 일치하나, 기술 성숙도 직접 판단은 모두 keyman 발화로 위임 → unknown 필드가 실제로 "보수적 위임"으로 자연스럽게 처리된 긍정 사례.

- **파일: 03_keyman_response_sh-ceo_round1.md** — keyman의 즉각적 `drop` 전환이 `decision_authority: partial`과는 일관되지만, `trust_with_salesman: 70` + `personality_notes`의 "salesman을 선생님으로 여기며 월 1회 식사"를 고려하면 **한 번 더 재정의/축소 시도** 없이 바로 run 종결로 간 것은 다소 이른 포기. 다만 자신이 01에서 적어둔 "후행 조치" 문구를 CEO가 역인용해 논리적 퇴로가 막힌 점은 잘 반영됨. 향후 캘리브레이션에서 keyman이 reframe(범위 축소 → 파일럿 권한 내 진행) 옵션을 먼저 시도하는지 관찰 필요.

- **파일: 03_keyman_response_sh-dev-lead_round1.md** — keyman이 개발팀장에게는 "파일럿 리더십 이양"이라는 큰 정치 양보를 했는데, CEO 라운드에서는 "본부장 공동 전선 구축 → 2라운드"라는 CEO가 직접 열어준 우회로를 시도조차 하지 않고 즉시 포기. **동일 keyman 내 설득 에너지 투하의 비대칭**이 관찰됨. 프로파일의 "partial 권한 + CEO influence 95"라는 비대칭이 지나치게 강하게 작용한 흔적.

# 세션 로그

- 01_keyman_initial.md
- 02_stakeholder_sh-ceo.md
- 02_stakeholder_sh-client-exec.md
- 02_stakeholder_sh-dev-lead.md
- 02_stakeholder_sh-div-head.md
- 03_keyman_response_sh-ceo_round1.md
- 03_keyman_response_sh-client-exec_round1.md
- 03_keyman_response_sh-dev-lead_round1.md
