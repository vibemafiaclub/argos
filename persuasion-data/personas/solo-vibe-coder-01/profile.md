---
persona_id: solo-vibe-coder-01
version: 1
created_at: 2026-04-22
updated_at: 2026-04-22
company_meta:
  industry: "1인 인디 개발 (B2C/툴·SaaS 지향)"
  size: "1"
  stage: "pre-launch / MVP 탐색"
  notes: |
    회사 소속 없는 개인 바이브코더. 본업 또는 사이드로 Claude Code를 주 개발 도구 삼아
    본인이 원하는 제품을 만들고자 함. 팀·예산·감사 컨텍스트 없음 — 모든 결정은 본인.
keyman:
  id: km
  role: "1인 개발자 (vibe coder)"
  decision_authority: full
  budget_range_krw: "월 2~10만 수준 추정 (개인 지갑)"
  tech_literacy: medium
  risk_preference: unknown
  personality_notes: |
    Claude Code를 '주 개발 수단'으로 삼은 타입. 전통적 엔지니어링 프로세스보다
    '시키고-확인하고-고친다'는 바이브코딩 루프에 익숙.
    관심사는 (1) 토큰 태워서 만든 결과물이 "안정적인 제품"으로 안 굳는 경험,
    (2) 잘하는 바이브코더는 뭘 다르게 하는지에 대한 궁금증.
    도구에 월 구독을 여러 개 붙이는 것에 대한 피로감이 있을 수 있음.
  current_pains:
    - "클로드 코드로 제품을 빨리 뽑긴 뽑는데, 자주 깨지고 왜 깨지는지 모름"
    - "토큰(또는 요청 한도)을 어디에 얼마나 쓰고 있는지 감이 없음 — 구독 한도 근처에서 제한 걸리는 경험"
    - "내 바이브코딩 워크플로가 좋은 건지 나쁜 건지 비교할 기준이 없음"
    - "안정적인 제품을 더 빨리 만들고 싶은데, 어디를 개선해야 할지 모름"
  existing_alternatives:
    - "아무 계측 없이 그냥 Claude Code 사용 (현 상태)"
    - "X(트위터)/디스코드/유튜브에서 다른 바이브코더들 워크플로 눈동냥"
    - "Cursor 등 타 AI IDE로 옮기는 옵션 (비교 검토)"
  buy_triggers:
    - "구독 한도 초과·쓰로틀링 경험 직후"
    - "본인이 만든 제품이 반복적으로 깨지는데 원인 추적이 안 될 때"
    - "잘나가는 인디 해커의 Argos 인증샷/후기를 봤을 때"
  reject_triggers:
    - "월 구독 비용이 개인 체감상 부담 (Claude Code 구독 위에 얹어야 함)"
    - "세팅이 복잡하거나 팀 전용 기능 위주로 보여 '1인에겐 오버킬' 인상"
    - "내 소스/프롬프트/결과가 외부로 나가는 느낌"
  communication_style: "혼자 결정. 외부 상의는 거의 없음 — X/디스코드 피드 분위기가 간접 영향."
trust_with_salesman: 40
stakeholders: []
competing_solutions:
  - name: "아무 계측 없이 Claude Code만 사용 (현 상태)"
    usage: using
    strengths: ["추가 비용 0", "설치/설정 부담 0"]
    weaknesses: ["토큰 사용/한도 블랙박스", "워크플로 개선 근거 없음", "제품 불안정 원인 추적 불가"]
    switching_cost: low
  - name: "Cursor / 기타 AI IDE 전환"
    usage: aware
    strengths: ["다른 사용감·자동완성"]
    weaknesses: ["Claude Code의 agentic 워크플로 이탈", "역시 계측은 없음"]
    switching_cost: medium
  - name: "ccusage 등 OSS CLI 토큰 추적"
    usage: unknown
    strengths: ["무료", "로컬 설치로 데이터 안 나감"]
    weaknesses: ["워크플로 품질 분석은 안 됨", "시각화·인사이트 약함"]
    switching_cost: low
---

# keyman 배경

혼자 제품을 만들고자 하는 개인 바이브코더. Claude Code가 '직장 동료 + 주니어 + 페어'를 전부 겸하는 구조. 제품 출시·유지·개선까지 본인 혼자 책임지므로, **"시간당 만드는 안정성"** 이 사실상 KPI.

# 조직 역학 메모

- 조직·스테이크홀더 없음. 모든 판단은 keyman 한 명이 내리며, 재무 승인·보안 감사·실무자 반발 같은 **내부 마찰은 0**.
- 대신 구매 저항의 전부가 **keyman 한 명의 체감 비용(가격·설치 마찰·인지 부하)** 에 집중됨.
- 외부 입력은 X/디스코드/유튜브의 **인디 커뮤니티 여론**(간접 소셜 프루프)과, "내가 만들 제품의 안정성"이라는 **자기 피드백 루프** 두 축뿐.

# 시뮬 관전 포인트

1. Argos의 "**팀용 GA**" 포지셔닝이 1인에게 **오버킬·이질감**으로 작동할지, 혹은 "작은 팀=나 자신"으로 내재화될지.
2. "비용"보다 "**토큰 한도/사용**" 서사가 실제로 더 후킹되는지 (memory와 합치).
3. "안정적 제품을 빠르게"라는 keyman 니즈와 Argos의 현재 기능(사용량·명령·워크플로 가시화)이 **"제품 안정성"까지 연결되는 스토리**가 되는지, 아니면 중간 점프가 너무 큰지.
4. 월 구독이 개인 지갑에서 **Claude Code 구독 위에 한 번 더 얹히는 심리 저항**을 넘을 수 있는 가치 프레이밍이 있는지.
