# Phase 4: API Auth Eval (Security Review)

## 사전 준비

아래 문서들을 반드시 읽어라:

- `docs/adr.md` — ADR-003, ADR-004 (JWT + DB revocation 설계 의도)
- `docs/code-architecture.md` — 인증 흐름, CliToken 설명

이전 phase 산출물을 반드시 확인하라:

- `packages/api/src/lib/jwt.ts`
- `packages/api/src/middleware/auth.ts`
- `packages/api/src/routes/auth.ts`
- `packages/api/src/routes/orgs.ts`
- `packages/api/src/routes/projects.ts`

## 작업 내용

Phase 3 산출물을 보안 관점에서 검토하고 수정한다. **새 기능 추가 금지.**

### 보안 검토 체크리스트

#### JWT (`src/lib/jwt.ts`)
- [ ] 만료 기간이 1년 (31536000초)인가
- [ ] `verifyJwt` 실패 시 throw 없이 null 반환하는가
- [ ] JWT_SECRET이 env.ts에서 가져오는가 (하드코딩 없음)
- [ ] payload에 userId만 포함 (`sub` 필드), 이메일/비밀번호 포함 안 됨

#### 인증 미들웨어 (`src/middleware/auth.ts`)
- [ ] SHA-256 해시 계산이 올바른가 (Node.js `crypto.createHash('sha256').update(token).digest('hex')`)
- [ ] CliToken.revokedAt이 null이 아닌 경우 401 반환
- [ ] 토큰이 없거나 형식이 잘못된 경우 401 반환 (500 아님)
- [ ] `lastUsedAt` 업데이트가 non-blocking인가 (await 없음)

#### 인증 라우트 (`src/routes/auth.ts`)
- [ ] `POST /api/auth/register`: 이미 존재하는 이메일 → 409 (404나 500 아님)
- [ ] `POST /api/auth/login`: 이메일 없음과 비밀번호 틀림을 동일한 401로 처리 (user existence oracle 방지)
- [ ] `passwordHash` 필드가 응답에 포함되지 않음
- [ ] bcrypt saltRounds ≥ 10
- [ ] bcrypt.compare는 실제 해시와 비교하는가 (평문 비교 아님)
- [ ] 로그아웃은 revokedAt을 설정하는가 (토큰 삭제 아님)

#### 조직/프로젝트 라우트
- [ ] `/api/orgs/:orgId/members` — 멤버십 중복 시 idempotent 200 응답 (중복 insert 에러 없음)
- [ ] `/api/projects/:projectId` — org 멤버십 확인 (403)
- [ ] auth 미들웨어가 모든 보호된 라우트에 적용됨

#### 코드 품질
- [ ] 에러 메시지가 내부 DB 오류를 노출하지 않음
- [ ] `try-catch` 없이 Prisma unique violation이 적절히 처리됨 (P2002 코드 확인)

### 발견된 문제 수정

체크리스트에서 실패하는 항목을 즉시 수정하라.

## Acceptance Criteria

```bash
cd /Users/choesumin/Desktop/dev/vmc/argos
pnpm --filter @argos/api build
# 컴파일 에러 없음
```

## AC 검증 방법

빌드 성공 시 `/tasks/1-mvp/index.json`의 phase 4 status를 `"completed"`로 변경하라.
3회 이상 실패 시 `"error"`로, 에러 내용 기록.

## 주의사항

- 이 phase는 **보안 검토**가 목적이다. 새 기능(대시보드, 이벤트 등)을 추가하지 마라.
- user existence oracle은 실제 보안 취약점이다. 로그인 실패 시 이메일 존재 여부를 절대 구분하지 마라.
- Prisma의 unique constraint violation은 error code `P2002`로 확인할 수 있다.
