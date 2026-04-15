import { NextRequest, NextResponse } from 'next/server'
import { auth } from './auth'
import type { Session } from 'next-auth'

type AuthedRequest = NextRequest & { auth: Session | null }

export default auth((req) => {
  const request = req as unknown as AuthedRequest
  const isLoggedIn = !!request.auth
  const pathname = request.nextUrl?.pathname ?? request.url
  const isDashboard = pathname.startsWith('/dashboard')

  if (isDashboard && !isLoggedIn) {
    const loginUrl = new URL('/login', request.nextUrl?.origin ?? request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
