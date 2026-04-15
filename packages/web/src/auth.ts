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
})
