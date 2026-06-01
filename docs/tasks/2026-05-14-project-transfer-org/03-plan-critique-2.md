# Plan Critique — Round 2

source: codex exec (sandbox=read-only). 본 작성자가 stdout 을 옮김.

## 결론

**No critical issues.**

## Major

- **M1 (WU-4 — self-heal payload 가 202 응답에만 실림)**: transfer 후 사용자가 출발 org 의 OWNER 자격을 잃거나 stale CLI 가 출발 org 멤버십을 더 이상 갖지 않는 경우, `/api/events` 가 403 (org 비멤버) 으로 응답한다. 이 경로에선 self-heal payload 가 없어 stale `.argos/project.json` 이 영원히 갱신되지 않을 위험. → 성공 기준 6 미달성 시나리오. 권고: (a) 403 응답에도 정답 `orgId/orgSlug` 힌트를 함께 실을지, 또는 (b) 본 task 는 "사용자가 양쪽 org 멤버십을 동시에 가진 채 transfer 실행 → CLI hook 도 동일 user/token 으로 호출" 시나리오로 한정한다고 명시하고 QA 에 사례 분리. 어느 쪽이든 plan 에 명문화 필요.

- **M2 (WU-2 — `db.$transaction` 형태 모호)**: 본문에서 `db.$transaction([...])` 와 callback 형태(`tx.findUnique` 사용) 가 섞여 있어 worker 별 구현이 갈릴 수 있음. 권고: callback form (`db.$transaction(async (tx) => {...})`) 으로 고정. 내부 race 재검증 실패를 sentinel error (`Error('FORBIDDEN_RACE')`) 로 throw → 바깥 catch 가 `kind: 'forbidden'` 으로 매핑하는 패턴을 plan 에 그대로 적시.

- **M3 (WU-5 — 응답 status 계약 모호)**: "202 외 응답 skip" 이라 했지만 조건문은 `if (!res.ok)` 로 적혀 있어 200/204 도 통과한다. worker 가 어느 표현을 채택할지 불명. 권고: `res.status !== 202` 로 명문화(또는 2xx 허용으로 변경) — WU-4/QA 와 정확히 일치.

## Minor

- 없음 (라운드 1 의 minor 들은 모두 반영됨).

---

종합: critical 없음. major 3 개는 implement 단계에서 worker 가 다른 결정으로 흐를 수 있는 ambiguity 들 — plan v3 에서 명문화하여 종결 가능.
