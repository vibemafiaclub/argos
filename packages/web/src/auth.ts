import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'

import { authConfig } from './auth.config'
import { issueUserAuthResult, loginUser } from './lib/server/auth-actions'
import { verifyAdminImpersonationToken } from './lib/server/admin-auth'

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { type: 'email' },
        password: { type: 'password' },
        impersonationToken: { type: 'text' },
      },
      async authorize(credentials) {
        const impersonationToken = credentials?.impersonationToken
        if (typeof impersonationToken === 'string' && impersonationToken.length > 0) {
          const userId = verifyAdminImpersonationToken(impersonationToken)
          if (!userId) return null

          const result = await issueUserAuthResult(userId)
          if (!result) return null

          const { token, user } = result
          return { ...user, argosToken: token }
        }

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
