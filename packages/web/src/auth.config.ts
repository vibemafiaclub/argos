import type { NextAuthConfig } from 'next-auth'

// Edge 런타임에서도 안전하게 import할 수 있는 NextAuth 설정.
// providers는 비워두고 authorize가 필요한 Credentials provider는 auth.ts(Node 런타임)에서 추가한다.
// middleware는 이 파일만 import해야 bcrypt/Prisma가 Edge 번들에 포함되지 않는다.
export const authConfig = {
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.argosToken = user.argosToken
      return token
    },
    async session({ session, token }) {
      session.argosToken = token.argosToken as string
      return session
    },
  },
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
} satisfies NextAuthConfig
