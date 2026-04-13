# Phase 3: API Auth + Org + Project Routes

## 사전 준비

아래 문서들을 반드시 읽어라:

- `docs/code-architecture.md` — 인증 흐름, API 라우트 목록, 환경변수
- `docs/adr.md` — ADR-003 (이메일/비밀번호), ADR-004 (JWT + DB revocation)
- `docs/flow.md` — Flow 1~5 (CLI 인증, 팀원 합류)

이전 phase 산출물을 반드시 확인하라:

- `packages/api/src/app.ts`
- `packages/api/src/env.ts`
- `packages/api/src/db.ts`
- `packages/api/src/middleware/auth.ts` (skeleton)
- `packages/shared/src/schemas/auth.ts`
- `packages/shared/src/schemas/project.ts`

## 작업 내용

인증, 조직, 프로젝트 라우트를 구현한다.

### 1. `src/lib/jwt.ts`

```typescript
// jose 라이브러리 사용
// JWT payload: { sub: userId, iat, exp }
// 만료: 1년 (365 * 24 * 60 * 60 초)

export async function signJwt(userId: string): Promise<string>
export async function verifyJwt(token: string): Promise<{ sub: string } | null>
// 검증 실패 시 null 반환 (throw 금지)
```

### 2. `src/middleware/auth.ts` — 완전 구현

```typescript
// 1. Authorization 헤더에서 Bearer 토큰 추출
// 2. verifyJwt()로 토큰 검증
// 3. DB에서 CliToken 조회 (tokenHash = SHA-256(token))
//    revokedAt이 null이 아니면 401
// 4. db.cliToken.update({ lastUsedAt: new Date() }) — fire-and-forget (await 없이)
// 5. c.set('userId', payload.sub)
// 6. 실패 시 401 { error: 'Unauthorized' }

// SHA-256 계산: Node.js crypto 내장 모듈 사용
// import { createHash } from 'crypto'
// const tokenHash = createHash('sha256').update(token).digest('hex')
```

### 3. `src/routes/auth.ts`

**`POST /api/auth/register`**:
- body: `{ email, password, name }` (RegisterRequestSchema 검증)
- bcrypt hash (saltRounds: 10)
- User 생성
- CliToken 생성 (tokenHash = SHA-256(jwt))
- 응답: `201 { token, user: { id, email, name, createdAt } }`
- 이미 존재하는 이메일: `409 { error: 'Email already in use' }`

**`POST /api/auth/login`**:
- body: `{ email, password }` (LoginRequestSchema 검증)
- bcrypt.compare()로 비밀번호 검증
- CliToken 생성
- 응답: `200 { token, user: { id, email, name, createdAt } }`
- 실패 시: `401 { error: 'Invalid credentials' }` (이메일 존재 여부 노출 금지)

**`POST /api/auth/logout`**:
- auth 미들웨어 필요
- CliToken.revokedAt = new Date() 업데이트
- 응답: `200 { ok: true }`

**`GET /api/auth/me`**:
- auth 미들웨어 필요
- 응답: `200 { user: { id, email, name, createdAt } }`

### 4. `src/routes/orgs.ts`

**`POST /api/orgs`** (auth 필요):
- body: `{ name: string }` (Zod 검증)
- slug 생성: name을 소문자, 공백→하이픈, 특수문자 제거
- slug 중복 시 `-2`, `-3` 등 suffix 추가
- Organization 생성 + OrgMembership(OWNER) 생성 (트랜잭션)
- 응답: `201 { org: { id, name, slug } }`

**`POST /api/orgs/:orgId/members`** (auth 필요):
- 이미 멤버면 200으로 幂등 응답 (에러 아님)
- OrgMembership(MEMBER) 생성
- 응답: `201 { ok: true }`

**`GET /api/orgs`** (auth 필요):
- 현재 유저가 속한 모든 org 목록 반환
- 응답: `200 { orgs: Array<{ id, name, slug, role }> }`

### 5. `src/routes/projects.ts`

**`POST /api/projects`** (auth 필요):
- body: `{ name: string, orgId?: string }` (CreateProjectSchema 검증)
- `orgId` 없으면: 현재 유저의 org가 1개면 그것 사용, 없으면 org 자동 생성
- slug: name을 소문자화, 중복 시 suffix
- Project 생성
- 응답: `201 { projectId, orgId, orgName, projectName, projectSlug }`

**`GET /api/projects/:projectId`** (auth 필요):
- org 멤버십 확인 (비멤버는 403)
- 응답: `200 { project: { id, orgId, name, slug, createdAt } }`

**`GET /api/projects`** (auth 필요):
- 현재 유저의 org에 속한 프로젝트 목록
- 응답: `200 { projects: Array<{ id, orgId, name, slug }> }`

### 6. `src/app.ts` 업데이트

라우트를 app.ts에 등록하라:
```typescript
app.route('/api/auth', authRoute)
app.route('/api/orgs', orgsRoute)
app.route('/api/projects', projectsRoute)
```

## Acceptance Criteria

```bash
cd /Users/choesumin/Desktop/dev/vmc/argos
pnpm --filter @argos/api build
# 컴파일 에러 없음
```

## AC 검증 방법

빌드 성공 시 `/tasks/1-mvp/index.json`의 phase 3 status를 `"completed"`로 변경하라.
수정 3회 이상 실패하면 `"error"`로, 에러 내용을 `"error_message"`에 기록하라.

## 주의사항

- `401 { error: 'Invalid credentials' }` — 이메일이 없는 경우와 비밀번호가 틀린 경우를 구분하지 마라. 보안상 동일한 메시지를 반환해야 한다.
- CliToken 생성은 반드시 register/login 직후에 한다. 토큰을 DB에 저장하지 않으면 logout이 불가능하다.
- `lastUsedAt` 업데이트는 fire-and-forget (await 없이) — 인증 성능에 영향을 주면 안 된다.
- 비밀번호를 응답에 포함하지 마라 (`passwordHash` 필드 노출 금지).
- slug 생성 함수는 재사용 가능하게 `src/lib/slug.ts`로 분리하라.
