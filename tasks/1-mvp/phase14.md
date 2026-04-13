# Phase 14: Deployment (Railway + Vercel)

## 사전 준비

아래 문서들을 반드시 읽어라:

- `docs/code-architecture.md` — 1번 배포 토폴로지, Dockerfile, API/Web 환경변수
- `docs/adr.md` — ADR-011 (Vercel + Railway 분리 배포)

이전 phase 산출물을 반드시 확인하라:

- `packages/api/src/env.ts` — 환경변수 목록
- `packages/web/.env.example` — Web 환경변수 목록
- `package.json` (root) — turbo build 확인

## 작업 내용

API를 Railway에, Web을 Vercel에 배포한다. CI도 구성한다.

### 1. `packages/api/Dockerfile`

`docs/code-architecture.md`의 Dockerfile을 그대로 구현:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/shared ./packages/shared
COPY packages/api ./packages/api
RUN npm install -g pnpm && pnpm install --frozen-lockfile
RUN pnpm --filter @argos/shared build
RUN pnpm --filter @argos/api build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/api/dist ./packages/api/dist
COPY --from=builder /app/packages/api/prisma ./packages/api/prisma
COPY --from=builder /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
ENV NODE_ENV=production
WORKDIR /app/packages/api
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
```

### 2. `packages/api/railway.toml`

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "packages/api/Dockerfile"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

Railway는 monorepo root에서 Dockerfile을 실행하므로 `dockerfilePath`에 `packages/api/Dockerfile`을 지정해야 한다.

**참고**: railway.toml은 monorepo root에 위치해야 한다 (`/railway.toml`).

### 3. `packages/web/vercel.json`

```json
{
  "framework": "nextjs",
  "buildCommand": "cd ../.. && pnpm --filter @argos/web build",
  "outputDirectory": "packages/web/.next"
}
```

**참고**: Vercel 프로젝트 설정에서 Root Directory를 `packages/web`으로 설정해야 한다. (CLI 배포 시 `--root packages/web` 또는 vercel.json으로 처리)

### 4. `.github/workflows/ci.yml`

```yaml
name: CI
on:
  push:
    branches: [main, feat-*]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @argos/shared build
      - run: pnpm --filter @argos/api build
      - run: pnpm --filter argos-ai build
      - run: pnpm --filter @argos/web build
        env:
          AUTH_SECRET: "ci-placeholder-secret-min-32-chars-here"
          API_URL: "http://localhost:3001"
          NEXT_PUBLIC_API_URL: "http://localhost:3001"
```

### 5. Railway API 배포

Railway CLI로 배포:

```bash
# Railway CLI 로그인 확인 (이미 로그인됨)
railway status

# argos 프로젝트 연결 또는 생성
railway init --name argos-api
# 또는 기존 프로젝트 연결:
# railway link

# 환경변수 설정
railway variables set DATABASE_URL="<supabase-pooling-url>"
railway variables set DIRECT_URL="<supabase-direct-url>"
railway variables set JWT_SECRET="<min-32-char-random-string>"
railway variables set WEB_URL="<vercel-web-url>"
railway variables set NODE_ENV="production"

# 배포
railway up --detach
```

Supabase 연결 정보:
- Project ID: `uwxfseowdzuuepeeudrx`
- Pooling URL 형식: `postgresql://postgres.uwxfseowdzuuepeeudrx:[password]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true`
- Direct URL 형식: `postgresql://postgres.uwxfseowdzuuepeeudrx:[password]@db.uwxfseowdzuuepeeudrx.supabase.co:5432/postgres`

**Supabase 비밀번호를 모르거나 Railway CLI가 설정되지 않은 경우**: status를 `"blocked"`로 설정하고 `"blocked_reason"`에 필요한 정보를 기록하라.

### 6. Vercel Web 배포

```bash
cd /Users/choesumin/Desktop/dev/vmc/argos

# Vercel CLI 로그인 확인
vercel whoami

# 프로젝트 연결
cd packages/web
vercel --yes

# 환경변수 설정
vercel env add AUTH_SECRET production
vercel env add API_URL production
vercel env add NEXT_PUBLIC_API_URL production

# 프로덕션 배포
vercel --prod
```

API_URL은 Railway 배포 후 받은 URL을 사용.

### 7. `packages/cli/README.md` 생성

npm publish 준비를 위한 README:
```markdown
# argos-ai

Claude Code를 사용하는 팀의 AI 활동을 추적하는 CLI 도구.

## 설치
\`\`\`bash
npm install -g argos-ai
\`\`\`

## 사용법
\`\`\`bash
argos          # 팀 프로젝트 설정
argos status   # 현재 상태 확인
argos logout   # 로그아웃
\`\`\`
```

npm publish는 수동으로 진행한다 (`npm login && npm publish`).

## Acceptance Criteria

```bash
cd /Users/choesumin/Desktop/dev/vmc/argos

# Dockerfile lint
docker build -f packages/api/Dockerfile . --no-cache --target builder
# 빌드 성공 또는 Docker가 없으면 SKIP (blocked 아님)

# CI 파일 존재 확인
ls .github/workflows/ci.yml

# Railway/Vercel 배포 완료 시 health check
# curl https://<railway-url>/health → {"status":"ok"}
```

## AC 검증 방법

아래 중 가능한 것을 검증하라:

1. `ls .github/workflows/ci.yml` 존재 → 통과
2. `ls packages/api/Dockerfile` 존재 → 통과
3. Railway 또는 Vercel 배포 중 하나라도 성공 → 통과

Railway CLI나 Vercel CLI 인증 문제, 환경변수 부재로 배포가 실패하면:
- `"blocked"`로 표시하고 `"blocked_reason"`에 상세 원인 기록
- Dockerfile과 CI 파일 생성만 완료한 경우도 `"blocked"` (배포까지 완료해야 `"completed"`)

모든 배포 성공 시 `/tasks/1-mvp/index.json`의 phase 14 status를 `"completed"`로 변경하라.

## 주의사항

- Railway 배포 시 `railway up`은 현재 디렉토리 기준으로 실행된다. monorepo root (`/Users/choesumin/Desktop/dev/vmc/argos`)에서 실행해야 한다.
- Vercel 배포 시 `packages/web` 디렉토리에서 실행하거나 `--cwd packages/web` 옵션을 사용하라.
- `railway.toml`은 **monorepo root**에 위치해야 한다.
- Dockerfile에서 `@argos/shared`의 dist가 runner 이미지에 복사되어야 한다. 누락 시 런타임 에러.
- npm publish는 수동 작업이다. `packages/cli/package.json`의 `"files"` 필드를 설정해 dist/ 폴더만 배포되도록 준비하라:
  ```json
  "files": ["dist", "README.md"]
  ```
