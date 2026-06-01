---
id: UC-CLI-001
name: stale `.argos/project.json` 을 hook 응답으로 자동 보정한다
level: user-goal
scope: CLI hook (argos-ai) + 백엔드 events API
primary_actor: CLI hook (Claude Code 가 발화)
status: active
includes: []
related: [UC-PROJ-001]
e2e: []
coverage_status: pending
sources:
  - docs/tasks/2026-05-14-project-transfer-org/01-clarify.md
  - docs/tasks/2026-05-14-project-transfer-org/03-plan.md
last_reviewed: 2026-05-14
---

## 이해관계자와 관심사

- **리포지토리에서 작업 중인 사용자**: transfer 후에도 별도 명령 없이 다음 Claude Code prompt 한 번이면 `.argos/project.json` 이 정답 org 로 동기화되기를 원한다.
- **CLI hook (자기 자신)**: 부모 프로세스가 ADR-005 의 "즉시 exit" 약속을 어기지 않으면서도 응답을 받아 파일을 갱신할 수 있어야 한다.
- **백엔드 events API**: 응답 shape 가 superset 형태로 확장되어 구버전 CLI 가 깨지지 않는다.
- **플랫폼 운영자**: self-heal 이 어떤 이유로 실패해도 부모 hook 의 exit code 는 0 이어야 하며 사용자 워크플로우를 막지 않는다.

## 사전조건

- P1. 로컬 리포지토리에 `.argos/project.json` 이 존재한다 (Flow 1 의 결과).
- P2. CLI 의 `argos hook` 명령이 Claude Code 의 hook 으로 등록되어 있다.

## 트리거

- T1. Claude Code 가 사용자 prompt 처리 완료 후 등록된 hook (Stop/PostToolUse 등) 을 발화하여 `argos hook` 을 detached 자식으로 spawn 한다.

## 성공 보장 (Postconditions)

- G1. 응답의 `project.orgId` / `project.orgSlug` 와 로컬 `.argos/project.json` 이 다르면, 로컬 파일이 새 값으로 덮어써져 있다.
- G2. 덮어쓴 파일의 키 순서는 `writeProjectConfig` 의 출력과 동일하다 (`projectId, orgId, orgSlug, orgName, projectName, apiUrl?`).
- G3. 다음 `git diff .argos/project.json` 에서 변경이 보인다.

## 최소 보장

- M1. 부모 `argos hook` 프로세스는 자식의 fetch/비교/write 결과와 무관하게 즉시 exit 한다 (ADR-005 보호).
- M2. 자식의 fetch / 비교 / write 단계 어디서 실패해도 try/catch 로 무음 처리되며, 다음 hook 발화에서 다시 시도된다 (ADR-006 보호).
- M3. 응답에 `project` 필드가 없는 경우 (구버전 서버 또는 비정형 응답) 비교/write 단계를 스킵하고 종료한다. 기존 파일은 보존된다.

## 주 성공 시나리오

1. (External · Hook) Claude Code 가 `argos hook` 을 detached 자식 프로세스로 spawn 한다.
2. (System · CLI) 부모 프로세스가 `.argos/project.json` 을 읽어 currentConfig 를 확보하고 절대경로 projectJsonPath 를 계산한다.
3. (System · CLI) 부모가 자식 inline 스크립트(`process.execPath -e <inline>`) 를 spawn 하며 tmp file 의 payload `{ url, token, payload, projectJsonPath, currentConfig }` 를 넘긴 뒤 즉시 exit 한다 (M1).
4. (System · CLI · API) 자식이 `POST /api/events` 로 이벤트를 전송한다.
5. (System · API) 백엔드가 202 + `{ ok: true, project: { id, orgId, orgSlug } }` 를 반환한다.
6. (System · CLI) 자식이 응답의 `project.orgId` / `project.orgSlug` 를 currentConfig 의 값과 비교한다.
7. (System · CLI · Filesystem) 값이 다르면 `fs.writeFileSync(projectJsonPath, JSON.stringify(newConfig, null, 2))` 로 파일을 덮어쓴다.
8. (System · CLI) 자식이 종료한다.

## 확장 (Extensions)

- 5a. 응답에 `project` 필드가 없음 (구버전 서버 또는 네트워크 실패) →
  - 5a.1. (System · CLI) 자식이 6~7 단계를 스킵한다. M3.
  - 5a.2. 자식 종료.
- 6a. 응답의 `project.orgId` / `project.orgSlug` 가 currentConfig 와 같음 (noop) →
  - 6a.1. (System · CLI) 7 단계를 스킵한다.
  - 6a.2. 자식 종료.
- 7a. 파일 쓰기 실패 (권한 부족, 디스크 풀 등) →
  - 7a.1. (System · CLI) try/catch 로 무음 처리한다. M2.
  - 7a.2. 다음 hook 발화 시 동일 흐름으로 재시도된다.
- 4a. fetch 실패 (네트워크 오류 등) →
  - 4a.1. (System · CLI) try/catch 로 무음 처리한다. M2.
  - 4a.2. 다음 hook 발화 시 동일 흐름으로 재시도된다.

## 기술/데이터 변형

- V1. hook 가 `stdio: 'ignore'` 로 detached 되어 있으므로 self-heal 로그(`[argos] project.json updated: ...`) 는 stderr 에 출력되더라도 사용자에게 직접 보이지 않는다. 사용자 인지는 다음 `git diff` 에서 자연 발생한다.
- V2. 자식 inline 스크립트는 외부 모듈 import 가 불가하므로 비교/write 코드는 `buildSelfHealScript(opts)` 헬퍼가 생성한 문자열에 모두 포함된다 (Decision-7).

## 참고

- `docs/flow.md` Flow 1 — `.argos/project.json` 생성/사용/git 커밋 흐름. self-heal 이 이 흐름에 자연스럽게 끼어든다.
- `docs/adr.md` ADR-005 — hook 즉시 exit 보호.
- `docs/adr.md` ADR-006 — fire-and-forget 무음 실패 정책.
- `packages/cli/src/lib/event-sender.ts` — 자식 스크립트 generation 및 `buildSelfHealScript`.
- `packages/cli/src/commands/hook.ts` — `deps.events.sendBackground` 호출부.
- `packages/web/src/app/api/events/route.ts` — 응답 `{ ok: true, project: {...} }` superset 확장.
