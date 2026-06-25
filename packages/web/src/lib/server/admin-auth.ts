import 'server-only'

import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

import {
  createImpersonationToken,
  createSessionCookieValue,
  safeEqual,
  verifyImpersonationToken,
  verifySessionCookieValue,
} from './admin-session'
import { env } from './env'

export const ADMIN_USERNAME = env.ADMIN_USERNAME
export const ADMIN_PASSWORD = env.ADMIN_PASSWORD

const ADMIN_SESSION_COOKIE = 'argos_admin_session'
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000
const ADMIN_IMPERSONATION_TTL_MS = 60 * 1000

export function verifyAdminCredentials(input: {
  username: string
  password: string
}): boolean {
  return (
    safeEqual(input.username, ADMIN_USERNAME) &&
    safeEqual(input.password, ADMIN_PASSWORD)
  )
}

export function createAdminSessionCookieValue(): string {
  return createSessionCookieValue({
    username: ADMIN_USERNAME,
    secret: env.ADMIN_COOKIE_SECRET,
    ttlMs: ADMIN_SESSION_TTL_MS,
  })
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
  }
}

export function expiredAdminCookieOptions() {
  return {
    ...adminCookieOptions(),
    maxAge: 0,
  }
}

export function verifyAdminSessionCookie(value: string | undefined): boolean {
  return verifySessionCookieValue(value, {
    username: ADMIN_USERNAME,
    secret: env.ADMIN_COOKIE_SECRET,
  })
}

export async function hasAdminSession(): Promise<boolean> {
  const cookieStore = await cookies()
  return verifyAdminSessionCookie(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)
}

export function requireAdmin(req: NextRequest): NextResponse | null {
  if (verifyAdminSessionCookie(req.cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
    return null
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export function createAdminImpersonationToken(userId: string): string {
  return createImpersonationToken({
    userId,
    secret: env.ADMIN_COOKIE_SECRET,
    ttlMs: ADMIN_IMPERSONATION_TTL_MS,
  })
}

export function verifyAdminImpersonationToken(token: string): string | null {
  return verifyImpersonationToken(token, { secret: env.ADMIN_COOKIE_SECRET })
}

export { ADMIN_SESSION_COOKIE }
