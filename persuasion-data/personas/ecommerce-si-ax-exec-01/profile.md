---
persona_id: ecommerce-si-ax-exec-01
version: 1
created_at: 2026-04-22
updated_at: 2026-04-22
company_meta:
  industry: "e커머스 SI/SM (외주 개발·운영)"
  size: "50-100"
  stage: "established"
  notes: |
    장기 업력의 중견 SI. 자체 e커머스 플랫폼 솔루션을 다년간 유지보수해 온 "개발자 중심" 문화.
    금융·공공·패션·MRO 등 규제·엔터프라이즈 도메인 레퍼런스를 다수 보유.
    잡플래닛 평점은 중간대 (3.0점대)로, 변화에 대한 피로감이 기저에 있을 수 있음.
    단일 대형 프로젝트(6~12개월, 50+명)에 전사 리소스의 상당 비중이 투입되는 구조.
keyman:
  id: km
  role: "AX 담당 임원"
  decision_authority: partial
  budget_range_krw: unknown
  tech_literacy: high
  risk_preference: moderate
  personality_notes: |
    salesman을 '선생님'으로 여기며 월 1회 식사할 정도로 관계 형성 (trust 70).
    임원진 내부 컨센서스(대표 포함)는 이미 완료. 본인의 현재 과제는 실행 방법론/도구 선택과 기술 실증.
    AX 담당직은 장기 업력 SI 기업에서 비교적 신설된 포지션일 가능성이 높음.
    → 기존 개발조직(특히 개발팀장) 및 자체 솔루션 오너십 그룹과의 정치적 긴장이 잠재.
    AI 주도 개발의 '통합 안정성'(PG·batch·외부 인터페이스)에 대한 실증이 의사결정의 관문.
  current_pains:
    - "50+명 규모 대형 외주 개발 프로젝트의 생산성/품질 관리 부담"
    - "차세대 AX 프로젝트를 런칭해야 하는데 도구/프로세스가 아직 확정 안 됨"
    - "AI 주도 개발이 실제 e커머스 복잡 인터페이스(PG, batch, 외부 API)에서 작동할지 확신 부족"
    - "레거시 자체 솔루션을 AI가 이해/확장할 수 있는가에 대한 실증 부재"
  existing_alternatives:
    - "전통적 SI 개발 프로세스 유지 (현 상태)"
    - "Cursor / Copilot 등 다른 AI 코딩 도구 (비교 검토 중이나 salesman 의견에 따를 예정)"
  buy_triggers:
    - "AX 차세대 프로젝트 착수 일정 도래"
    - "salesman이 추천한 도구·방법론에 대한 신뢰 (Claude Code 도입 의향 기울어 있음)"
    - "AI 주도 개발의 인터페이스 연동 실증(PG, batch 등) 확인"
  reject_triggers:
    - "PG사 연동, batch job 등 인터페이스 통합 실증 실패"
    - "보안·규제·감사 통과 불확실성 (금융/공공 레퍼런스 고려)"
    - "고객사(패션 e커머스) 측 임원의 거부감"
    - "개발팀장/시니어 실무진의 완강한 반발"
  communication_style: "임원진과는 비전/ROI 요약, 실무진(개발팀장·시니어)과는 구체적 기술 이슈까지 깊이 논의"
trust_with_salesman: 70
stakeholders:
  - id: sh-ceo
    role: "대표"
    relation_to_keyman: direct
    influence: 95
    decision_weight_hint: "최종 품의권자. 이미 AX 프로젝트 필요성에 공감 상태."
    tech_literacy: unknown
    personality_notes: "장기 업력 SI의 창업/오너 스타일일 가능성. 전사 리소스가 걸린 건이므로 실패 리스크에 민감."
    trust_with_keyman: 75
    connected_to: []
  - id: sh-div-head
    role: "본부장"
    relation_to_keyman: direct
    influence: 70
    decision_weight_hint: "프로젝트 운영 총괄. 임원진 컨센서스 참여. keyman의 가장 가까운 내부 우군 역할 가능."
    tech_literacy: unknown
    trust_with_keyman: 80
    connected_to:
      - { id: sh-dev-lead, weight: 70 }
  - id: sh-dev-lead
    role: "개발팀장"
    relation_to_keyman: direct
    influence: 75
    decision_weight_hint: "실제 도구 도입 가능성/공수 판단의 핵심. 실무 반발의 진원이 될 가능성 높음."
    tech_literacy: high
    personality_notes: |
      장기 업력 회사의 자체 e커머스 솔루션을 오래 유지·확장해 온 핵심 실무자.
      '개발자 중심' 문화의 상징적 인물. 자체 플랫폼에 대한 오너십·도메인 지식 자부심 강함.
      AI가 레거시 솔루션 코드베이스를 이해·생성할 수 있는가에 가장 비판적.
      대형 SI 프로젝트 납기/공수 경험이 풍부 → 새 도구 도입의 학습비용·실패비용을 엄격히 계산.
      keyman(AX 임원)의 신설 포지션과의 정치적 긴장을 내면에 품을 수 있음.
    trust_with_keyman: 60
    connected_to:
      - { id: sh-dev-senior, weight: 80 }
      - { id: sh-dev-junior, weight: 70 }
      - { id: sh-planner, weight: 50 }
  - id: sh-client-exec
    role: "고객사 임원 (패션 e커머스)"
    relation_to_keyman: direct
    influence: 90
    decision_weight_hint: |
      외주 프로젝트 발주자로서 사실상 veto power 보유.
      패션업 특성상 시즌 납기·마케팅 기술 수용에는 개방적이나, 결제·재고·배송 백엔드 안정성에는 매우 엄격.
    tech_literacy: unknown
    personality_notes: |
      패션 e커머스: 시즌 세일·신상 런칭 납기가 절대적. 마케팅/퍼스널라이제이션 등 신기술 도입 친화적.
      반면 결제 실패·재고 싱크 오류·배송 장애는 즉시 매출·브랜드 타격 → AI 생성 코드의 안정성에 의심.
      "AI로 개발했다"는 사실이 대외 홍보 호재일 수도(패션업 감성), 반대로 주주/감사 앞 리스크 이슈일 수도 있음.
    trust_with_keyman: 70
    connected_to: []
  - id: sh-dev-senior
    role: "실무 개발자 (시니어)"
    relation_to_keyman: downstream
    influence: 30
    tech_literacy: high
    personality_notes: |
      자체 솔루션/도메인 지식을 깊게 축적한 실무자. 개발팀장과 가치관 유사.
      AI 도구가 자신의 전문성을 대체/희석한다고 느끼면 표면적 수용 + 내부 저항 가능.
      한편 반복 작업 해방·품질 개선의 실질적 가치를 보면 강력한 옹호자로 전환될 수 있음.
    trust_with_keyman: unknown
    connected_to: []
  - id: sh-dev-junior
    role: "실무 개발자 (주니어)"
    relation_to_keyman: downstream
    influence: 15
    tech_literacy: unknown
    personality_notes: |
      AI 코딩 도구에 상대적으로 친화적일 가능성. 학습 기회로 반길 수 있음.
      다만 시니어/팀장 분위기를 강하게 따라감 → 독립적 의견 형성 약함.
    trust_with_keyman: unknown
    connected_to: []
  - id: sh-planner
    role: "실무 기획자"
    relation_to_keyman: downstream
    influence: 20
    tech_literacy: low
    personality_notes: |
      AX/AI 개발이 자신의 요구사항 전달·변경 프로세스를 어떻게 바꾸는지에 관심.
      프롬프트 엔지니어링이 기획자에게 요구되는지, 산출물 검수 방식이 바뀌는지가 쟁점.
    trust_with_keyman: unknown
    connected_to: []
competing_solutions:
  - name: "모니터링 부재 (현 상태)"
    usage: using
    strengths: ["추가 비용 없음", "기존 프로세스 유지"]
    weaknesses: ["팀별 Claude Code 사용 현황 파악 불가", "토큰 한도·생산성 블랙박스"]
    switching_cost: low
  - name: "자체 대시보드 구축"
    usage: aware
    strengths: ["완전한 커스터마이징", "데이터 외부 유출 없음", "자체 플랫폼 역량 활용 가능"]
    weaknesses: ["초기 구축 비용·공수", "유지보수 부담", "AX 본업 아님"]
    switching_cost: high
---

# 회사·키맨 배경

장기 업력(25+년)의 중견 e커머스 SI 기업. 자체 e커머스 플랫폼 솔루션을 기반으로 엔터프라이즈 고객(패션·금융·공공·MRO)의 대형 쇼핑몰 구축·운영을 외주 수행. 전사 규모(50~100명) 대비 단일 프로젝트에 50+명이 투입되는 구조 → **프로젝트 단위 성공·실패가 전사 실적에 직결**.

keyman은 AX 담당 임원으로, 차세대 AX 프로젝트에서 **AI 주도 개발 프로세스를 전사 표준으로 도입**하려는 미션을 갖고 있음. 대표 및 임원진 컨센서스는 이미 확보된 상태이며, 현재 과제는 **도구 선택 + 기술 실증 + 실무 조직 설득**.

salesman과는 월 1회 식사 수준의 지속적 관계(선생님 포지션, trust 70). Claude Code 도입에 적극적으로 기울어 있으나, **PG·batch·외부 API 인터페이스 통합 실증**이 의사결정의 관문.

# 조직 역학 메모

- **임원 축 (CEO / 본부장 / AX 임원)**: 이미 컨센서스 형성. 본부장이 keyman의 가장 가까운 내부 우군(trust 80).
- **실무 축 (개발팀장 ← 시니어 / 주니어 / 기획자)**: 자체 솔루션에 대한 오너십·자부심이 강한 "개발자 중심" 문화의 코어. **개발팀장(trust_with_keyman 60)이 전체 의사결정의 최대 리스크 포인트**. keyman의 AX 임원직이 장기 업력 조직에서 신설 포지션일 가능성이 높아, 기존 개발조직과의 정치적 긴장이 잠재.
- **외부 축 (패션 고객사 임원, 사실상 veto)**: 시즌 납기·브랜드 리스크에 민감. AI 개발이 대외 홍보로 긍정 작용할 여지 vs 주주·감사 앞 리스크 이슈일 가능성이 공존.

# 시뮬 관전 포인트

1. **Claude Code 도입 자체는 salesman 의견에 따를 의향** → 이번 시뮬의 본질적 질문은 "Argos가 이 고객에게 매력적인가" 이며, Claude Code 도입 설득은 전제로 둘 수 있음.
2. **개발팀장(sh-dev-lead)에서 drop 발생 가능성이 가장 높음**. 5c 재설득 라운드의 성패가 전체 run을 좌우.
3. **PG·batch 통합 실증**은 Argos의 직접 기능 영역이 아니지만, keyman의 결정 관문에 강하게 자리잡고 있음 → 가치제안에서 Claude Code 기반 개발의 실증 사례·인터페이스 품질 데이터를 어떻게 엮어 보여줄지가 쟁점.
4. **패션 고객사 임원의 veto**는 "AI 개발 도구의 운영 모니터링·거버넌스" 관점에서 Argos가 오히려 **설득 재료**가 될 수 있음 (→ "AI 도입했으니 불안"이 아니라 "AI 도입했고 모니터링/감사 체계도 있다").
