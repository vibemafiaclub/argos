
## ASSISTANT · 2026-05-14T21:46:19

모두 추천안으로 확정. finalize 호출.

---
## USER · 2026-05-14T21:46:32

ㄱ

## ASSISTANT · 2026-05-14T21:49:53

## Step 1 (Clarify) 완료

산출: `docs/tasks/2026-05-14-skills-project-breakdown/01-clarify.md`

**요약** (5줄):
- "All skills" 테이블에 **Projects 컬럼 추가** — 셀: invocations Top 5 project 이름 + `(+N more)`, 호버: 풀 분포 팝오버.
- project 클릭 → 같은 페이지 `?projectId=<id>` 필터 교체. URL 에 이미 projectId 가 있으면 단일 project 로 disabled 표시.
- 권한은 기존 `resolveOrgScopedProjectIds` 그대로 — 권한 밖 project 는 API/UI 모두 노출 X.
- API: `SkillStat` 에 `projects: [{projectId, projectName, invocations, lastUsedAt}]` (Top 5) + `additionalProjectCount` 추가.
- UC 초안 1건 (`UC-DRAFT-...skill 별 project 분포 보기`) 포함. minor risk 3건 (팝오버 클릭 통일, 동률 tiebreaker, 페이로드 P95) — 다음 단계에서 해결.

**Step 2 (context gathering) 진행할까요?** (`ㄱ` / `진행` / 수정 의견)

---
## USER · 2026-05-14T21:50:00

ㄱㄱ

## ASSISTANT · 2026-05-14T22:04:43

Plan 확정. ADR background 띄우고 사용자 확인.

---
## USER · 2026-05-14T22:05:17

ㄱㄱ

## ASSISTANT · 2026-05-14T22:19:16

Group C 완료. Group D (WU-6, page.tsx 통합).

---
## USER · 2026-05-14T22:43:42

ㄱㄱ

---
## USER · 2026-05-14T22:43:59

/review. 추가로 docs/adr.md 의 task:2026-05-14-skills-project-breakdown 태그가 붙은 신규 ADR(ADR-023~ADR-029) 들과 일관성도 점검해줘. 결과 텍스트만 출력해줘 (마크다운).

## ASSISTANT · 2026-05-14T22:53:25

## Step 4 (Implement) 완료

**변경 파일 통계** (코드 영역만, docs/adr.md 와 docs/tasks 는 제외):

| 영역 | 파일 | +/- |
|---|---|---|
| shared types | `packages/shared/src/types/dashboard.ts` | +27/-0 |
| route SQL | `packages/web/.../skills/route.ts` | +73/-8 |
| row mapping | `packages/web/.../dashboard-row-mapping.ts` | +43/-1 |
| row mapping test | `packages/web/.../dashboard-row-mapping.test.ts` | +51/-0 |
| Popover primitive | `packages/web/src/components/ui/popover.tsx` (신규) | +52/0 |
| SkillProjectsCell | `packages/web/.../skill-projects-cell.tsx` (신규) | +196/0 |
| page 통합 | `packages/web/.../skills/page.tsx` | +29/-1 |

**합계** (코드): 7 files, +471 / -10. ADR 7건도 추가됨.

**Step 5 (evaluate: code review + QA) 진행할까요?**

---
## USER · 2026-05-15T17:09:50

모두 반영
