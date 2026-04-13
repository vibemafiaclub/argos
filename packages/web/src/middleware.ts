import { NextResponse } from 'next/server'
import { auth } from './auth'

export default auth((req: any) => {
  const isLoggedIn = !!req.auth
  const pathname = req.nextUrl?.pathname || req.url
  const isDashboard = pathname.startsWith('/dashboard')

  if (isDashboard && !isLoggedIn) {
    const loginUrl = new URL('/login', req.nextUrl?.origin || req.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
