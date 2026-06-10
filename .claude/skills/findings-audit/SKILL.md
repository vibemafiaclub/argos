---
name: findings-audit
description: 코드베이스 전반을 감사해 기술 부채·아키텍처 비직관성·품질 게이트 이슈·코드 퀄리티 이슈·버그를 파악하고, 결과를 docs/findings/ 에 FCG 규약대로 문서화한 뒤 commit & push까지 완수한다. 주기 실행을 전제로 기존 findings와 중복되지 않게 증분 감사한다. 트리거 — "부채 파악", "findings 작성", "코드베이스 감사", "감사 돌려줘", "/findings-audit" 및 유사 의도.
---

# findings-audit

코드베이스 전반 감사 → `docs/findings/` 문서화 → commit & push 를 한 번에 수행하는 skill.
**주기적으로(스케줄/수동) 반복 실행되는 것을 전제**로 하므로, 매 실행은 "전체 재감사"가 아니라
**기존 findings 대비 증분 감사**다. 사용자 확인 없이 끝까지 완주한다.

## 0. 대원칙

1. **`docs/findings/AGENTS.md` 가 단일 규약이다.** 실행 시 반드시 먼저 읽고, 파일명·frontmatter·본문 구조·honesty rules를 그대로 따른다. 이 skill과 AGENTS.md가 충돌하면 AGENTS.md가 이긴다.
2. **file:line 증거 없는 주장은 finding이 아니다.** 코드를 직접 확인하지 못한 항목은 버린다. ("hunch는 finding이 아니다")
3. **중복 생성 금지.** 기존 미해결 finding과 같은 이슈를 새 파일로 만들지 않는다 — 기존 파일의 `status_notes`에 추가하거나 본문을 보강한다.
4. **닫힌 이슈를 발견하면 정직하게 닫는다.** 기존 finding의 항목이 코드상 이미 해소됐음을 확인하면(grep/Read로 검증), `resolved: true|partial` + `resolved_by`(커밋 SHA) + 증거를 기록한다. 검증 못 했으면 건드리지 않는다.
5. **감사 중 코드를 고치지 않는다.** 이 skill의 산출물은 문서뿐이다. 수정은 별도 작업/goal로 승격해서 한다.

## 1. 절차

### 1-1. 준비

```bash
date -u +"%Y-%m-%dT%H%MZ"   # 이번 배치의 UTC 타임스탬프 (파일명 prefix로 공유)
```

- `docs/findings/AGENTS.md` 와 `docs/findings/EXAMPLE.md` 를 읽는다.
- 기존 findings 인벤토리를 만든다: 각 파일의 `title` / `resolved` / `priority` / 핵심 주제를 표로 정리. 이것이 이번 실행의 **중복 방지 기준선**이다.
- 기준선 이후의 변경 규모를 파악한다: 마지막 findings 배치 커밋 이후의 `git log --oneline` / `git diff --stat`. 변경이 집중된 영역을 우선 감사 대상으로 삼는다.

### 1-2. 5개 차원 병렬 감사

아래 5개 차원을 **Explore subagent 병렬 fan-out**으로 감사한다 (한 메시지에 5개 Agent 호출).
각 subagent 프롬프트에 반드시 포함할 것: (a) 담당 차원의 정의, (b) 기존 findings 인벤토리 요약(중복 방지), (c) "모든 발견은 `file:line` + 근거 코드 인용 필수, 추측 금지" 지시, (d) 최근 변경 집중 영역.

| 차원 | 관점 |
|---|---|
| **기술 부채** | 배포 파이프라인, 의존성(버전 고정·취약·미사용), 문서 드리프트, 죽은 코드, TODO/FIXME 방치 |
| **아키텍처 비직관성** | 새 기여자가 헤맬 구조 — 암묵적 불변식, 우회 패턴, 레이어 침범, 이름과 실제 동작의 불일치 |
| **품질 게이트 이슈** | 커버리지 공백, CI에서 실제로 안 도는 검사, 테스트 실행속도, 유효성(과적합·shallow 성공 선언), flaky |
| **코드 퀄리티 이슈** | 에러 처리 일관성, 무음 catch, 복붙 중복, 타입 우회(any/as), 거대 함수 |
| **버그** | 실제 오동작 — 접근 제어, 데이터 정합성(레이스·캐시 무효화 누락), 경계 조건, 보안 |

### 1-3. 검증 & 선별

subagent 결과를 모아서:

- file:line 근거가 없는 항목은 직접 Read로 재확인하거나 버린다.
- 기존 finding과 겹치는 항목 → 해당 파일 업데이트 목록으로 분류.
- 신규 항목 → 차원/주제별로 묶어 finding 문서 단위를 정한다 (한 문서는 60초 안에 훑을 수 있게, ~400줄 초과 금지).
- 각 문서에 priority 부여: `P0`(데이터 정합성/체인 블로커) / `P1`(릴리스 전 위험) / `P2`(릴리스 후 정리).

### 1-4. 문서 작성

- 신규: `docs/findings/<YYYY-MM-DDTHHMM>-<slug>.md` (1-1의 배치 타임스탬프 공유). frontmatter는 AGENTS.md 스키마, 본문은 TL;DR → Body(file:line) → 필요시 Options/Acceptance signal/Migration plan.
- 업데이트: 기존 파일의 `status_notes` 최상단에 새 줄 추가(newest first), 닫힌 항목은 증거(`<file>:<line>` 또는 테스트명)와 커밋 SHA를 인용.
- 이번 실행에서 아무것도 발견 못 한 차원이 있으면 문서를 억지로 만들지 않는다.

### 1-5. commit & push

- `docs/findings/` 변경 파일만 명시적으로 stage (`git add .` 금지).
- 커밋 메시지: `docs(findings): <요약 — 신규 N건, 업데이트 M건>` + 본문에 priority별 불릿 + `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.
- 첫 push 전 `gh auth setup-git` (idempotent). push 실패 시 강행(-f) 금지, 보고만.

## 2. 보고 형식

```
🔍 findings-audit 완료 (배치 <UTC>)
신규: N건 — <파일명: 한 줄 요약> (priority)
업데이트: M건 — <파일명: 무엇이 닫혔/추가됐는지>
스킵(중복): K건
commit: <hash> (+push 여부)
```

발견 0건이면 "신규 finding 없음 — 기준선 <마지막 배치> 이후 깨끗" 한 줄로 보고하고 커밋하지 않는다.
