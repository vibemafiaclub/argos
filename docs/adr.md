# Architecture Decision Records — Argos

**문서 버전**: 0.1  
**작성일**: 2026-04-14

각 ADR은 "결정 당시의 컨텍스트"를 기록한다. 나중에 상황이 바뀌면 새 ADR을 추가해 이전 결정을 supersede하면 된다. 기존 ADR은 수정하지 않는다.

---

## ADR-001: 모노레포 채택 (pnpm + Turborepo)

**상태**: 확정  
**날짜**: 2026-04-14

### 컨텍스트
CLI, API, Web, Shared 타입 총 4개 패키지가 존재한다. 각각 별도 저장소로 관리하면 타입 변경 시 동기화 비용이 크다.

### 결정
pnpm workspaces + Turborepo로 모노레포를 구성한다.

### 근거
- `@argos/shared`의 Zod 스키마가 API 검증과 CLI 페이로드 빌드에 동시에 쓰인다. 단일 저장소에서 타입 안전성을 컴파일 타임에 보장할 수 있다.
- Turborepo의 빌드 캐시로 CI 시간을 단축할 수 있다.
- pnpm은 npm/yarn 대비 디스크 사용량이 적고 phantom dependency 문제가 없다.

### 트레이드오프
- 모노레포 초기 설정 복잡도가 있다.
- Railway/Vercel 배포 시 각 패키지의 루트 디렉토리 설정이 필요하다.

---

## ADR-002: API 프레임워크로 Hono 선택

**상태**: 확정  
**날짜**: 2026-04-14

### 컨텍스트
Node.js 기반 REST API 서버가 필요하다. Express, Fastify, Hono 중 선택해야 한다.

### 결정
Hono를 사용한다.

### 근거
- TypeScript-first 설계로 Request/Response 타입이 라우트 정의에서 자동 추론된다.
- 미들웨어 체인, 에러 핸들러 구조가 Express와 유사해 러닝커브가 낮다.
- Node.js 외에 Cloudflare Workers, Bun 등 다른 런타임으로도 이식 가능하다 (향후 엣지 배포 옵션 확보).
- `POST /api/events`는 고빈도 엔드포인트인데, Hono는 Fastify 수준의 성능을 제공한다.

### 트레이드오프
- Express 대비 생태계가 작다. 그러나 Argos가 필요한 기능(라우팅, 미들웨어, CORS)은 Hono 코어에 모두 포함된다.

---

## ADR-003: 인증 방식 — Email/Password 자체 인증 (GitHub OAuth 미사용)

**상태**: 확정 (2026-04-14 수정 — 원래 GitHub OAuth polling 방식에서 변경)  
**날짜**: 2026-04-14

### 컨텍스트
CLI와 웹 대시보드 모두 사용자 인증이 필요하다. 초기 설계는 GitHub OAuth + 브라우저 polling 방식이었으나, MVP에서는 GitHub OAuth App 설정 없이 빠르게 구축하기 위해 이메일/비밀번호 방식으로 변경한다.

### 결정
Email/Password 자체 인증 방식을 사용한다:
- `POST /api/auth/register` — 회원가입 (email, password, name)
- `POST /api/auth/login` — 로그인 → 1년 유효 JWT 발급
- `POST /api/auth/logout` — CliToken revoke
- **CLI**: 터미널에서 이메일/비밀번호 직접 입력 → JWT를 `~/.argos/config.json`에 저장
- **Web**: Auth.js v5 Credentials provider → API 로그인 엔드포인트 호출 → JWT를 세션에 저장

### 근거
- GitHub OAuth App 등록 없이 즉시 사용 가능 (셀프호스팅 진입 장벽 최소화).
- CLI polling 방식보다 구현이 단순하고 Web 서버 의존성이 없다.
- bcrypt + JWT + DB revocation으로 충분한 보안 수준 확보.

### 트레이드오프
- GitHub 계정과 통합되지 않아 avatarUrl 등 프로필 정보를 별도 입력해야 한다.
- v2에서 GitHub/Google OAuth를 추가 provider로 붙일 수 있다.

---

## ADR-004: JWT 장기 토큰 + DB revocation

**상태**: 확정  
**날짜**: 2026-04-14

### 컨텍스트
CLI 인증 토큰은 개발자 머신의 `~/.argos/config.json`에 저장된다. 토큰 유효 기간과 무효화 방식을 결정해야 한다.

### 결정
- JWT 유효 기간: 1년 (개발자 편의)
- `CliToken` 테이블에 `tokenHash`(SHA-256)를 저장하고, 모든 API 요청 시 revocation 체크
- `argos logout` 시 `revokedAt` 설정

### 근거
- 짧은 유효 기간 + refresh token 방식은 CLI 사용성을 저하시킨다 (자주 재로그인 필요).
- refresh token 없이 1년 유효 JWT를 쓰되, DB revocation으로 즉각 무효화 가능하게 한다.
- 요청당 DB 조회 1번이 추가되지만 `tokenHash` unique 인덱스로 충분히 빠르다.

### 트레이드오프
- 모든 API 요청마다 DB 조회가 필요하다. 트래픽이 매우 높아지면 revocation 체크를 Redis 캐시로 이전할 수 있다 (현재 불필요).
- `CliAuthSession.token`에 단기간 JWT 평문을 저장한다. 10분 TTL이라 보안 리스크는 낮다.

---

## ADR-005: hook 실행 — argos hook은 항상 exit 0, 즉시 종료

**상태**: 확정 (2026-04-14 수정 — 백그라운드 프로세스 방식으로 강화)  
**날짜**: 2026-04-14

### 컨텍스트
Claude Code의 hook 스크립트가 non-zero exit code를 반환하면 Claude Code가 해당 hook 이벤트 처리를 중단하거나 사용자에게 경고를 표시한다. `argos hook`이 실패하거나 느려지면 개발자의 작업 흐름이 방해받는다. 초기 구현은 `await fetch(..., AbortSignal.timeout(3000))`으로 API 응답을 최대 3초 대기했다.

### 결정
`argos hook`은 API 전송을 **완전 비동기**로 처리한다. 로컬 파일 처리(stdin 파싱, transcript 읽기)가 끝나면 **즉시 `process.exit(0)`**을 호출하고, API 전송은 분리된(detached) 자식 프로세스에서 비동기로 수행한다.

구현:
1. payload를 임시 JSON 파일(`/tmp/argos-*.json`)에 기록
2. `child_process.spawn`으로 detached Node.js 프로세스 생성 → `child.unref()` (부모와 완전 분리)
3. 자식 프로세스가 API에 POST 후 임시 파일 삭제
4. 부모 프로세스는 즉시 `process.exit(0)` 호출

### 근거
- Argos는 **옵저버빌리티 도구**다. 관찰 도구가 관찰 대상(Claude Code 사용)을 방해해서는 안 된다.
- 이전 방식(3초 timeout await)은 API RTT(왕복 지연, 50~150ms)만큼 매 tool 호출마다 Claude Code를 블로킹했다.
- API 서버 다운, 네트워크 장애, 설정 오류 등으로 이벤트 일부가 유실되는 것은 허용 가능하다.
- Claude Code 작업 흐름 지연은 0ms에 가깝게 유지되어야 한다.

### 트레이드오프
- 이벤트 유실 가능성이 있다. 허용되는 트레이드오프로 판단한다.
- 자식 프로세스 spawn overhead(~5ms)가 있지만, API RTT(50~150ms) 대비 무시 가능한 수준이다.
- 임시 파일이 비정상 종료 시 `/tmp`에 잔류할 수 있다. OS가 정기적으로 정리한다.

---

## ADR-006: 이벤트 저장 — fire-and-forget, 재시도 없음

**상태**: 확정  
**날짜**: 2026-04-14

### 컨텍스트
`argos hook`이 이벤트를 API로 전송할 때 실패 시 재시도 전략이 필요하다.

### 결정
재시도 없음. 전송 실패 시 이벤트는 유실된다. API 전송은 detached 자식 프로세스에서 수행되며 10초 timeout이 설정되어 있다 (Claude Code 블로킹 없음 — ADR-005 참조).

### 근거
- `argos hook`은 Claude Code를 블로킹해서는 안 된다. 재시도 로직은 지연을 증가시킨다.
- 로컬 큐(파일/SQLite)에 쌓고 백그라운드로 전송하는 방식은 구현 복잡도를 크게 높인다.
- 통계/트렌드용 데이터에서 소수의 이벤트 유실은 의사결정에 영향을 주지 않는다.
- 인터넷 연결이 없는 환경(비행기, 오프라인 개발)에서도 Claude Code는 정상 동작해야 한다.

### 향후 개선
트래픽이 증가하거나 정확도 요구사항이 높아지면, 로컬 버퍼링 + 백그라운드 플러시 방식으로 전환을 검토한다.

---

## ADR-007: 프로젝트 식별 — `.argos/project.json`을 git으로 관리

**상태**: 확정  
**날짜**: 2026-04-14

### 컨텍스트
팀원 전체가 동일한 프로젝트로 이벤트를 집계하려면 모든 머신에서 동일한 `projectId`를 알아야 한다.

### 결정
`.argos/project.json`을 git 저장소에 커밋한다. 파일에는 `projectId`, `orgId`, `apiUrl`이 포함된다.

### 근거
- git이 이미 팀 공유 메커니즘이다. 별도 초대 시스템이 필요 없다.
- `apiUrl`을 파일에 포함하면 셀프호스팅 팀도 코드 변경 없이 자신의 인스턴스를 가리킬 수 있다.
- `.argos/*.local` 패턴으로 개인 설정(디버그 플래그 등)은 gitignore 처리할 수 있다.

### 트레이드오프
- `projectId`가 공개 저장소에 노출된다. 그러나 `projectId`는 org 멤버십 없이는 API 접근이 불가하므로 보안 리스크가 없다.

---

## ADR-008: 비용 추정 — API 공식 단가 기준, 구독 요금 무시

**상태**: 확정  
**날짜**: 2026-04-14

### 컨텍스트
토큰 사용량을 비용으로 변환해야 한다. 팀은 Claude Max 구독 등 정액 요금제를 사용할 수 있어 실제 지불 금액과 추정치가 다를 수 있다.

### 결정
Claude API 공식 단가(`claude-sonnet-4-6` 기준)를 토큰 수에 곱해 추정 비용을 계산한다. 대시보드에 "이 비용은 API 직접 사용 기준이며, 구독 요금제 사용 시 실제 비용과 다를 수 있습니다"라는 안내를 표시한다.

### 근거
- 구독 요금제의 실제 단가는 외부에서 알 수 없다.
- API 단가 기준 추정치도 팀 간 상대 비교, 트렌드 분석에는 충분히 유용하다.
- 모델 단가는 `@argos/shared/constants/pricing.ts`에 분리되어 있어 업데이트가 쉽다.

### 트레이드오프
- 구독 사용자에게 실제보다 훨씬 큰 "추정 비용"이 표시될 수 있다.
- 이는 UI에서 명확히 안내함으로써 사용자 혼란을 방지한다.

---

## ADR-009: 데이터베이스 — Supabase (PostgreSQL)

**상태**: 확정  
**날짜**: 2026-04-14

### 컨텍스트
관계형 DB가 필요하다. 직접 PostgreSQL을 운영하거나 관리형 서비스를 사용할 수 있다.

### 결정
Supabase의 관리형 PostgreSQL을 사용한다.

### 근거
- 오픈소스라 셀프호스팅도 가능하다 (on-premise 팀이 Supabase OSS를 직접 띄울 수 있다).
- 무료 티어로 시작해 트래픽에 따라 스케일업 가능하다.
- Connection pooling(PgBouncer)이 내장되어 있어 Railway의 서버리스 환경에서 connection 소진 문제가 없다.
- Prisma와 완전히 호환된다.

### 트레이드오프
- Supabase의 `DIRECT_URL`(마이그레이션용)과 `DATABASE_URL`(런타임용) 두 개의 연결 문자열 관리가 필요하다.
- 완전한 오픈소스 셀프호스팅을 원하는 팀은 일반 PostgreSQL + `DATABASE_URL`만 설정하면 된다 (Supabase 불필요).

---

## ADR-010: `argos` 단일 커맨드 — 컨텍스트 감지 방식

**상태**: 확정  
**날짜**: 2026-04-14

### 컨텍스트
초기 설계에서는 `argos login`, `argos init` 두 커맨드를 분리했다. 사용자가 올바른 순서로 실행해야 하는 인지 부하가 있다.

### 결정
`argos`를 단일 진입점으로 만든다. CLI가 현재 상태(`~/.argos/config.json` 존재 여부, `.argos/project.json` 존재 여부)를 감지해 자동으로 필요한 작업을 수행한다.

### 근거
- 사용자가 기억해야 할 커맨드가 하나다.
- 상태에 따른 자동 분기가 Vercel CLI(`vercel`), GitHub CLI(`gh`)의 검증된 UX 패턴이다.
- `argos init`과 `argos login`이 중복되는 작업(인증)을 공유하므로 분리할 이유가 없다.

### 트레이드오프
- 커맨드 동작이 컨텍스트에 따라 달라지므로 예측 가능성이 약간 낮아진다.
- `argos status`로 현재 상태를 확인할 수 있으므로 사용자가 현재 상태를 파악하는 데 문제없다.

---

## ADR-011: Web — Vercel, API — Railway 분리 배포

**상태**: 확정  
**날짜**: 2026-04-14

### 컨텍스트
Next.js Web과 Hono API를 같은 플랫폼에 올릴지, 분리할지 결정해야 한다.

### 결정
Web → Vercel, API → Railway로 분리한다.

### 근거
- Vercel은 Next.js에 최적화되어 있다. App Router, Edge Functions, 자동 preview 배포가 무설정으로 동작한다.
- Railway는 long-running Node.js 서버에 적합하다. `POST /api/events`는 고빈도(hook마다 호출)이므로 cold start가 없는 상시 기동 환경이 필요하다. Vercel Serverless Function의 cold start는 이 패턴에 맞지 않는다.

### 트레이드오프
- 두 플랫폼의 환경 변수를 각각 관리해야 한다.
- CORS 설정이 필요하다 (Web origin → API). `WEB_URL` env var로 관리한다.

---

## ADR-012: 대화 전체 이력 저장 — Message 모델

**상태**: 확정  
**날짜**: 2026-04-14

### 컨텍스트
기존 설계는 hook 이벤트(tool 호출)만 저장하고, 사용자와 Claude의 대화 내용 자체는 기록하지 않았다.
팀 리더가 팀원의 AI 활용 패턴을 개선하고 관리하려면 실제 대화 내역이 필요하다.

### 결정
`Message` 모델을 추가해 세션별 전체 대화 이력을 저장한다.
- Stop/SubagentStop 이벤트 수신 시 `transcript_path`(또는 `agent_transcript_path`)를 파싱
- `type === "human"` → `role: HUMAN`, `type === "assistant"` → `role: ASSISTANT` (text 블록만)
- 세션당 모든 메시지를 `sequence` 순서로 bulk insert

### 근거
- 팀 차원의 프롬프트 패턴 분석 및 AI 활용 코칭에 필요한 원본 데이터.
- transcript JSONL은 이미 Stop 이벤트 시 파싱하므로 추가 I/O 비용이 없음.
- 세션 상세 페이지에서 대화 전체 조회 가능.

### 트레이드오프
- 스토리지 증가 (약 1.8M 행/년 추가, events와 동일 규모).
- Stop 이벤트 시 bulk insert로 인한 지연 가능 → 비동기 처리로 완화.
- 프롬프트에 민감 정보(비밀번호, API 키 등)가 포함될 수 있음 → 접근 권한은 org 멤버로 제한.
- 어시스턴트 메시지는 tool_use 블록을 제외한 text 블록만 저장 (50,000자 truncation).

---

## ADR-013: Project transfer 는 `POST /api/projects/[projectId]/transfer` 신규 라우트로 분리

**상태**: 확정  
**날짜**: 2026-05-14  
**태그**: `language:typescript`, `library:next-app-router`, `area:api`, `domain:project-transfer`, `task:2026-05-14-project-transfer-org`

### 컨텍스트
한 organization 의 Project 를 다른 organization 으로 이동하는 기능을 추가한다. 단순히 `Project.orgId` 한 필드만 갱신하는 작업이 아니라, ProjectMember 전부 삭제 + 양쪽 org OWNER 검증 + `(orgId, slug)` 충돌 검증 + 단일 트랜잭션 보장이 함께 묶이는 도메인 액션이다. 기존 `PATCH /api/projects/[projectId]` 의 필드 확장으로도 기술적으로 가능하다.

### 결정
신규 라우트 `POST /api/projects/[projectId]/transfer` 를 별도로 만든다. 라우트 핸들러는 `requireAuth` + body Zod parse + 결과 → HTTP 매핑만 책임지고, 실제 도메인 로직은 `lib/server/project-actions.ts` 의 `transferProjectForUser` 단일 진입점으로 정리한다.

### 근거
- transfer 는 PATCH 의 "부분 수정" 의미와 어긋난다 (멤버 wipe, 양방향 OWNER 검증 같은 부수효과 동반).
- PATCH 확장 시 클라이언트가 실수로 `orgId` 만 바꾸는 오용 가능성이 있다 — 라우트 분리로 명시적 도메인 액션화.
- UI/CLI/외부 스크립트 모두 의도 명확한 단일 엔드포인트로 호출.

### 트레이드오프
- API 라우트가 1개 추가된다.

### 대안
- **PATCH `/api/projects/[projectId]` 에 `orgId` 필드 확장**: PATCH 의미 위배 + 오용 위험으로 즉시 거절.

### 참고
- docs/tasks/2026-05-14-project-transfer-org/03-plan.md §Decision-1
- packages/web/src/app/api/projects/[projectId]/transfer/route.ts (신규)

---

## ADR-014: CLI self-heal 채널은 `/api/events` 응답 확장으로 구현

**상태**: 확정  
**날짜**: 2026-05-14  
**태그**: `language:typescript`, `library:nextjs`, `area:api`, `area:cli`, `protocol:json`, `task:2026-05-14-project-transfer-org`

### 컨텍스트
Project transfer 후 팀원의 로컬 `.argos/project.json` 은 stale 한 `orgId`/`orgSlug` 를 갖는다. 이 stale config 으로 hook 이 `joinOrg`/`ensureMembership` 을 잘못된 org 로 호출할 수 있어 무해하지 않다. 사용자는 q5 에서 "예전 orgId 가 있어도 작동에 이상없도록 구현 가능할까?" 라며 자동 self-heal 을 원했다. CLI 가 stale config 을 자동 보정해야 하는데, hook 은 매 tool 호출마다 `/api/events` 를 친다 (이미 존재하는 round-trip).

### 결정
`/api/events` 의 success(202) 응답을 superset 으로 확장한다: `{ ok: true }` → `{ ok: true, project: { id, orgId, orgSlug } }`. CLI 는 이 응답을 detached 자식 프로세스에서 읽어 로컬 `.argos/project.json` 을 atomic 하게 self-heal 한다.

### 근거
- 모든 hook 호출이 이미 `/api/events` 를 친다 → 추가 round-trip 0.
- ADR-005/006 (hook 즉시 exit, fire-and-forget) 위배 없이 detached 자식이 응답 받는 구조.
- 응답 superset 이라 구버전 CLI(`{ok:true}` 만 보고 버리는 v0.1.x) 와 후방 호환.
- 별도 lookup endpoint 보다 권한 체크 코드 중복 없음.

### 트레이드오프
- `/api/events` 응답 본문이 약 150 bytes 증가 (무시 가능).
- default 커맨드(Flow 4) self-heal 은 본 task 비범위 — 후속 task 로 연기.

### 대안
- **별도 `GET /api/projects/:id/lookup` 엔드포인트**: hook 마다 fetch 두 번, detached 자식 race 처리 복잡, 권한 체크 코드 중복. 거절.
- **hook 응답 무시 (현 동작 유지)**: 사용자의 "예전 orgId 무해 작동" 요구 미달성. 거절.

### 참고
- docs/tasks/2026-05-14-project-transfer-org/03-plan.md §Decision-2
- ADR-005, ADR-006 (hook detached / fire-and-forget 정신 유지)
- 사용자 발언 인용: "예전 orgId가 있어도 작동에 이상없도록 구현 가능할까?"

---

## ADR-015: Project slug 충돌 시 409 + 안내 메시지, 자동 rename 없음

**상태**: 확정  
**날짜**: 2026-05-14  
**태그**: `language:typescript`, `area:api`, `protocol:http-status`, `task:2026-05-14-project-transfer-org`

### 컨텍스트
`Project.slug` 는 `(orgId, slug)` unique. transfer 시 대상 org 에 같은 slug 의 프로젝트가 이미 있으면 충돌이 발생한다. 자동 rename(suffix), 추가 입력란, 거부 안내 셋 중 하나를 골라야 한다.

### 결정
HTTP 409 + `{ error: { code: 'PROJECT_SLUG_CONFLICT', message: '대상 org 에 같은 이름(slug)의 프로젝트가 이미 있습니다. 한쪽 이름을 먼저 변경한 뒤 다시 시도하세요.' } }` 를 반환한다. 어떤 데이터도 변경되지 않는다.

### 근거
- 자동 rename 은 사용자가 의도하지 않은 식별자 변경을 일으킨다.
- 기존 `PROJECT_NAME_CONFLICT` 가 409 라 일관성을 위해 동일 status 채택.
- 사용자에게 명시적 의사결정(어느 쪽 이름을 바꿀지) 을 위임하는 게 안전.

### 트레이드오프
- 사용자가 한 번 더 액션(이름 변경 후 재시도) 을 해야 한다.

### 대안
- **자동 suffix (`web-app-2`)**: 식별자 silent 변경 → 운영 혼란. 거절.
- **422**: 기존 충돌 응답이 409 라 status 일관성 깨짐. 거절.

### 참고
- docs/tasks/2026-05-14-project-transfer-org/03-plan.md §Decision-3

---

## ADR-016: Transfer 는 단일 `db.$transaction` + 트랜잭션 내 OWNER 권한 재검증

**상태**: 확정  
**날짜**: 2026-05-14  
**태그**: `language:typescript`, `library:prisma`, `area:db`, `pattern:transaction`, `pattern:double-check`, `task:2026-05-14-project-transfer-org`

### 컨텍스트
transfer 는 `Project.orgId` 갱신과 `ProjectMember.deleteMany` 두 개의 write 를 동반한다. 부분 실패 시 권한 누수 위험이 크다(예: orgId 만 바뀌고 ProjectMember 가 남아 신 org 외부인이 접근). 또한 트랜잭션 밖에서 한 권한 검증과 트랜잭션 사이에 사용자가 OWNER 에서 강등되는 race 도 막아야 한다.

### 결정
`db.$transaction` callback form 안에서 (a) OrgMembership 재SELECT 로 출발+대상 OWNER 재검증, (b) `tx.projectMember.deleteMany`, (c) `tx.project.update({ data: { orgId } })` 를 모두 실행한다. callback 이 throw 하면 prisma 가 자동 rollback. P2002 catch 는 callback 바깥에서 처리하며 `err.meta?.target` 이 `(orgId, slug)` 인덱스일 때만 `slug_conflict` 로 매핑하고 그 외 unique 위반은 re-throw.

### 근거
- 부분 실패 시 데이터 불일치 → 권한 누수 사고 방지.
- 트랜잭션 밖 단일 검증은 강등 race 허용 → 트랜잭션 안 재SELECT 로 double-check.
- P2002 무차별 매핑은 다른 unique 제약(미래 추가 가능) 위반을 silent 하게 잘못된 에러로 변환할 위험.

### 트레이드오프
- 트랜잭션 내 OrgMembership 재SELECT 쿼리 2회 추가 (성능 무시 가능).
- race 검증 실패는 sentinel error(`__forbiddenRace = Symbol`) 로 throw → 바깥 catch 가 `kind: 'forbidden'` 매핑. 코드 흐름이 한 단계 우회.

### 대안
- **트랜잭션 없이 별도 호출**: 부분 실패 시 데이터 불일치. 즉시 거절.
- **트랜잭션 밖 단일 권한 검증만**: 강등 race 허용 → 보안 취약. 거절.
- **P2002 무차별 → slug_conflict**: 다른 unique 위반 가려짐. 거절.

### 참고
- docs/tasks/2026-05-14-project-transfer-org/03-plan.md §Decision-4

---

## ADR-017: same_org transfer 호출은 트랜잭션 자체 skip (idempotent no-op)

**상태**: 확정  
**날짜**: 2026-05-14  
**태그**: `language:typescript`, `area:server`, `pattern:idempotent-noop`, `task:2026-05-14-project-transfer-org`

### 컨텍스트
출발 org 와 대상 org 가 동일한 transfer 호출이 들어올 수 있다 (UI 에선 노출 안 되지만 직접 API 호출 가능). 사용자 의도는 "이동 없음" 인데, 정책대로 ProjectMember 전부 삭제를 그대로 적용하면 멤버를 의도치 않게 잃는다.

### 결정
`project.orgId === targetOrg.id` 인 경우 트랜잭션 자체를 skip 하고 현재 project 를 그대로 200 응답한다. ProjectMember 는 보존된다. server action 은 `{ kind: 'same_org', project }` 를 반환하고 라우트는 `kind: 'ok'` 와 동일하게 200 으로 매핑한다.

### 근거
- 사용자 의도와 부수효과를 일치시켜 idempotent no-op 으로 동작.
- "transfer 는 이동" 이라는 단순 멘탈 모델 유지 — 같은 org 이면 아무 일 없음.

### 트레이드오프
- 라우트 응답은 정상 transfer 와 구별 불가 (200 + 같은 응답 shape) — 클라이언트가 "실제로 옮겨졌는지" 알 수 없음. 본 task 에선 의도된 동작.

### 대안
- **같은 org 라도 트랜잭션 진행 + ProjectMember 삭제**: 사용자가 의도치 않게 멤버 잃음. 거절.

### 참고
- docs/tasks/2026-05-14-project-transfer-org/03-plan.md §Decision-4.1

---

## ADR-018: 권한 체크는 server action(`transferProjectForUser`) 내부에서

**상태**: 확정  
**날짜**: 2026-05-14  
**태그**: `language:typescript`, `area:server`, `pattern:result-kind`, `task:2026-05-14-project-transfer-org`

### 컨텍스트
transfer 의 권한 체크(출발+대상 OWNER) 위치를 라우트 핸들러 안에 둘지, server action 내부에 둘지 결정해야 한다. 기존 `getProjectForUser`/`updateProjectForUser` 는 모두 `kind` 결과 패턴(`ok`/`not_found`/`forbidden`/...) 으로 server action 내부에서 권한을 처리한다.

### 결정
`transferProjectForUser` 내부에서 모든 권한/존재/충돌 검증을 수행하고 discriminated union (`ok` / `not_found` / `forbidden` / `slug_conflict` / `same_org`) 을 반환한다. 라우트는 `requireAuth` + body parse + kind→HTTP status 매핑만 한다.

### 근거
- 기존 `*ForUser` server action 패턴과 일관성.
- 라우트 핸들러를 얇게 유지 (Next.js Request/Response 의존성 없는 순수 로직).
- 단위 테스트가 쉽다 (vitest 로 prisma client 만 mock).

### 트레이드오프
- discriminated union kind 종류가 늘어남(5개) — 라우트의 switch/매핑 코드 조금 길어짐.

### 대안
- **라우트 핸들러 안에서 검증**: 라우트가 두꺼워지고 단위 테스트가 어렵다. 거절.

### 참고
- docs/tasks/2026-05-14-project-transfer-org/03-plan.md §Decision-5
- packages/web/src/lib/server/project-actions.ts (기존 패턴)

---

## ADR-019: `/api/events` self-heal payload 는 202 응답에만 포함 (4xx 응답 변경 없음)

**상태**: 확정  
**날짜**: 2026-05-14  
**태그**: `language:typescript`, `area:api`, `security:no-leak`, `pattern:eventual-self-heal`, `task:2026-05-14-project-transfer-org`

### 컨텍스트
ADR-014 로 `/api/events` 응답에 `project.orgSlug` 를 포함시키지만, transfer 후 CLI 호출자가 도착 org 의 비멤버일 수 있다. 이 경우 events 는 403 을 반환한다. 4xx 응답에도 정답 `orgSlug` 를 실으면 비멤버에게 org 식별자가 누설된다.

### 결정
self-heal payload 는 **202 (success)** 응답에만 포함한다. 4xx (특히 403/404) 응답은 변경하지 않는다. CLI 자식 스크립트도 `res.status !== 202` 면 self-heal 을 skip 한다.

### 근거
- 비멤버에게 org 식별자 노출은 privacy/누설 위험.
- 도착 org 비멤버 사용자는 admin 이 멤버 추가해주면 다음 hook 호출에서 자동 self-heal → eventual consistency.
- transfer 를 직접 실행한 OWNER 는 도착 org 의 OrgMembership(OWNER) 을 보유 → 정상 202 + self-heal payload 수신.

### 트레이드오프
- 도착 org 비멤버 사용자(예: 출발 org 의 ProjectMember 였던 일반 팀원) 의 stale config 은 admin 이 멤버 추가해주기 전까지 일시적으로 유지된다. 본 task 정상 동작이며 운영 책임.

### 대안
- **403 응답에도 정답 orgSlug hint 포함**: 비멤버에게 org 식별자 노출 → privacy 위반. 거절.
- **인증 없는 lookup endpoint 로 orgSlug 만 노출**: 동일 privacy 문제. 거절.

### 참고
- docs/tasks/2026-05-14-project-transfer-org/03-plan.md §Decision-8
- ADR-014 (events 응답 확장)

---

## ADR-020: events 응답 확장은 superset (구버전 CLI 후방 호환)

**상태**: 확정  
**날짜**: 2026-05-14  
**태그**: `language:typescript`, `area:api`, `compat:backward`, `task:2026-05-14-project-transfer-org`

### 컨텍스트
`/api/events` 응답 shape 을 self-heal 위해 확장(ADR-014) 한다. 운영 중인 CLI 버전이 다양하다 (v0.1.x 다수 + 신규 self-heal 지원 버전). 구버전 CLI 가 응답을 fetch 후 `.catch(()=>{})` 로 버리는 패턴인 점은 확인됨.

### 결정
응답을 `{ ok: true }` → `{ ok: true, project: {...} }` 로 superset 확장한다. `ok: true` boolean 자체는 그대로 유지. shape 자체 교체(예: `{ status: 'ok' }`) 는 하지 않는다.

### 근거
- 구버전 CLI 는 추가 필드를 무시하고 정상 동작 (응답 본문을 적극 파싱하지 않음).
- self-heal 자체는 신규 CLI 만 동작하지만 구버전 CLI 운영에 사고 없음.

### 트레이드오프
- 응답 본문이 약 150 bytes 증가 (무시 가능).
- 구버전 CLI 사용자는 self-heal 혜택을 받지 못함 → release note 에서 "transfer 시 CLI 업데이트 필수" 명시 필요.

### 대안
- **응답 shape 자체 교체**: 구버전 깨짐. 거절.

### 참고
- docs/tasks/2026-05-14-project-transfer-org/03-plan.md §Decision-6

---

## ADR-021: CLI self-heal 자식 스크립트는 inline 확장 (별도 파일 분리 안 함)

**상태**: 확정  
**날짜**: 2026-05-14  
**태그**: `language:typescript`, `area:cli`, `pattern:detached-child`, `constraint:no-imports`, `task:2026-05-14-project-transfer-org`

### 컨텍스트
ADR-005 의 hook 즉시 exit 정신을 지키기 위해 self-heal 응답 처리도 detached 자식 프로세스(`event-sender`) 안에서 이뤄져야 한다. 자식 프로세스는 `process.execPath -e <inline>` 로 실행되어 외부 모듈 import 불가하다. self-heal 로직(JSON 검증 + 파일 read/write + atomic rename) 을 어디에 둘지 결정해야 한다.

### 결정
self-heal 로직을 자식 inline 스크립트 문자열에 그대로 작성한다. 별도 `.js` 파일 분리는 하지 않는다. 단, 인라인 스크립트 문자열을 생성하는 `buildSelfHealScript({ tmpFile, projectJsonPath })` 헬퍼를 export 해 vitest 로 정적 검증한다.

### 근거
- 별도 자식 파일 분리 시 (a) tsup 번들 산출물 경로(`dist/event-sender-child.js`) 를 npm publish 시 포함하도록 빌드 설정 변경, (b) 글로벌 install / npx 실행 환경에서 자식 파일 위치 안정 resolve(`fileURLToPath(import.meta.url)`) 필요, (c) bundler tree-shaking 으로 자식 파일이 누락될 위험 — 본 task 범위 초과.
- 헬퍼 함수로 분리하면 inline 길이(약 50줄) 의 단위 테스트 가능 (script 문자열에 특정 패턴 포함 여부 단정).

### 트레이드오프
- inline 스크립트가 길어진다 (약 50줄).
- 자식 스크립트 디버깅이 어렵다 (소스맵 없음, console 출력은 `stdio: 'ignore'` 로 사라짐).

### 대안
- **별도 `.js` 파일로 분리 후 `process.execPath child.js` 실행**: 빌드/publish/resolve 인프라 변경 필요. 본 task 범위 초과로 거절.

### 참고
- docs/tasks/2026-05-14-project-transfer-org/03-plan.md §Decision-7
- ADR-005 (hook 즉시 exit, detached 자식 정신)

---

## ADR-022: self-heal 발생 시 사용자 알림은 git diff 만

**상태**: 확정  
**날짜**: 2026-05-14  
**태그**: `language:typescript`, `area:cli`, `ux:diff-only-notify`, `task:2026-05-14-project-transfer-org`

### 컨텍스트
self-heal 이 `.argos/project.json` 을 자동으로 덮어쓰면 사용자가 git diff 에서 변경을 보고 "왜 바뀌었지?" 의문을 가질 수 있다. CLI hook 자식은 `stdio: 'ignore'` 로 detached 실행되어 stderr 출력이 사용자에게 보이지 않는다.

### 결정
self-heal 발생 시 사용자 알림은 별도로 띄우지 않는다. `.argos/project.json` 의 git diff 만이 변경 신호이며, 사용자는 diff 에서 `orgId`/`orgSlug` 갱신을 확인한다. 본 task 에서는 이 결정을 ADR 로 기록만 하고 다음 task 또는 release note 에서 안내 보강한다.

### 근거
- stderr pipe 변경은 hook 의 detached/즉시 exit 정신(ADR-005) 을 흐리고, 부모가 자식 출력을 기다리지 않도록 추가 처리 필요. 본 task 범위 초과.
- 별도 알림 채널(이메일/슬랙/in-app) 은 본 task 명시 비범위.
- git diff 는 이미 팀에 변경을 전파하는 자연 메커니즘 (ADR-007 의 `.argos/project.json` git 관리 정책과 일치).

### 트레이드오프
- 사용자가 변경 사유를 즉시 알 수 없음 → 다음 task 또는 release note 로 안내 필요.
- "조용한 자동 수정" 이 직관에 어긋날 수 있음 — 별도 운영 가이드로 보강.

### 대안
- **stderr pipe 로 알림 메시지 출력**: ADR-005 의 detached 정신을 흐림. 본 task 범위 초과로 거절.
- **별도 in-app 알림 채널 신설**: 본 task 명시 비범위. 거절.

### 참고
- docs/tasks/2026-05-14-project-transfer-org/03-plan.md §Decision-1.1
- ADR-005, ADR-007

---

## ADR-023: Session transcript 의 skill/subagent 강조색은 `bg-chart-4` 단일 토큰으로 통일

**상태**: 확정  
**날짜**: 2026-05-14  
**태그**: `area:web`, `area:design-system`, `library:tailwindcss`, `task:2026-05-14-yellow-skill-bars`

### 컨텍스트
Session transcript 화면은 세 가지 컴포넌트(`session-activity-ribbon`, `event-list`, `event-detail`) 가 동일한 이벤트 데이터를 서로 다른 형태로 시각화한다. `event-list` (line 137-138) 와 `event-detail` (line 83-84) 은 `isSkillCall || isAgentCall` 인 tool 이벤트에 대해 이미 `bg-chart-4` (앰버) 강조를 사용 중이었으나, `ribbon` 의 `segmentVisuals` 만 모든 tool 이벤트를 `bg-muted-foreground` (회색) 로 렌더해 같은 분류가 화면 간 다른 색으로 보이는 비일관성이 있었다. 사용자가 "노란색으로 칠하자" 라고 요청한 시점에 새 디자인 토큰(`bg-warning`, yellow-400 등) 도입 여부가 잠재 분기였다.

### 결정
Skill / subagent 호출 이벤트(`event.kind === 'tool' && (event.isSkillCall || event.isAgentCall)`) 의 강조색은 transcript 의 세 컴포넌트 모두에서 기존 `bg-chart-4` 토큰을 그대로 재사용한다. 신규 토큰을 도입하지 않으며 skill 과 subagent 를 서로 다른 색으로 분리하지 않는다.

### 근거
- 동일 의미(강조되는 도구 호출 분류) 에는 동일 토큰을 쓴다는 디자인 시스템 원칙. event-list/event-detail 이 이미 채택한 규칙을 ribbon 이 따라가는 형태로 일관성 회복.
- `--chart-4` 는 light/dark 양쪽 OKLCH 매핑이 이미 정의되어 있고 (`globals.css` line 46, 104, 156), 두 컴포넌트에서 가독성·다크모드 동작이 사실상 검증된 상태.
- 신규 토큰 도입은 동일 의미에 두 토큰이 공존하는 디자인 시스템 분기를 만들고, 향후 강조 의미 변경 시 갱신 지점이 분산된다.

### 트레이드오프
- Skill 과 subagent 를 시각적으로 분리할 여지를 포기한다 (둘 모두 같은 앰버).
- "전용 강조 토큰" (예: `bg-warning`) 으로 의미를 더 명시적으로 분리해 두지 않아, 향후 다른 강조 분류가 추가되면 `chart-4` 의 의미 과부하 가능성이 있다.

### 대안
- **신규 `bg-warning` / yellow-400 토큰 도입**: 동일 의미에 두 토큰을 가지는 디자인 시스템 분기 발생. clarify 가 비범위로 못박음.
- **Skill 과 subagent 를 서로 다른 색으로 분리**: 사용자가 "둘 다 같은 노랑" 으로 명시. 분리는 신규 디자인 의사결정을 요구.

### 참고
- docs/tasks/2026-05-14-yellow-skill-bars/03-plan.md §Decision-1
- 사용자 발언 인용: "이 task 는 신규 디자인 결정 없음 — event-list/event-detail 이 이미 쓰는 토큰을 ribbon 에도 동일 적용하는 일관성 패치"

---

## ADR-024: Web 컴포넌트의 순수 시각 helper 는 컴포넌트 인접 `.ts` 파일로 추출해 vitest 단위 테스트한다

**상태**: 확정  
**날짜**: 2026-05-14  
**태그**: `area:web`, `language:typescript`, `tooling:vitest`, `task:2026-05-14-yellow-skill-bars`

### 컨텍스트
`packages/web` 의 vitest 설정(`vitest.config.ts`) 은 `defineConfig({ test: { environment: 'node', include: ['src/**/*.test.ts'] } })` 만 가지며, `vite-tsconfig-paths` 등 path alias(`@/*`) 해석 플러그인이 없다. 또한 React 컴포넌트 모듈(`.tsx`) 은 `'use client'` directive 와 top-level `react` 훅 import 를 갖는다. 그 상태에서 컴포넌트 내부의 순수 함수(예: `segmentVisuals` 같은 Tailwind 클래스 결정 helper) 를 단위 테스트하려면 export 만 추가하는 방식은 (1) alias 미해결로 resolve 실패하거나 (2) Node env 에서 컴포넌트 모듈 top-level 의 react 의존 평가를 끌어오는 위험을 만든다.

### 결정
컴포넌트의 시각 표현 결정 helper 는 컴포넌트 `.tsx` 와 같은 폴더에 별도 `.ts` 파일로 추출하고 (예: `session-ribbon-visuals.ts`), 같은 폴더 상대경로 named import 로 소비한다. 테스트는 동일 폴더의 `.test.ts` 로 작성하며, type 외 런타임 import 는 helper 자체 외에는 두지 않는다 (`import type` 만 사용). helper 는 `packages/web/src/lib/` 같은 도메인 lib 폴더에 두지 않는다.

### 근거
- vitest config 변경 0, 신규 의존 0. `src/**/*.test.ts` include 패턴이 `components/<area>/` 하위도 자동 수집한다.
- `import type` 만 사용하면 TypeScript 가 JS emit 단계에서 제거하며, 값으로 오용하면 `isolatedModules: true` 하에서 컴파일 에러로 즉시 드러난다. 결과적으로 vitest 실행이 react 를 끌어오지 않는다.
- helper 파일을 컴포넌트 인접 폴더에 두면 "이 helper 는 이 컴포넌트 전용" 이라는 소유권이 파일 위치로 표현된다. lib/ 로 옮기면 다른 컴포넌트가 재사용하면서 시각 결합도가 lib 전반으로 퍼질 위험이 있다.
- 사용 경계는 `rg "<helper-module-name>" packages/web/src` substring 검색으로 자동 가드 가능.

### 트레이드오프
- 컴포넌트 한 개당 파일 수가 1~2개 증가한다 (helper + test).
- 시각적 응집도(컴포넌트와 helper 가 같은 파일에 있던 상태) 가 약간 분산된다. 동일 폴더 거주로 완화.
- 향후 react-testing-library 기반 DOM 단언 테스트가 필요해지면 별도 vitest config 확장(jsdom, alias 플러그인) 이 필요 — 본 결정은 그 경로를 막지 않으나 별도 의사결정.

### 대안
- **`.tsx` 에서 helper 만 `export` 추가**: alias 미해결 + 컴포넌트 top-level react import 평가 위험. 자연스러운 후속은 `vite-tsconfig-paths` 추가인데 본 task 의 surface 와 위험 외연을 넓힘.
- **`vite-tsconfig-paths` 플러그인 추가**: 신규 dev 의존 + config 변경 + 컴포넌트 모듈 평가 위험 미해결.
- **helper 를 `packages/web/src/lib/` 에 배치**: ribbon 전용 Tailwind/style 결정이 도메인 lib 처럼 보이고, 재사용 과정에서 시각 결합도가 lib 전반으로 퍼질 위험. helper 소유권은 컴포넌트에 머물러야 함.
- **react-testing-library 렌더 후 DOM 단언**: jsdom + @testing-library/react 의존 + vitest config 환경 전환 필요. 본 task 비범위.

### 참고
- docs/tasks/2026-05-14-yellow-skill-bars/03-plan.md §Decision-3, §Decision-4, §Decision-6
- packages/web/src/components/dashboard/session-ribbon-visuals.ts (적용 예)
- packages/web/vitest.config.ts (alias 부재 / `src/**/*.test.ts` include 패턴 단일 원천)
---

## ADR-025: Dashboard CTE 의 Top-N partition 산출은 window function (`ROW_NUMBER() OVER (PARTITION BY ...)`) 채택

**상태**: 확정  
**날짜**: 2026-05-14  
**태그**: `language:sql`, `db:postgres`, `area:api`, `pattern:cte-topn`, `task:2026-05-14-skills-project-breakdown`

### 컨텍스트
Argos 의 dashboard 집계 라우트(`/api/orgs/[orgSlug]/dashboard/skills` 등) 는 union CTE 결과 위에 "그룹별 상위 N" (예: skill 별 invocations 상위 5 project) 을 산출해야 하는 경우가 늘고 있다. 동일 base CTE 를 다시 group by 한 뒤 partition 단위 Top-N 을 잘라야 한다. Postgres 환경(PG14+) 에서 (A) `ROW_NUMBER() OVER (PARTITION BY group_key ORDER BY metric DESC)` window function 으로 자르는 방식과 (B) `LATERAL` join 방식을 비교했다.

### 결정
group-Top-N 산출은 window function `ROW_NUMBER() OVER (PARTITION BY <group_key> ORDER BY <metric DESC, tiebreakers>)` + `WHERE rn <= N` 방식을 표준으로 채택한다. LATERAL join 은 사용하지 않는다.

### 근거
- window function 은 same base CTE 위에 single plan node 만 추가되어 plan complexity 가 낮다.
- LATERAL join 은 그룹 행 (예: skill 50 개) 마다 sub-plan 을 반복 실행한다 — IO/plan 비용 증가.
- 기존 dashboard CTE 들의 단일 union → group by 스타일과 자연스럽게 합쳐진다.
- PG14+ 안정 (이미 Supabase PG 환경 충족).

### 트레이드오프
- 동일 base CTE 가 더 길어진다 (`*_ranked` CTE 한 단계 추가). 가독성 비용은 작다.
- Top-N 의 N 이 매우 크거나 partition 수가 폭증하면 sort 메모리 사용이 LATERAL 보다 클 수 있다 — 현재 규모(50×N) 에서 무시 가능.

### 대안
- **`LATERAL` join 으로 partition 별 sub-query LIMIT N**: skill 50회 sub-plan 반복, plan complexity↑. 거절.
- **application 측에서 자르기 (DB→APP 전 분포 전송)**: 페이로드/전송량 증가. 거절.

### 참고
- docs/tasks/2026-05-14-skills-project-breakdown/03-plan.md §Decision-1
- packages/web/src/app/api/orgs/[orgSlug]/dashboard/skills/route.ts (적용)

---

## ADR-026: Dashboard 정렬 tiebreaker 표준 = `(metric DESC, name ASC, id ASC)`

**상태**: 확정  
**날짜**: 2026-05-14  
**태그**: `language:sql`, `area:api`, `concern:determinism`, `pattern:sort-tiebreaker`, `task:2026-05-14-skills-project-breakdown`

### 컨텍스트
Dashboard 의 Top-N 산출 (project 분포, agent 분포 등) 에서 metric 동률 발생 시 비결정적 정렬은 페이지 새로고침마다 순서가 흔들리는 UX 회귀를 일으킨다. 기존 CTE 들 일부는 단일 키 ORDER BY 만 쓰고 있어 tiebreaker 가 없다 (예: `ORDER BY e.call_count DESC`).

### 결정
Argos dashboard CTE 의 결정적 정렬 규칙: **`ORDER BY <metric> DESC, <human_readable_name> ASC, <id> ASC`** 의 3단 tiebreaker 를 표준으로 채택한다. 예: skill 별 project 분포 — `ORDER BY invocations DESC, project_name ASC, project_id ASC`.

### 근거
- 단일 키 ORDER BY 는 동률에서 PG 가 어떤 순서로든 반환할 수 있어 페이지 reload 마다 순서가 흔들린다 (UX 회귀).
- name ASC 를 두 번째 키로 두면 사람 가독성 있는 순서 (CUID/UUID 보다 안정적).
- id ASC 를 최종 키로 두면 동명이인(같은 name) 도 결정적 — 안정성 보장.

### 트레이드오프
- ORDER BY 키가 늘어 SQL 행이 약간 길어진다.
- name 컬럼 없는 dimension 에는 적용 불가 (그 경우 id ASC 단일 tiebreaker 로 축소).

### 대안
- **`(metric DESC, id ASC)` 만**: id 가 CUID 라 사람 가독성 낮음 — 가까운 동률에서 UX 일관성 떨어짐. 거절.
- **단일 키 ORDER BY (현 상태 유지)**: 비결정적 정렬 → reload 마다 순서 흔들림. 거절.

### 참고
- docs/tasks/2026-05-14-skills-project-breakdown/03-plan.md §Decision-2
- clarify R2 (동률 tiebreaker 미정 위험)

---

## ADR-027: 호버 가능한 UI primitive 는 `@base-ui/react/popover` 를 쓰되 기본 트리거는 click/focus, hover 는 보강

**상태**: 확정  
**날짜**: 2026-05-14  
**태그**: `library:base-ui`, `area:web`, `concern:a11y`, `pattern:popover-trigger`, `task:2026-05-14-skills-project-breakdown`

### 컨텍스트
Dashboard 셀에 "요약 + 상세 풀 분포" UI 패턴이 늘고 있다 (Projects 컬럼 등). 호버 단독 트리거는 모바일/터치/키보드 사용자를 배제한다. Argos 는 이미 `@base-ui/react` 를 채택 중이지만 base-ui 1.4 에는 HoverCard 가 없고 Popover 만 있다 (확인: `node_modules/@base-ui/react/popover/trigger/PopoverTrigger.js` 의 `openOnHover` prop).

### 결정
호버 가능한 상세 표시 컴포넌트는 `@base-ui/react/popover` 를 표준으로 사용한다. 트리거 정책:
- **기본 트리거 = click/focus** (Tab + Enter/Space 키보드 작동).
- **hover 는 보강** (`Popover.Trigger.openOnHover`) — 데스크탑 마우스 사용성.
- Escape / Outside click 은 base-ui 기본 close 동작.
- shadcn 스타일 래퍼는 `packages/web/src/components/ui/popover.tsx` 에 둔다 (info-tooltip 와 동일 톤).

### 근거
- 모바일/터치/키보드 사용자 a11y 확보 — hover-only 는 WCAG 2.1 1.4.13 위반 가능.
- 별도 Radix HoverCard 도입 대비 신규 의존성 없음 (base-ui 재사용).
- base-ui Popover 가 modal 비활성 모드(`modal={false}`) 지원 → 가벼운 inline tooltip-like UX.

### 트레이드오프
- click + hover 두 채널 모두 노출 → trigger 영역 DOM 이 약간 복잡 (nested interactive 회피 위해 sibling 구조 권장).
- hover 만 쓰던 기존 UX 멘탈 모델과 살짝 다름 — info-tooltip 과 일관성을 위해 동일 톤 스타일 적용.

### 대안
- **Radix `HoverCard` 도입**: 신규 deps 증가. 거절.
- **hover-only Tooltip**: 모바일/키보드 사용자 배제. 거절.

### 참고
- docs/tasks/2026-05-14-skills-project-breakdown/03-plan.md §Decision-3
- packages/web/src/components/ui/popover.tsx (신규 primitive)
- packages/web/src/components/ui/info-tooltip.tsx (스타일 톤 참조)

---

## ADR-028: Dashboard 셀 텍스트 cut-off 는 CSS truncate, JS substring 으로 자르지 않는다

**상태**: 확정  
**날짜**: 2026-05-14  
**태그**: `area:web`, `concern:ux`, `pattern:text-truncation`, `task:2026-05-14-skills-project-breakdown`

### 컨텍스트
Dashboard 테이블 셀에 가변 길이 텍스트(project 이름들의 콤마 join 등) 가 들어가면서 좁은 viewport 에서 overflow 처리가 필요하다. 두 가지 접근이 있다: (a) CSS `max-w-* truncate` 로 시각 처리 (b) JS 측에서 substring + `...` 로 데이터 자체를 자른다.

### 결정
셀 텍스트는 **CSS truncate** (`max-w-[20rem] truncate` 등) 로 처리한다. JS 측에서 텍스트 데이터를 자르지 않는다. 전체 텍스트는 셀의 팝오버/상세 뷰에서 노출한다.

### 근거
- JS substring 은 같은 데이터를 두 방식(요약/원본)으로 표현해 일관성 위험 (예: aria-label vs visible text 불일치).
- CSS truncate 는 DOM 에 full text 가 그대로 있어 스크린리더/검색 기능에 친화적.
- 풀 텍스트가 팝오버에 있으면 사용자가 호버/클릭으로 항상 확인 가능 — 정보 손실 없음.

### 트레이드오프
- 좁은 viewport 에서 1~2 글자 잘림 발생 가능 (visible 측면). 팝오버로 보완.
- CSS truncate 는 한 줄 ellipsis 만 지원 — 멀티라인 cut-off 가 필요하면 `line-clamp` 별도 처리.

### 대안
- **JS substring + `...`**: aria-label/검색 등에 full text 와 표시 text 가 갈라져 일관성 위험. 거절.

### 참고
- docs/tasks/2026-05-14-skills-project-breakdown/03-plan.md §Decision-4

---

## ADR-029: Dashboard API 응답에 Top-N "잔여 카운트" (`additionalXxxCount`) 를 서버에서 계산해 보낸다

**상태**: 확정  
**날짜**: 2026-05-14  
**태그**: `area:api`, `concern:payload-size`, `pattern:topn-plus-count`, `task:2026-05-14-skills-project-breakdown`

### 컨텍스트
Dashboard 의 "Top N + (+M more)" UX 패턴은 풀 분포를 보내지 않고 Top N 만 보내면서도 사용자에게 "남은 항목 개수" 를 알려야 한다. 두 선택지: (a) 풀 분포(N+M 전체) 를 응답에 실어 클라이언트가 자른다 (b) 서버에서 Top N + `additionalXxxCount: number` 만 계산해 보낸다.

### 결정
Dashboard API 응답은 **Top N 배열 + `additional<Dimension>Count: number`** 모양으로 서버에서 미리 계산해 보낸다. 클라이언트는 카운트를 단순 표시만 한다. 예: `SkillStat.projects: Top5[]` + `additionalProjectCount: number`.

### 근거
- 풀 분포를 보내면 응답 페이로드가 (rows × dimension 평균 cardinality) 로 폭증 — 예: skill 50 × project 수십 = 수백~수천 entry.
- 카운트는 SQL `count(distinct ...) - N` 한 줄로 산출 가능 — 추가 비용 미미.
- 클라이언트가 분포 산출 로직을 갖지 않게 됨 → 권한 필터(서버) 와 표시 로직(클라이언트) 의 책임 경계 명확.

### 트레이드오프
- 사용자가 "Top N 외 항목들의 명세" 를 보려면 별도 drill-down 페이지가 필요 (본 task 비범위, 후속 task).
- API 가 두 값(Top N 배열 + 잔여 카운트) 을 모두 산출해야 함 — SQL CTE 한 단계 추가.

### 대안
- **풀 분포를 응답에 포함**: 응답 페이로드 폭증 (R3 회귀). 거절.
- **클라이언트가 카운트 계산**: 풀 분포가 클라이언트에 와야 가능 — 동일 페이로드 폭증. 거절.

### 참고
- docs/tasks/2026-05-14-skills-project-breakdown/03-plan.md §Decision-6, §Decision-9
- clarify A1/G2 (응답 스키마 단일 진실)

---

## ADR-030: 성능 회귀 검증은 "변경 전/후 동일 호출 10회 median 비교" 로컬 측정 절차로 갈음

**상태**: 확정  
**날짜**: 2026-05-14  
**태그**: `concern:performance`, `phase:evaluate`, `pattern:perf-regression-check`, `task:2026-05-14-skills-project-breakdown`

### 컨텍스트
Argos repository 에는 부하 테스트 인프라/저장된 P95 baseline 이 없다 (확인됨). API 응답 시간/페이로드 회귀를 막을 객관적 기준이 필요하지만 본격 perf 인프라 도입은 task 범위를 크게 벗어난다.

### 결정
Dashboard API 의 성능 회귀 검증은 다음 로컬 절차로 갈음한다:
1. **변경 직전 커밋** 을 checkout 후 dev 서버 기동.
2. 동일 endpoint 를 동일 쿼리 파라미터로 **연속 10회** 호출 (`curl -w "%{time_total}\n%{size_download}\n"`).
3. 변경 후 커밋에서 같은 호출 10회 반복.
4. **수용 기준**: (a) latency: `변경 후 median <= 변경 전 median * 1.20` (changed/baseline ≤ 1.2). (b) payload: Content-Length 절대 sanity bound (예: < 40KB).
5. 두 지표 모두 evaluate 보고서에 수치 기록.

데이터 부재 환경에서는 절대값 sanity check 만 적용 + "측정 데이터 부족" 명시.

### 근거
- 본격 부하 테스트 인프라 도입은 task 범위 초과.
- 로컬 10회 median 은 단발성 노이즈를 흡수하고 회귀를 충분히 잡는 수준 (정확한 P95 는 아니지만 ±20% 임계 안에서 안전 가드).
- payload 절대값 (Content-Length) 은 latency 보조 지표 — 페이로드 폭증 회귀를 명시 탐지.

### 트레이드오프
- median 은 P95 보다 덜 보수적 — 꼬리 분포 회귀를 못 잡을 수 있음.
- 변경 전 커밋 checkout 이 필요 — 작업 흐름이 약간 끊김.
- 데이터 부재 시 sanity bound 만 — 회귀 탐지력 약함 (한계 명시).

### 대안
- **부하 테스트 인프라 신규 도입**: task 범위 초과. 거절.
- **측정 없이 정성 기준**: 회귀 발견 불가. 거절.

### 참고
- docs/tasks/2026-05-14-skills-project-breakdown/03-plan.md §Decision-8, S13

---

## ADR-031: SQL Top-N 배열 산출은 `json_agg(... ORDER BY ...) FILTER (WHERE rn <= N)` 표준 PG aggregate 패턴 채택

**상태**: 확정  
**날짜**: 2026-05-14  
**태그**: `language:sql`, `db:postgres`, `area:api`, `pattern:json-agg-filter`, `task:2026-05-14-skills-project-breakdown`

### 컨텍스트
ADR-025 의 `ROW_NUMBER()` window function 으로 Top-N 행을 매긴 뒤, JSON array 형태로 응답에 실으려면 aggregate 안에서 (a) Top-N 만 필터하고 (b) 결정적 순서로 정렬해야 한다. 두 후보: (a) `json_agg(...) FILTER (WHERE rn <= N)` + aggregate 내부 `ORDER BY` (b) subquery LIMIT N → 다시 wrap.

### 결정
PG aggregate 표준 문법 `json_agg(json_build_object(...) ORDER BY <determ_keys>) FILTER (WHERE rn <= N)` 를 채택한다. SQL:2003 표준 + PostgreSQL 9.4+ 안정 문법이며 Argos 의 PG 11+ 환경에서 안전하게 사용 가능.

또한 `timestamptz` 컬럼은 aggregate 안에서 `to_char(<col> AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')` 로 ISO8601 UTC 문자열로 변환해 mapper 가 Date 객체 가정을 갖지 않도록 한다.

### 근거
- aggregate 내부의 ORDER BY + FILTER 조합으로 CTE 한 단계 안에서 Top-N JSON 배열을 만들 수 있어 plan 이 짧다.
- subquery + LIMIT 방식은 array 로 묶기 위해 또 한 번 wrap 이 필요 → CTE 두 개 추가, 가독성/복잡도 증가.
- application 측에서 자르는 방식은 DB→APP 전송량을 증가시킨다 (ADR-029 의 페이로드 축소 원칙 위배).
- `to_char(... AT TIME ZONE 'UTC', ...)` 로 timestamp 직렬화를 SQL 측에서 결정적 ISO 문자열로 고정 — mapper 가 row 의 timestamp 형태 추측 안 함.

### 트레이드오프
- aggregate ORDER BY 와 FILTER 가 같이 쓰여 SQL 행이 길어져 가독성 약간 저하.
- timestamp 직렬화 로직이 SQL 에 박힘 — timezone/precision 정책 변경 시 SQL 수정 필요.

### 대안
- **subquery + `LIMIT N` 으로 자른 뒤 다시 `json_agg`**: CTE 한 단계 추가, plan 복잡. 거절.
- **window 결과를 application 에서 자르기**: DB→APP 전송량 증가. 거절.
- **timestamp 를 raw 로 보내고 mapper 에서 Date→ISO 변환**: row mapper 가 PG 의 timestamp 직렬화 형태(Date 객체 vs 문자열) 에 의존 — fragile. 거절.

### 참고
- docs/tasks/2026-05-14-skills-project-breakdown/03-plan.md §Decision-10
- ADR-025 (window function 으로 Top-N rank)
- ADR-029 (페이로드 Top-N + count 원칙)

---

## ADR-032: Dashboard skill 집계 정의 통일 — Skill tool 호출 ∪ messages slash command UNION

**상태**: 확정  
**날짜**: 2026-05-15  
**태그**: `language:typescript`, `library:prisma`, `area:dashboard-rollup`, `area:api`, `task:2026-05-14-overview-skill-frequency-bug`

### 컨텍스트
대시보드 두 화면 (`/dashboard/<orgSlug>/skills` 와 `/dashboard/<orgSlug>/overview` 의 "Skill별 호출 빈도" 카드) 이 같은 (orgSlug, from, to, projectId) 조합에서 서로 다른 결과를 반환했다. skills route 는 `events.is_skill_call=true` ∪ `messages` 의 `<command-name>/…</command-name>` 정규식 매칭을 UNION 으로 실시간 집계했지만, overview 가 읽는 `daily_rollups.skillCounts` 는 `events.isSkillCall=true` 만 카운트했다. slash command 위주 org 에서는 overview 카드가 "설계대로" 비어 보였다. 사용자 멘탈 모델은 "slash command 도 skill 호출"이므로, skills route 정의가 진실값이고 rollup 쪽이 어긋난 상태였다.

### 결정
대시보드의 모든 skill 호출 **카운트** 집계는 **`events.is_skill_call=true` ∪ messages 의 slash command (events anti-join 으로 중복 제거)** 의 UNION 을 단일 정의로 사용한다. `daily_rollups.skillCounts` 빌더, skills route, overview route, weekly-report 의 `summary.topSkills` 가 모두 이 정의를 공유한다. 정의가 분기되면 안 되는 metric.

### 범위 외 (negative space — 본 task 범위 밖, 별도 follow-up task)
ADR-032 의 UNION 정의는 다음 항목에는 적용되지 않는다. 이들은 여전히 `events.is_skill_call=true` only 정의로 산출된다. 정의 통일은 별도 task 에서 수행한다.
- `daily-rollup.ts` 의 `userStats.skillCalls` (사용자별 카운트 — `e_agg.skill_calls`)
- `weekly-report.ts` 의 `queryTopSkillDiversityByUser` (사용자별 skill diversity 리더보드)
- `weekly-report.ts` 의 `queryForgottenSkills` (past/current skills 비교)

### 근거
- 사용자가 명시한 정합성 기대치: 두 화면 Top N 의 (skillName, callCount, 순서) 완전 일치 (M1).
- skills route 가 이미 UNION 정의를 구현 중이고 사용자가 이 결과를 신뢰. overview 를 맞추는 방향이 자연스럽다 (clarify Q4=a).
- `daily_rollups` 가 weekly-report, dashboard/users 등 다수 호출자에 의해 공유되므로 정의를 한 곳에 두면 자동 회귀 일관성 확보.

### 트레이드오프
- 기존 `daily_rollups.skillCounts` row 가 옛 정의로 캐시돼 있어 invalidation 필요 (ADR-034 의 lazy 가드로 해결).
- weekly-report 의 `summary.topSkills` 도 의도적으로 동시 변동. 비-skill KPI 는 회귀 테스트로 불변 보장.
- 옛 정의의 (Skill tool only) 카운트는 새 정의 카운트의 부분집합이므로 회귀 위험 없음.

### 대안
- **V1b — rollup 은 그대로 두고 overview API 가 messages-slash 를 실시간 합성**: 백필 불필요로 단순하나, 매 overview 요청마다 정규식 평가 + 정의가 라우트별 분산. weekly-report 와도 어긋남.
- **skills 페이지를 좁히는 방향 (Q4=b)**: 사용자가 명시적으로 폐기. slash command 도 skill 사용으로 보는 멘탈 모델이 정답.
- **두 정의를 별도 카드로 표시 (Q4=c)**: 사용자 멘탈 모델 분할 부담 + 카피 변경 부담, 폐기.

### 참고
- docs/tasks/2026-05-14-overview-skill-frequency-bug/03-plan.md §Decision-1
- 사용자 발언 인용: "skills 페이지 정의가 정답, overview 를 UNION 으로 통일" (clarify Q4=a)

---

## ADR-033: skill 집계 UNION 정의의 단일 출처 — `skillCallRowsRelation` Prisma.Sql relation helper

**상태**: 확정  
**날짜**: 2026-05-15  
**태그**: `language:typescript`, `library:prisma`, `area:server-helper`, `pattern:single-source-of-truth`, `task:2026-05-14-overview-skill-frequency-bug`

### 컨텍스트
ADR-032 의 UNION 정의를 daily-rollup 빌더와 skills route 가 각각 자기 SQL 로 들고 있으면, 향후 한 쪽 정의가 바뀔 때 (예: messages 정규식 보정, anti-join 컬럼 추가) 다른 쪽이 누락돼 다시 어긋난다. 정의를 텍스트로 복붙하면 동일성 검증이 PR 리뷰 인적 절차에 의존한다. 한편 `{ skillName, callCount }` 만 export 하는 thin helper 로는 skills route 가 필요한 추가 컬럼 (session_count, user_count, last_used_at, skill_durations join) 을 함수가 받쳐주지 못해 SQL 중복이 다시 발생한다.

### 결정
skill 호출의 row-level 정의 자체를 **`Prisma.Sql` relation expression** (`SELECT ... UNION ALL SELECT ...`) 으로 export 하는 helper `skillCallRowsRelation(projectIds, fromInclusive, toExclusive)` 를 도입한다. 호출자는 이 fragment 를 자기 CTE 에 임베드해 (`WITH skill_call_rows AS (${skillCallRowsRelation(...)})`) 그 위에서 자유롭게 GROUP BY / JOIN 한다. 추가로 daily-rollup 등 카운트만 필요한 호출자를 위해 thin wrapper `aggregateSkillCountsForRange(projectIds, fromInclusive, toExclusive)` 를 같은 모듈에 함께 export 한다.

### 근거
- 정의 변경이 helper 한 군데에서만 일어나면 모든 호출자가 자동 일관.
- relation expression 반환은 호출자의 집계 형태 (GROUP BY 키, JOIN 대상, ORDER BY) 를 제약하지 않는다. skills route 의 `skill_durations` / `skill_project_breakdown` (ADR-025/031) 같은 route-특화 컬럼이 helper 책임에서 분리됨.
- `Prisma.sql` 만으로 빌드 (string 연결 금지) 해 SQL injection 방어 + 파라미터 바인딩 안전성 유지.
- 시간 경계를 half-open `[from, to)` 로 helper 계약에 박아 두면 호출자의 inclusive/exclusive 혼선이 사라진다 (ADR-032 의 metric 일관성 강화).

### 트레이드오프
- row-level helper 라 호출자가 자기 GROUP BY 책임. 그러나 skills route 의 기존 `skill_events` / `skill_durations` 패턴이 이미 그 구조라 자연스러움.
- 두 layer (relation expression + count wrapper) export 로 API 표면이 1 → 2 로 늘어남. 그러나 wrapper 가 90% 호출자를 흡수하므로 정신적 부담 작음.
- `parseDateRange` 의 inclusive `to` (`23:59:59.999`) 와 helper 의 half-open 계약 사이 변환 책임은 호출자 (route) 가 진다 (`toExclusive = new Date(to.getTime() + 1)`).

### 대안
- **카운트 함수만 export (`aggregateSkillCountsForRange` 단일)**: skills route 의 다른 컬럼 (session_count 등) 을 위해 자체 CTE 를 다시 유지 → 정의가 두 곳으로 분산.
- **raw SQL string export**: Prisma 파라미터 바인딩 무력화, injection 위험.
- **`dashboard-row-mapping.ts` 같은 기존 모듈에 합치기**: 매핑/집계 책임이 한 파일에 혼재.
- **CTE definition 통째로 export (`WITH skill_call_rows AS (...)`)**: 호출자가 추가 CTE 를 chain 할 때 SQL 충돌. relation expression 만 export 가 가장 유연.

### 참고
- docs/tasks/2026-05-14-overview-skill-frequency-bug/03-plan.md §Decision-2, §WU-1

---

## ADR-034: 공유 rollup metric 정의 변경 시 캐시 무효화 패턴 — `INVALIDATION_AT` lazy 가드 + 보조 oneshot sweep

**상태**: 확정  
**날짜**: 2026-05-15  
**태그**: `area:dashboard-rollup`, `area:deployment-runbook`, `pattern:lazy-cache-invalidation`, `task:2026-05-14-overview-skill-frequency-bug`

### 컨텍스트
`daily_project_stats` (a.k.a. `daily_rollups`) 는 lazy compute-on-read 캐시다 (cron 트리거 없음). 어떤 metric 정의 (예: `skillCounts` 의 UNION 정의 적용 — ADR-032) 가 바뀌면 기존 캐시 row 들은 옛 정의로 계산돼 있어 stale 상태가 된다. 다중 인스턴스 (Vercel serverless) 환경에서 새 코드가 굴러가는 중에도 old writer 가 잠시 옛 정의로 upsert 할 수 있어 race condition 위험이 있다. 별도의 schemaVersion 컬럼을 추가하는 방식은 무거우며, 한 metric 만 바뀌어도 전체 row 가 dirty 가 되는 부작용이 있다.

### 결정
`daily_rollups` 가 공유하는 metric 정의를 변경할 때마다 아래 **3단 패턴** 을 표준 절차로 사용한다.

1. **Primary 가드 (correctness)**: 코드 상수 `<METRIC>_INVALIDATION_AT: Date` (예: `SKILL_COUNTS_INVALIDATION_AT`) 를 PR merge 시각 + 24~48h 등 충분히 여유 있는 timestamp 로 박는다. `getDailyRollups` 의 cache hit 판정에서 `row.computedAt < INVALIDATION_AT` 인 row 는 절대 `cachedResults` 에 넣지 않고 `missingDays` 로 명시 이동시켜 자연 재계산 + upsert 가 일어나게 한다. **이 단일 조건만으로 correctness 보장**.
2. **보조 oneshot sweep (speed-up)**: `scripts/invalidate-<metric>.ts` 가 `WHERE computed_at < INVALIDATION_AT` 인 row 를 한 번에 `computed_at='1970-01-01'` 으로 강제하고 metric 컬럼을 비운다. 미실행 시에도 (1) 이 정확성을 보장 — 첫 요청 latency 만 spread 가 안 됨. 멱등 기준은 "두 번째 실행 = 0 rows".
3. **배포 runbook (race 해소)**: ① 새 코드 (가드 포함) 모든 인스턴스 배포 → ② 안정화 30 분 후 1차 sweep → ③ 10 분 후 2차 sweep (0 rows = race 없음 확정). 1, 2차 도중에 누가 옛 정의로 upsert 해도 그 row 의 computedAt 은 INVALIDATION_AT 보다 미래라 가드에서 자동 stale.

### 근거
- 가드는 정의 변경 1 회당 상수 1 개만 추가하면 돼서 누적 부담이 작다 (schemaVersion 컬럼 vs).
- lazy 가드가 correctness 의 1차 원천이므로 oneshot 스크립트 미실행 / runbook 실수 시에도 사용자 화면은 항상 새 정의를 본다. 운영 안전 마진 큼.
- vercel serverless single-region 가정 하에서 old writer 윈도우는 초 단위. 그 안에 발생한 upsert 도 다음 요청 / 2차 sweep 에서 무효화.
- 가드 조건이 `computedAt` 단일 비교라 판정 비용 무시 가능.

### 트레이드오프
- 한 번 박힌 `INVALIDATION_AT` 상수는 immutable. 같은 metric 의 다음 정의 변경 시 새 상수를 또 박아야 한다 (template).
- 배포 직후 첫 요청들의 latency 가 (lazy 재계산 비용 만큼) 평소보다 길어질 수 있음. 보조 sweep 으로 spread 가능.
- 가드 조건을 `computedAt < THRESHOLD` 단일로 통일했기 때문에 `skillCounts === '{}'` 같은 합성 가드는 명시적으로 거절. 합성 가드는 스크립트 미실행 row 를 못 잡는 hole 이 있었다.

### 대안
- **DB schemaVersion 컬럼 추가**: 마이그레이션 + 모든 호출자 코드 변경, 무겁다.
- **row 전량 delete**: 다른 metric (`sessionCount`, `userStats` 등) 도 같이 재계산돼 비용 폭증.
- **`computedAt + skillCounts==='{}'` 합성 가드**: 스크립트가 metric 만 비우고 computedAt 은 그대로 두는 경우만 잡힘. 스크립트 미실행 시 hole.
- **DB advisory lock / maintenance flag**: race 차단은 되지만 다운타임/구현 부담, 본 task 범위 초과.

### 참고
- docs/tasks/2026-05-14-overview-skill-frequency-bug/03-plan.md §Decision-3, §Decision-9, §WU-3, §WU-10
- 사용자 발언 인용: "가장 가벼운 전략" (clarify 의 백필 비용 가이드라인)
