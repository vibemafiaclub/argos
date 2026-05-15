# Plan Critique — Round 1

source: codex exec (sandbox=read-only). 비평 본문은 codex 가 stdout 으로만 반환했고 read-only 제약으로 직접 파일 작성에 실패했기에 본 작성자가 그대로 옮겼다.

## 결론

**No critical issues.**

## Major

- **M1 (Work Units / 병렬 그룹)**: Group A 에 WU-1 과 WU-4 가 같이 묶여 있지만, WU-4 의 "타입을 import" 노트가 사실상 WU-1 결과를 전제로 한다 → 병렬 자기완결성이 깨짐. 권고: WU-4 의 의존을 명시적으로 "WU-1" 로 옮기고 Group B 로 이동하거나, WU-4 의 self-heal 응답 필드를 타입 import 없이 inline 으로 정의해 진짜 독립.
- **M2 (CLI self-heal — 파일 경로)**: WU-5/6 가 `cwd` 기준으로 `.argos/project.json` 절대 경로를 계산. 그러나 실제 `findProjectConfig` 는 상위 디렉토리를 traverse → cwd 가 monorepo subdir 일 때 cwd/.argos 가 존재하지 않아 새로운 파일을 잘못된 위치에 생성할 수 있음. 권고: 부모 프로세스가 `findProjectConfig` 가 발견한 정확한 절대 경로를 자식에 넘기게 한다.
- **M3 (CLI self-heal — race / atomicity)**: detached child 가 spawn 시점의 config snapshot 만 보고 비교/덮어쓰기. 동시 hook 두 개가 거의 동시에 transfer 후 다른 hook 응답을 받으면 stale write 위험. 권고: 자식이 직접 (a) 파일 재읽기, (b) `projectId` 일치 확인, (c) tmp file rename(atomic) 으로 작성, (d) 응답 status === 202 + JSON shape 검증 후에만 write.
- **M4 (권한 트랜잭션 경계)**: 권한 검증이 트랜잭션 밖에서 일어남 → 검증 후 트랜잭션 시작 사이에 OWNER 가 강등되어도 transfer 가 진행될 수 있음. 권고: 트랜잭션 안에서 OrgMembership 을 다시 SELECT 해 OWNER 인지 재확인하거나(낙관적), Decision-5 에 race 수용 사유를 명시.
- **M5 (P2002 over-mapping)**: P2002 를 전부 `slug_conflict` 로 매핑. 향후 ProjectMember 등 다른 unique 제약 위반을 오분류할 수 있음. 권고: `err.meta?.target` 가 `(orgId, slug)` 인덱스인지 확인 후 매핑하고, 그 외엔 throw.
- **M6 (same_org 계약 모호)**: `same_org` 가 200 + 현재 상태 반환만 명시. ProjectMember 를 삭제하지 않는다는 보장이 plan 에 없고 테스트도 없음. 권고: server action 단계에서 트랜잭션 자체를 skip 하고 ProjectMember.count === 변경 전과 동일을 단위 테스트로 검증.
- **M7 (자동 검증 약함 — events 응답 / self-heal happy path)**: `/api/events` 응답 shape (project 필드 존재) 를 검증하는 자동 테스트가 없음. WU-4 도 "테스트 없음" 으로 표기. 권고: `events` route 에 응답 shape 단정 1줄짜리 단위 테스트 추가, 또는 CLI 측 `event-sender` 자식 스크립트의 fetch 응답 처리 함수를 export 하여 단위 테스트.
- **M8 (Decision Log 근거 부족)**: Decision-2 (events 응답 확장) 에서 lookup endpoint 거절 근거가 "round-trip 1회 추가 + ADR-005 충돌 가능" 정도. lookup 도 `after()`/detached child 로 가능한데 왜 못 쓰는지 보강 필요. Decision-7 (inline child) 도 "빌드/배포 변경" 만 적혔는데 npm pack/bundler 에 무엇이 막히는지 한 줄 더.

## Minor

- **m1**: `TransferProjectSchema.targetOrgSlug` 는 `.trim().min(1).regex(/^[a-z0-9-]+$/)` 가 일관성 (UpdateOrgSchema 의 slug 와 동일 형식).
- **m2**: `TransferProjectResponse.project.createdAt` 은 API 응답 타입(string) vs server 내부(Date) 가 다름. shared 타입은 string 으로 통일.
- **m3**: WU-5 의 stderr 로그는 `stdio: 'ignore'` 자식에서 안 보임. 사용자 인지는 git diff 에 의존. 로그 제거하거나 `stdio: ['ignore','ignore','pipe']` 로 변경.
- **m4**: Negative Space 의 "prisma schema 변경 금지" → "prisma schema (DB 모델) 변경 금지" 로 좁혀 문서 명세서 같은 다른 schema 와 혼동 방지.
- **m5**: 위험요소 R3 의 "다음 hook 호출에서 자연 self-heal" 은 v0.1.x 에 적용 안 됨 (응답 무시). 정확히는 "사용자가 CLI 업데이트 후 self-heal" 이라고 표기.

---

종합: critical 없음. major 8개는 "implement worker 가 코드 작성 시 막히는" 수준은 아니지만 데이터 손상/race/오분류 위험을 만든다 → plan v2 에서 반영 권장.
