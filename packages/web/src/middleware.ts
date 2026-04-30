import NextAuth from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import type { Session } from 'next-auth'

import { authConfig } from './auth.config'

type AuthedRequest = NextRequest & { auth: Session | null }

// middleware는 Edge 런타임이므로 bcrypt/Prisma가 들어간 auth.ts를 직접 import하면 안 된다.
// Edge-safe한 authConfig만 가지고 NextAuth를 인스턴스화한다.
const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const request = req as unknown as AuthedRequest
  const isLoggedIn = !!request.auth
  const pathname = request.nextUrl?.pathname ?? request.url
  const isProtected = pathname.startsWith('/dashboard')

  if (isProtected && !isLoggedIn) {
    const loginUrl = new URL('/login', request.nextUrl?.origin ?? request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
