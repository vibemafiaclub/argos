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

## ADR-013: Session transcript 의 skill/subagent 강조색은 `bg-chart-4` 단일 토큰으로 통일

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

## ADR-014: Web 컴포넌트의 순수 시각 helper 는 컴포넌트 인접 `.ts` 파일로 추출해 vitest 단위 테스트한다

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
