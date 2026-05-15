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

## ADR-023: Dashboard CTE 의 Top-N partition 산출은 window function (`ROW_NUMBER() OVER (PARTITION BY ...)`) 채택

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

## ADR-024: Dashboard 정렬 tiebreaker 표준 = `(metric DESC, name ASC, id ASC)`

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

## ADR-025: 호버 가능한 UI primitive 는 `@base-ui/react/popover` 를 쓰되 기본 트리거는 click/focus, hover 는 보강

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

## ADR-026: Dashboard 셀 텍스트 cut-off 는 CSS truncate, JS substring 으로 자르지 않는다

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

## ADR-027: Dashboard API 응답에 Top-N "잔여 카운트" (`additionalXxxCount`) 를 서버에서 계산해 보낸다

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

## ADR-028: 성능 회귀 검증은 "변경 전/후 동일 호출 10회 median 비교" 로컬 측정 절차로 갈음

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

## ADR-029: SQL Top-N 배열 산출은 `json_agg(... ORDER BY ...) FILTER (WHERE rn <= N)` 표준 PG aggregate 패턴 채택

**상태**: 확정  
**날짜**: 2026-05-14  
**태그**: `language:sql`, `db:postgres`, `area:api`, `pattern:json-agg-filter`, `task:2026-05-14-skills-project-breakdown`

### 컨텍스트
ADR-023 의 `ROW_NUMBER()` window function 으로 Top-N 행을 매긴 뒤, JSON array 형태로 응답에 실으려면 aggregate 안에서 (a) Top-N 만 필터하고 (b) 결정적 순서로 정렬해야 한다. 두 후보: (a) `json_agg(...) FILTER (WHERE rn <= N)` + aggregate 내부 `ORDER BY` (b) subquery LIMIT N → 다시 wrap.

### 결정
PG aggregate 표준 문법 `json_agg(json_build_object(...) ORDER BY <determ_keys>) FILTER (WHERE rn <= N)` 를 채택한다. SQL:2003 표준 + PostgreSQL 9.4+ 안정 문법이며 Argos 의 PG 11+ 환경에서 안전하게 사용 가능.

또한 `timestamptz` 컬럼은 aggregate 안에서 `to_char(<col> AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')` 로 ISO8601 UTC 문자열로 변환해 mapper 가 Date 객체 가정을 갖지 않도록 한다.

### 근거
- aggregate 내부의 ORDER BY + FILTER 조합으로 CTE 한 단계 안에서 Top-N JSON 배열을 만들 수 있어 plan 이 짧다.
- subquery + LIMIT 방식은 array 로 묶기 위해 또 한 번 wrap 이 필요 → CTE 두 개 추가, 가독성/복잡도 증가.
- application 측에서 자르는 방식은 DB→APP 전송량을 증가시킨다 (ADR-027 의 페이로드 축소 원칙 위배).
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
- ADR-023 (window function 으로 Top-N rank)
- ADR-027 (페이로드 Top-N + count 원칙)
