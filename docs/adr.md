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

## ADR-013: Dashboard skill 집계 정의 통일 — Skill tool 호출 ∪ messages slash command UNION

**상태**: 확정  
**날짜**: 2026-05-14  
**태그**: `language:typescript`, `library:prisma`, `area:dashboard-rollup`, `area:api`, `task:2026-05-14-overview-skill-frequency-bug`

### 컨텍스트
대시보드 두 화면 (`/dashboard/<orgSlug>/skills` 와 `/dashboard/<orgSlug>/overview` 의 "Skill별 호출 빈도" 카드) 이 같은 (orgSlug, from, to, projectId) 조합에서 서로 다른 결과를 반환했다. skills route 는 `events.is_skill_call=true` ∪ `messages` 의 `<command-name>/…</command-name>` 정규식 매칭을 UNION 으로 실시간 집계했지만, overview 가 읽는 `daily_rollups.skillCounts` 는 `events.isSkillCall=true` 만 카운트했다. slash command 위주 org 에서는 overview 카드가 "설계대로" 비어 보였다. 사용자 멘탈 모델은 "slash command 도 skill 호출"이므로, skills route 정의가 진실값이고 rollup 쪽이 어긋난 상태였다.

### 결정
대시보드의 모든 skill 호출 **카운트** 집계는 **`events.is_skill_call=true` ∪ messages 의 slash command (events anti-join 으로 중복 제거)** 의 UNION 을 단일 정의로 사용한다. `daily_rollups.skillCounts` 빌더, skills route, overview route, weekly-report 의 `summary.topSkills` 가 모두 이 정의를 공유한다. 정의가 분기되면 안 되는 metric.

### 범위 외 (negative space — 본 task 범위 밖, 별도 follow-up task)
ADR-013 의 UNION 정의는 다음 항목에는 적용되지 않는다. 이들은 여전히 `events.is_skill_call=true` only 정의로 산출된다. 정의 통일은 별도 task 에서 수행한다.
- `daily-rollup.ts` 의 `userStats.skillCalls` (사용자별 카운트 — `e_agg.skill_calls`)
- `weekly-report.ts` 의 `queryTopSkillDiversityByUser` (사용자별 skill diversity 리더보드)
- `weekly-report.ts` 의 `queryForgottenSkills` (past/current skills 비교)

### 근거
- 사용자가 명시한 정합성 기대치: 두 화면 Top N 의 (skillName, callCount, 순서) 완전 일치 (M1).
- skills route 가 이미 UNION 정의를 구현 중이고 사용자가 이 결과를 신뢰. overview 를 맞추는 방향이 자연스럽다 (clarify Q4=a).
- `daily_rollups` 가 weekly-report, dashboard/users 등 다수 호출자에 의해 공유되므로 정의를 한 곳에 두면 자동 회귀 일관성 확보.

### 트레이드오프
- 기존 `daily_rollups.skillCounts` row 가 옛 정의로 캐시돼 있어 invalidation 필요 (ADR-015 의 lazy 가드로 해결).
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

## ADR-014: skill 집계 UNION 정의의 단일 출처 — `skillCallRowsRelation` Prisma.Sql relation helper

**상태**: 확정  
**날짜**: 2026-05-14  
**태그**: `language:typescript`, `library:prisma`, `area:server-helper`, `pattern:single-source-of-truth`, `task:2026-05-14-overview-skill-frequency-bug`

### 컨텍스트
ADR-013 의 UNION 정의를 daily-rollup 빌더와 skills route 가 각각 자기 SQL 로 들고 있으면, 향후 한 쪽 정의가 바뀔 때 (예: messages 정규식 보정, anti-join 컬럼 추가) 다른 쪽이 누락돼 다시 어긋난다. 정의를 텍스트로 복붙하면 동일성 검증이 PR 리뷰 인적 절차에 의존한다. 한편 `{ skillName, callCount }` 만 export 하는 thin helper 로는 skills route 가 필요한 추가 컬럼 (session_count, user_count, last_used_at, skill_durations join) 을 함수가 받쳐주지 못해 SQL 중복이 다시 발생한다.

### 결정
skill 호출의 row-level 정의 자체를 **`Prisma.Sql` relation expression** (`SELECT ... UNION ALL SELECT ...`) 으로 export 하는 helper `skillCallRowsRelation(projectIds, fromInclusive, toExclusive)` 를 도입한다. 호출자는 이 fragment 를 자기 CTE 에 임베드해 (`WITH skill_call_rows AS (${skillCallRowsRelation(...)})`) 그 위에서 자유롭게 GROUP BY / JOIN 한다. 추가로 daily-rollup 등 카운트만 필요한 호출자를 위해 thin wrapper `aggregateSkillCountsForRange(projectIds, fromInclusive, toExclusive)` 를 같은 모듈에 함께 export 한다.

### 근거
- 정의 변경이 helper 한 군데에서만 일어나면 모든 호출자가 자동 일관.
- relation expression 반환은 호출자의 집계 형태 (GROUP BY 키, JOIN 대상, ORDER BY) 를 제약하지 않는다. skills route 의 `skill_durations` 같은 route-특화 컬럼이 helper 책임에서 분리됨.
- `Prisma.sql` 만으로 빌드 (string 연결 금지) 해 SQL injection 방어 + 파라미터 바인딩 안전성 유지.
- 시간 경계를 half-open `[from, to)` 로 helper 계약에 박아 두면 호출자의 inclusive/exclusive 혼선이 사라진다 (ADR-013 의 metric 일관성 강화).

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

## ADR-015: 공유 rollup metric 정의 변경 시 캐시 무효화 패턴 — `INVALIDATION_AT` lazy 가드 + 보조 oneshot sweep

**상태**: 확정  
**날짜**: 2026-05-14  
**태그**: `area:dashboard-rollup`, `area:deployment-runbook`, `pattern:lazy-cache-invalidation`, `task:2026-05-14-overview-skill-frequency-bug`

### 컨텍스트
`daily_project_stats` (a.k.a. `daily_rollups`) 는 lazy compute-on-read 캐시다 (cron 트리거 없음). 어떤 metric 정의 (예: `skillCounts` 의 UNION 정의 적용 — ADR-013) 가 바뀌면 기존 캐시 row 들은 옛 정의로 계산돼 있어 stale 상태가 된다. 다중 인스턴스 (Vercel serverless) 환경에서 새 코드가 굴러가는 중에도 old writer 가 잠시 옛 정의로 upsert 할 수 있어 race condition 위험이 있다. 별도의 schemaVersion 컬럼을 추가하는 방식은 무거우며, 한 metric 만 바뀌어도 전체 row 가 dirty 가 되는 부작용이 있다.

### 결정
`daily_rollups` 가 공유하는 metric 정의를 변경할 때마다 아래 **3단 패턴** 을 표준 절차로 사용한다.

1. **Primary 가드 (correctness)**: 코드 상수 `<METRIC>_INVALIDATION_AT: Date` (예: `SKILL_COUNTS_INVALIDATION_AT`) 를 PR merge 시각 + 24h 등 충분히 여유 있는 timestamp 로 박는다. `getDailyRollups` 의 cache hit 판정에서 `row.computedAt < INVALIDATION_AT` 인 row 는 절대 `cachedResults` 에 넣지 않고 `missingDays` 로 명시 이동시켜 자연 재계산 + upsert 가 일어나게 한다. **이 단일 조건만으로 correctness 보장**.
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
