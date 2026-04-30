import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'

import { authConfig } from './auth.config'
import { loginUser } from './lib/server/auth-actions'

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { type: 'email' },
        password: { type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email
        const password = credentials?.password
        if (typeof email !== 'string' || typeof password !== 'string') {
          return null
        }

        const result = await loginUser({ email, password })
        if (!result) return null

        const { token, user } = result
        return { ...user, argosToken: token }
      },
    }),
  ],
})
