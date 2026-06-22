# argos — Claude Code 작업 가이드

## 프로덕션 버그 대응 프로토콜

**500 에러 신고 수신 즉시 — 코드 분석 전에 먼저 실행:**

```bash
vercel logs --status-code 500 --since 24h -x --project argos-web
```

로그에서 에러 메시지를 확인한 뒤 코드 분석 시작. 로그가 근본 원인을 직접 가리키는 경우가 대부분임.

**자주 나오는 패턴:**

| 에러 메시지 | 원인 | 조치 |
|---|---|---|
| `column 'xxx' does not exist` | 마이그레이션 미적용 | `pnpm --filter @argos/web db:migrate` 후 재배포 |
| `UNIQUE constraint failed` | 중복 insert | race condition 또는 클라이언트 중복 요청 |
| `Cannot find module` | 빌드 실패 | vercel deployment 로그 확인 |

---

## API 에러 응답 규격

모든 API 에러 응답은 동일한 shape을 사용한다:

```ts
{ error: { code: string; message: string } }
```

- 400/401/403/404/409/410: `{ error: { code: 'SNAKE_CASE', message: '...' } }`
- 500: `handleRouteError(err)` 호출 (error-helper.ts)
- 직접 `{ error: 'string' }` 패턴 사용 금지 — `jsonError()` 헬퍼 사용

**클라이언트에서 에러 메시지 추출:**
```ts
const msg = data.error?.message ?? 'An error occurred'
```

---

## DB 스키마 변경 절차

1. `schema.prisma` 수정
2. `pnpm --filter @argos/web exec prisma migrate dev --name <설명>` 실행
3. PR에 migration SQL 파일 포함
4. 배포 시 vercel.json의 buildCommand가 `prisma migrate deploy` 자동 실행

schema.prisma를 수정하고 migration 파일을 만들지 않으면 CI가 실패한다.

---

## 모노레포 구조

```
packages/web    — Next.js 15 App Router (Vercel 배포 타겟)
packages/shared — 공유 타입/스키마
packages/ai     — AI 관련 패키지
```

**주요 파일:**
- `packages/web/src/lib/server/auth-actions.ts` — 인증 비즈니스 로직
- `packages/web/src/lib/server/error-helper.ts` — API 에러 응답 헬퍼
- `packages/web/src/lib/server/jwt.ts` — JWT 발급/검증
- `packages/web/prisma/schema.prisma` — DB 스키마

---

## 자주 쓰는 명령어

```bash
# 로컬 개발
pnpm --filter @argos/web dev

# 타입체크
pnpm --filter @argos/web exec tsc --noEmit

# 테스트
pnpm --filter @argos/web test

# DB 마이그레이션 (로컬)
pnpm --filter @argos/web exec prisma migrate dev --name <이름>

# 프로덕션 로그
vercel logs --status-code 500 --since 24h -x --project argos-web
```
