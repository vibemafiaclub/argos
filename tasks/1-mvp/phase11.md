# Phase 11: Web Foundation + Auth

## 사전 준비

아래 문서들을 반드시 읽어라:

- `docs/code-architecture.md` — 5번 섹션 `packages/web` 전체 (Auth.js 설정, 환경변수, 디렉토리 구조)
- `docs/flow.md` — Flow 5 (CLI 인증), Flow 7 (웹 대시보드 탐색)

이전 phase 산출물을 반드시 확인하라:

- `packages/shared/src/types/auth.ts` — User, LoginResponse
- `packages/api/src/routes/auth.ts` — API 엔드포인트 구조 확인

## 작업 내용

`packages/web` Next.js 15 앱의 기반을 구축한다.

### 1. `packages/web/package.json`

```json
{
  "name": "@argos/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "@argos/shared": "workspace:*",
    "next": "15",
    "next-auth": "^5.0.0-beta",
    "react": "^19",
    "react-dom": "^19",
    "zod": "^3"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

shadcn/ui 초기화는 이 phase에서 수행:
```bash
cd packages/web
npx shadcn@latest init
# style: default, tailwind: yes, path aliases: yes (@/*)
# 기본 컴포넌트 추가:
npx shadcn@latest add button card input label form
```

### 2. `packages/web/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### 3. `packages/web/next.config.ts`

```typescript
import type { NextConfig } from 'next'
const config: NextConfig = {
  transpilePackages: ['@argos/shared'],
}
export default config
```

### 4. `packages/web/.env.example`

```env
AUTH_SECRET=replace-with-min-32-char-random-string
API_URL=http://localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 5. `src/auth.ts` — Auth.js v5 설정

`docs/code-architecture.md`의 `auth.ts` 코드를 그대로 구현:

```typescript
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { type: 'email' },
        password: { type: 'password' },
      },
      async authorize({ email, password }) {
        const res = await fetch(`${process.env.API_URL}/api/auth/login`, {
          method: 'POST',
          body: JSON.stringify({ email, password }),
          headers: { 'Content-Type': 'application/json' },
        })
        if (!res.ok) return null
        const { token, user } = await res.json()
        return { ...user, argosToken: token }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.argosToken = (user as any).argosToken
      return token
    },
    async session({ session, token }) {
      (session as any).argosToken = token.argosToken as string
      return session
    },
  },
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
})
```

TypeScript 타입 확장 (`src/types/next-auth.d.ts`):
```typescript
import 'next-auth'
declare module 'next-auth' {
  interface Session { argosToken: string }
}
```

### 6. `src/middleware.ts`

```typescript
import { auth } from './auth'
export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isDashboard = req.nextUrl.pathname.startsWith('/dashboard')
  if (isDashboard && !isLoggedIn) {
    return Response.redirect(new URL('/login', req.url))
  }
})
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
```

### 7. `src/app/api/auth/[...nextauth]/route.ts`

```typescript
import { handlers } from '@/auth'
export const { GET, POST } = handlers
```

### 8. `src/app/layout.tsx`

루트 레이아웃:
```typescript
// SessionProvider 없음 (server-side auth만 사용)
// Geist 폰트 또는 Inter 폰트
// TailwindCSS globals.css import
```

### 9. `src/app/page.tsx`

```typescript
// / → /dashboard로 리다이렉트
import { redirect } from 'next/navigation'
export default function Home() {
  redirect('/dashboard')
}
```

### 10. `/login` 페이지 (`src/app/login/page.tsx`)

- 이메일/비밀번호 폼 (shadcn Form + Input + Button)
- `signIn('credentials', { email, password, redirectTo: '/dashboard' })` 호출
- 로그인 실패 시 에러 메시지 표시
- "계정이 없으신가요? 회원가입" 링크

### 11. `/register` 페이지 (`src/app/register/page.tsx`)

- 이름, 이메일, 비밀번호 폼
- `POST ${process.env.NEXT_PUBLIC_API_URL}/api/auth/register` 호출
- 성공 시 자동 로그인 후 `/dashboard` 이동
- 실패 시 에러 메시지

### 12. `/dashboard` 기본 레이아웃 (`src/app/dashboard/[projectId]/layout.tsx`)

사이드바 + 헤더 레이아웃만 구현 (데이터 없음):
- `src/components/layout/sidebar.tsx`: 네비게이션 링크 (Overview, Users, Skills, Agents, Sessions)
- `src/components/layout/header.tsx`: 프로젝트 이름, 로그아웃 버튼

`src/app/dashboard/page.tsx`:
```typescript
// 첫 번째 프로젝트로 리다이렉트
// GET /api/projects → 첫 번째 projectId로 /dashboard/{projectId} 이동
```

## Acceptance Criteria

```bash
cd /Users/choesumin/Desktop/dev/vmc/argos

# 웹 빌드 (환경변수 없이도 빌드 성공해야 함 - .env.local이 있다면 활용)
pnpm --filter @argos/web build
# 컴파일/빌드 에러 없음
```

## AC 검증 방법

빌드 성공 시 `/tasks/1-mvp/index.json`의 phase 11 status를 `"completed"`로 변경하라.
3회 이상 실패 시 `"error"`로, 에러 내용 기록.

## 주의사항

- `next-auth` v5 (beta)는 `next-auth@5.0.0-beta.*` 형태로 설치된다. v4와 API가 다르다. v5 문서 기준으로 구현하라.
- `AUTH_SECRET` 환경변수가 없으면 Next.js dev에서 경고가 나온다. `.env.local`에 임시값 설정하라.
- shadcn/ui 초기화 시 TailwindCSS v4 설정이 자동으로 구성된다. `tailwind.config.ts`는 v4에서는 선택적이다.
- `transpilePackages: ['@argos/shared']`는 monorepo에서 shared 패키지를 Next.js가 올바르게 처리하기 위해 필요하다.
- login 페이지에서 `signIn` 함수는 Server Action으로 호출해야 한다 (Auth.js v5). Client Component에서 직접 import하지 마라.
