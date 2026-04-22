---
description: 잠재고객 페르소나 기반으로 현재 서비스/신규 기능의 설득력을 다중 claude headless 세션으로 비판적 시뮬레이팅. 트리거 — "현재 서비스의 설득력을 검토하고싶어", "설득력 검토", "고객 시뮬", "시뮬 돌려줘", "새 고객 프로파일 만들자", "페르소나 만들자", "고객 프로파일 수정하자", "고객 프로파일 보여줘", "페르소나 목록" 및 유사 의도.
---

# persuasion-review

잠재고객 페르소나 기반 설득력 시뮬레이션 skill. 상세 설계는 `SPEC.md` 참조.

## 대원칙

1. **익명성**. 실제 고객명/회사명을 그대로 저장하지 않는다. 익명 `persona_id` + 회사 메타(산업/규모/단계)만.
2. **비판적 태도**. 모든 세션은 외부 SaaS 도입의 시간·인적·가격·신뢰도 비용을 엄격히 따진다. 기대 효과가 명백히 크지 않으면 쉽게 받아들이지 않는다.
3. **비용 고지**. 시뮬은 API 비용을 쓴다. 실행 전 예상 세션 수를 사용자에게 반드시 고지하고 confirm 받는다.
4. **버전 보존**. 페르소나 수정 시 `version`을 +1, `updated_at` 갱신. 과거 run 기록은 절대 건드리지 않는다. 각 run은 `persona_version`을 `run.md`에 기록.
5. **경로**. skill 정의(SKILL.md / SPEC.md / scripts/)는 `.claude/skills/persuasion-review/`에, 데이터(`personas/`, `runs/`, `feature-ideas.md`)는 레포 루트 `persuasion-data/`에 둔다. Claude Code가 `.claude/` 경로를 sensitive로 분류해 headless 세션 Write를 차단하기 때문. 아래 언급되는 `personas/` · `runs/` 경로는 모두 `persuasion-data/` 기준.

## 트리거 → 플로우 매핑

| 트리거 예시                                                         | 플로우          |
| ------------------------------------------------------------------- | --------------- |
| "새 고객 프로파일 만들자", "페르소나 만들자"                        | **Flow A**      |
| "고객 프로파일 수정하자", "페르소나 수정"                           | **Flow B-edit** |
| "고객 프로파일 보여줘", "페르소나 목록"                             | **Flow B-view** |
| "현재 서비스의 설득력을 검토하고싶어", "설득력 검토", "시뮬 돌려줘" | **Flow C**      |

---

## Flow A: 페르소나 생성

1. 사용자에게 "고객 인터뷰 메모나 자유서술을 편하게 써달라"고 요청. 필요 시 주요 필드 목록을 먼저 제시 (keyman의 역할/권한/예산/pain, stakeholder 네트워크, 경쟁솔루션).
2. 사용자 서술을 받아 `profile.md` draft 작성. 채우지 못한 필드는 `unknown`으로 명시.
3. stakeholder 네트워크를 mermaid로 시각화:
   ```mermaid
   graph TD
     KM[keyman: CTO] -- trust:55 --> SALES[Salesman]
     KM -- trust:80 --> SH1[엔지니어링 리더]
     SH1 -- weight:60 --> SH3[시니어 개발자]
   ```
4. 사용자와 티키타카로 보정. 특히 확인할 것:
   - `unknown` 필드 — 정말 모름인지, 채울 수 있는지
   - `trust_with_salesman`, `trust_with_keyman` — 초깃값 직접 지정 요청
   - `decision_authority` — full/partial/none 중 확정
5. 최종 컨펌 후 저장:
   - `personas/<persona_id>/profile.md`
   - `personas/<persona_id>/meta.md` (company_meta, version=1, created_at)
6. `persona_id`는 익명 슬러그 (예: `fintech-startup-cto-01`).

페르소나 스키마 전문은 `SPEC.md §2.1`.

## Flow B-edit: 페르소나 수정

1. 대상 `persona_id` 확인. 없으면 목록 제시.
2. 전체 재인터뷰가 아닌 **특정 필드만 패치**. 어떤 필드를 바꿀지 먼저 질문.
3. 변경 후 `version` +1, `updated_at` 갱신. 과거 run 기록 유지.

## Flow B-view: 페르소나 조회

- 인자 없음 → `personas/` 하위 목록 + 각 요약(keyman role, company_meta) 제시.
- `persona_id` 지정 → `profile.md` 내용 + mermaid 네트워크 다이어그램 렌더링.

---

## Flow C: 설득력 검토 (메인)

### C-1. 대상 페르소나 선택

- `personas/` 목록을 제시하고 복수 선택 허용.
- 페르소나가 없거나 추가 필요 → Flow A로 유도.

### C-2. 전달 모드 선택

사용자에게 물어봄:

- `landing_only` — 랜딩페이지 카피만 전달
- `landing_plus_meeting` — 랜딩페이지 + 세일즈 미팅/미디어 컨텐츠 (랜딩에 없는 구체 기능 설명 포함 가능)

### C-3. 가치제안 문서 작성

- 전달 모드에 맞춰 Claude가 draft 작성. 랜딩 카피, 기능 설명, 가격 플랜 등.
- 사용자와 티키타카로 컨펌.
- 최종 컨펌되면 `runs/<run_id>/value_proposition.md`로 저장 (run_id는 C-5에서 확정되므로 실행 직전 경로 확정).

### C-4. 비용 인지 + 실행 confirm

선택된 **페르소나별로** 예상 세션 수 계산:

```
세션 수 ≈ 1 (keyman initial)
         + N_direct                           # 5b
         + K_drop * N_direct * M              # 5c 재설득 (K_drop≈0.5 추정)
         + N_indirect                         # 5d BFS
         + 1 (report)
```

- `M = clamp(round(trust_with_salesman / 33), 1, 3)`
- `N_direct`: `relation_to_keyman == direct` stakeholder 수
- `N_indirect`: `downstream` stakeholder 수

여러 페르소나 합산 세션 수 + 대략 토큰 비용(세션당 평균 가정치)을 고지 후 최종 confirm.

### C-5. Python script 실행

페르소나별로 **순차** 실행 (페르소나 간 병렬 X, 로그/비용 추적 단순화).

```bash
# repo root에서 실행
uv run --with pyyaml python .claude/skills/persuasion-review/scripts/run_simulation.py \
  --persona-id <persona_id> \
  --value-prop persuasion-data/runs/<run_id>/value_proposition.md \
  --run-id <run_id> \
  --max-parallel 4
```

`run_id` 형식: `<persona_id>_<YYYYMMDD_HHMMSS>`.

스크립트는 `runs/<run_id>/` 하위에 모든 세션 출력 + `report.md`를 생성한다.

### C-6. 결과 브리핑

1. 스크립트 실행 완료 후 `runs/<run_id>/report.md`를 읽는다.
2. 사용자에게 요약 브리핑:
   - 페르소나별 **최종 판정** (성사 / 실패)
   - **실행 리스크** (keyman decision_authority + 실무자 반응 기반)
   - **가치제안 개선 제안** (공통 우려 패턴)
   - **페르소나 보정 힌트** (시뮬 중 프로파일과 어긋나 보인 판단)
3. 복수 페르소나의 경우 표로 정리.

---

## 출력 frontmatter 규약

모든 세션 출력 파일은 아래 frontmatter를 **반드시** 포함 (system prompt로 강제):

```yaml
---
session_type: keyman_initial | stakeholder_review | keyman_response | staff_review
actor_id: <keyman id 또는 stakeholder id>
run_id: <run_id>
round: 1 # 재설득 라운드 번호. 해당 없으면 1.
decision: drop | convince_stakeholders | accept | reject | critical_accept | positive_accept | reconvince
confidence: 0-100
created_at: <ISO8601>
---
```

본문 섹션: **판단 요지**, **구체적 이유**, **걱정/의문점**, (해당 시) **다음 행동**.

## Python 의존성

```bash
pip install pyyaml
```

`claude` CLI는 시스템에 설치되어 있다고 가정.
