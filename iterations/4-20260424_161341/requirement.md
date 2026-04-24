# Requirement

## 가치제안

# Argos 가치제안

**Claude Code를 쓰는 팀을 위한 Google Analytics.**

---

## 제품 개요

Argos는 팀이 Claude Code를 얼마나, 어떻게 쓰고 있는지 — 세션·토큰·skill·subagent 활용 — 한 대시보드에서 볼 수 있게 해주는 관찰 플랫폼입니다.

## 핵심 가치

### 1. 가시성
팀 전체의 Claude Code 활동을 한 곳에서 확인합니다.
- 누가 언제 어떤 skill / subagent를 썼는가
- 프로젝트별, 팀원별 사용 패턴 비교
- 세션 단위 상세 로그

### 2. 토큰 한도 관리
대부분 구독 플랜이라 "비용" 서사는 약합니다. 대신 **토큰 사용/한도**를 중심에 둡니다.
- 입력/출력/캐시 토큰 별도 추적
- 모델별(Opus, Sonnet, Haiku) 사용량 분석
- 토큰 한도 대비 소진율 알림

### 3. Skill / Agent ROI (측정 방법론 공개)
팀이 만든 skill·subagent 중 실제로 쓰이는 것과 죽은 것을 구분합니다.
- Skills / Agents 대시보드에 **호출 수**, **Users(고유 사용자 수)**, **Success rate**(POST_TOOL_USE 이벤트 중 exit_code가 0 또는 null인 비율) 3축 동시 노출. 단일 "호출 수" 지표로 판별하지 않습니다.
- 각 컬럼 헤더에 툴팁으로 **SQL 공식 그대로** 표시. "성공률" 같은 모호한 단독어 사용 금지.
- `/docs/metrics-methodology` 정적 문서 페이지에 모든 지표(callCount, sessionCount, userCount, successRate, 토큰 지표, 추정 비용)의 SQL 집계 공식 + 해석 가이드 공개.
- "죽은 skill" 판별은 **예시 임계값**(예: 최근 30일 callCount == 0 AND userCount ≤ 1)만 docs에 제시. 대시보드는 자동 라벨링/경고/색상 없이 **날 것 숫자만** 보여줍니다. 판별 기준은 팀이 스스로 결정.

### 4. 0 설정 합류
```bash
argos init
```
한 번이면 프로젝트 셋업 + 팀 합류 끝. 이후 팀원은 추가 행동 불필요.
- Claude Code hooks 자동 설정
- 팀 초대 링크로 원클릭 합류

---

## 기술 아키텍처

### 데이터 수집 방식
- Claude Code의 hooks 기능 활용 (SessionStart, PreToolUse, PostToolUse, Stop 이벤트)
- 로컬 CLI가 이벤트를 API로 전송
- 코드 내용은 전송하지 않음 — 메타데이터만
- 전송 항목은 `/docs/metrics-methodology`에 전수 명시 (툴 이름, 이벤트 타입, exit_code, 토큰 카운트, 타임스탬프, skill/agent 이름)

### 배포 옵션
1. **관리형 SaaS**: 즉시 사용 가능, 무료 티어 제공
2. **셀프호스트 OSS**: 자체 인프라에 배포 가능

### 기술 스택
- CLI: Node.js (npm 패키지)
- API: Node.js + Hono (Railway)
- Web: Next.js (Vercel)
- DB: PostgreSQL (Supabase)

---

## 대형 SI 프로젝트에서의 활용 시나리오

### 50+명 규모 프로젝트 관리
- **팀별 사용 현황 대시보드**: 개발팀, QA팀, 기획팀의 Claude Code 활용도 비교
- **개인별 생산성 지표**: 세션당 평균 토큰, 자주 쓰는 skill 패턴
- **프로젝트 마일스톤별 추적**: 설계 단계 vs 구현 단계 vs 버그픽스 단계의 AI 활용 변화

### AX 도입 효과 측정
- **Before/After 비교**: AI 도입 전후 개발 생산성 지표 (토큰 활용 패턴 기반)
- **ROI 리포트**: 팀이 만든 커스텀 skill의 Users × Success rate × 호출 수 3축 측정. 판단은 팀이.
- **모범 사례 발굴**: 생산성 높은 팀원의 사용 패턴 분석 및 공유

### 거버넌스 / 감사 대응
- **사용 이력 아카이브**: 누가 언제 어떤 AI 기능을 썼는지 추적 가능
- **RBAC**: OWNER / MEMBER 2단계 역할 분리
- **측정 방법론 공개**: `/docs/metrics-methodology` 페이지 자체가 감사·고객사 브리핑 자료로 활용 가능 (지표가 어떻게 계산되는지 SQL 공식까지 공개)
- **외부 감사 대응**: AI 도입 현황을 정량적으로 보고 가능

---

## 가격

- **무료 티어**: 소규모 팀, 기본 대시보드
- **팀 플랜**: 팀 멤버 수 + 이벤트 보관 기간 + 고급 리포트 기반 과금
- **엔터프라이즈**: 셀프호스트 옵션, SLA, 전용 지원

상세 가격은 협의.

---

## 경쟁 대안 대비

| 옵션 | 장점 | 단점 |
|------|------|------|
| **모니터링 부재 (현 상태)** | 추가 비용 없음 | 팀별 사용 현황 파악 불가, 블랙박스 |
| **자체 대시보드 구축** | 완전한 커스터마이징 | 초기 구축 비용·공수, 유지보수 부담 |
| **Argos** | 0 설정, 즉시 시작, 측정 공식 공개, OSS 옵션 | 외부 서비스 의존 (단, 셀프호스트 가능) |

---

## 다음 단계

1. `argos init`으로 파일럿 프로젝트에 설치 (5분)
2. 1-2주간 실제 사용 데이터 수집
3. 대시보드에서 팀 활용 패턴 확인 (Skills/Agents: 호출 수 + Users + Success rate 3축)
4. 본격 도입 여부 결정

## 채택된 요구사항

- **run_id**: `ecommerce-si-ax-exec-01_20260424_161607`
- **title**: `/docs/pricing` 정적 페이지 신규 + `shared/constants/pricing.ts`에 팀 사이즈별 월 USD 잠정 밴드 상수 정의 + 가치제안/랜딩/README의 "상세 가격은 협의" 문구 전수 제거

### 유래한 고객 pain + 근거 인용

소스: `persuasion-data/runs/ecommerce-si-ax-exec-01_20260424_161607/report.md`. 페르소나 `ecommerce-si-ax-exec-01` (e커머스 SI 중견기업 AX 담당 임원). 시뮬 최종 판정 **실패 (keyman_gives_up)**. keyman이 5c 라운드에서 CEO drop 판정 이후 재설득을 시도하지 않고 run 종결한 것이 실패의 직접 원인. CEO drop 근거 3개 중 하나가 "가격 '협의' 블랙박스" — 이 요구사항으로 그 한 축을 제거한다.

report.md 직접 인용 (가치제안 개선 포인트 #2 — **4/4 stakeholder 공통 지적**, CEO drop 결정적 근거):

> **가격 구간 불투명 (TCO 밴드 미제시)** — 4/4 세션 공통. "상세 가격은 협의"는 CEO 품의 관문에서 자동 차단. 대표 발화: "*품의서에 '협의' 단어가 들어가면 재무·법무 단계에서 반드시 막힌다*"(sh-ceo), "*본격 도입 단계에서 이 부분이 터지면 내가 뒤집어써야 한다*"(sh-dev-lead). 50-100명 + 1년 보관 + 고급 리포트 기준의 월 과금 **상·하한 밴드 표기** 필요.

CEO(influence 95, 최종 품의권자)의 5b drop 판정(confidence 62)에서 "'협의' 가격"이 drop 근거 3개 중 하나로 명시되었고, 5c에서 keyman이 증거 부재 상태의 재설득은 trust만 깎는다고 판단해 바로 run 종결. 4개 drop 축(레퍼런스 공백 / 가격 협의 / Cursor·Copilot 비교 미완 / 제품 성숙도) 중 **가장 저비용으로 제거 가능**하고 **AI 에이전트가 CLI에서 완결 가능**한 축이 이번 티켓 대상.

기존 가치제안(`persuasion-data/runs/ecommerce-si-ax-exec-01_20260424_161607/value_proposition.md` L82-88)의 "가격" 섹션에 이미 "상세 가격은 협의" 한 줄이 명시되어 있어, 이 문구 자체가 SI/엔터프라이즈 고객 접촉 시 품의서 단계에서 자동 차단 사유가 되고 있음을 시뮬이 확인.

### 구현 스케치

1. **`packages/shared/src/constants/pricing.ts` 확장** — `TEAM_PLAN_TIER_BAND` 상수 및 disclaimer 추가:
   ```typescript
   export const TEAM_PLAN_TIER_BAND = {
     solo:   { memberRange: [1, 5],    monthlyUsdMin: 0,   monthlyUsdMax: 0,    label: "Free" },
     small:  { memberRange: [6, 20],   monthlyUsdMin: 49,  monthlyUsdMax: 199,  label: "Team" },
     medium: { memberRange: [21, 50],  monthlyUsdMin: 199, monthlyUsdMax: 599,  label: "Team" },
     large:  { memberRange: [51, 200], monthlyUsdMin: 599, monthlyUsdMax: 1999, label: "Enterprise" },
   } as const
   export const PRICING_BAND_DISCLAIMER =
     "GA 이전 단계의 참고용 밴드이며, 최종 가격은 GA 시점에 ±30% 범위 내에서 확정됩니다."
   ```
   실제 숫자 4쌍 × 3개(월 USD 상·하한 12개)는 시장 벤치마크 기준 잠정값. disclaimer에는 **변동 범위를 수치(±30%)로 명시**하여 "협의"를 disclaimer로 교묘히 재포장하는 위험 차단.

2. **`packages/web/src/app/docs/pricing/page.tsx` 신규** — 정적 Next.js 라우트. `/docs/metrics-methodology` 패턴(commit `d02626c` 참고)과 동일하게 단일 `page.tsx` 구조. CMS/MDX 도입 금지.
   - 상단: `PRICING_BAND_DISCLAIMER` 문구를 prose 첫 블록으로 명시.
   - 3개 플랜 카드 (Free / Team / Enterprise):
     - 팀 사이즈 허용 범위 (TEAM_PLAN_TIER_BAND에서 import)
     - 이벤트 보관 기간 (무료: 30일 / 팀: 1년 / 엔터프라이즈: 무제한 + 셀프호스트)
     - 포함/미포함 기능 목록 (예: 팀: 대시보드·기본 리포트·RBAC / 엔터프라이즈: 셀프호스트·SLA·전용 지원)
     - 월 USD 상·하한 밴드 표기 ($X ~ $Y/mo)
   - "상세 견적은 문의" 같은 블랙박스 표현 금지. 대신 "GA 전 변경 가능 (±30% 범위 내)"만 명시.

3. **기존 "상세 가격은 협의" 문구 전수 제거** — 다음 위치를 grep으로 전수 확인 후 `/docs/pricing` 링크로 교체:
   - 가치제안 문서 draft 템플릿 (이전 iteration에서 참조 가능성)
   - 랜딩 페이지 (`packages/web/src/app/page.tsx` 또는 관련 섹션)
   - README (루트 + 각 패키지)
   - mission.md / prd.md (docs/)
   - 그 외 "상세 가격은 협의" / "협의" / "contact for pricing" 패턴
   - 일부만 교체하면 고객이 "협의"와 "밴드"를 동시에 보고 혼란을 일으킴 → **전수 교체가 필수**.

4. **스코프 제외 (조건부 조건 1에 따라 별도 후속 티켓으로 연기)**:
   - Overview 대시보드 `<TeamPlanEstimateCard />` 추가 — 이번 티켓 제외.
   - Summary API에 `memberCount` 필드 추가 — 이번 티켓 제외.
   - 이유: (a) memberCount 필드가 현재 어느 API에도 노출되어 있지 않아 API + DTO + hook 변경이 추가로 들어감, (b) "협의" 제거라는 pain의 본질은 docs 페이지 + 랜딩 문구 교체만으로 완전히 해소됨, (c) 카드는 `/docs/pricing`이 실제 고객 접촉에서 품의 차단을 해소했다는 1건 이상의 증거가 생긴 뒤 재제안.

5. **변경 없음**: Prisma 마이그레이션 없음, CLI 변경 없음, DB 스키마 변경 없음, API 스키마 변경 없음, 결제/과금 로직 없음, Free/Team tier 기능 차등 enforcement 없음. 이 티켓은 **정보 노출 + "협의" 블랙박스 제거**에만 한정.

예상 규모: shared constants 1 확장 + 정적 docs page 1 신규 + 기존 문서 전수 grep·교체. 약 150~250 LoC + 문서 수정.

### CTO 승인 조건부 조건

1. **Overview 카드는 이번 티켓에서 제외** — `/docs/pricing` 정적 페이지 + `shared/constants/pricing.ts` 확장 + 기존 "상세 가격은 협의" 문구 전수 교체만 이번 티켓 스코프. `TeamPlanEstimateCard`·`memberCount` 필드 노출·Overview 수정은 별도 후속 티켓으로, `/docs/pricing`이 실제 고객 접촉에서 품의 차단을 해소했다는 1건 이상의 증거 수집 후 재제안.

2. **`PRICING_BAND_DISCLAIMER` 문구의 변동 범위는 수치로 못박을 것** — "Draft bands for evaluation" 수준이 아니라 "GA 이전 단계의 참고용 밴드이며, 최종 가격은 GA 시점에 ±30% 범위 내에서 확정됩니다" 형태로 변동 범위를 수치(±30%)로 명시. "협의"를 disclaimer로 교묘히 재포장하는 위험 차단.

3. **상수 숫자 12개(4 tier × 3 필드)는 비즈니스 오너 리뷰를 commit 전 필수 게이트로 승격** — 제안자의 "리뷰 없으면 draft 그대로 commit"은 거부됨. 초기 고객에게 틀린 앵커를 형성하면 GA 시점 변경해도 비용이 크다. GA 전 변경 가능 disclaimer가 있어도 초기 앵커 오류는 방어해야 함. **이 한 지점은 인간 개입 필수**. (HEADLESS 무인 실행에서는 이 게이트를 plan-and-build / implementation 단계에서 warning으로 surface하거나, 첫 숫자 제안을 draft 상태로 커밋한 뒤 비즈니스 오너가 별도 리뷰 PR을 열 수 있도록 PR 설명에 명시한다.)

4. **"상세 가격은 협의" 문구 전수 제거를 이번 티켓 범위 내에서 완료** — 가치제안 문서 템플릿 / 랜딩 / README / docs(mission.md·prd.md) / 그 외 일체를 grep으로 전수 확인 후 `/docs/pricing` 링크로 교체. 일부만 교체하면 고객이 "협의"와 "밴드"를 동시에 보고 혼란을 일으키므로, 전수 교체가 머지 조건.
