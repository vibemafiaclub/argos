import 'server-only'

import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

import { env } from './env'

// 🛡️ Sentinel: Removed hardcoded admin credentials, using env vars
export const ADMIN_USERNAME = env.ADMIN_USERNAME
export const ADMIN_PASSWORD = env.ADMIN_PASSWORD

const ADMIN_SESSION_COOKIE = 'argos_admin_session'
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000
const ADMIN_IMPERSONATION_TTL_MS = 60 * 1000
const ADMIN_IMPERSONATION_PREFIX = 'argos_imp'

const ADMIN_PASSWORD_DERIVED_KEY_LEN = 32
const ADMIN_PASSWORD_KDF_ITERATIONS = 210_000
const ADMIN_PASSWORD_KDF_DIGEST = 'sha256'

const adminPasswordDerivedKey = pbkdf2Sync(
  ADMIN_PASSWORD,
  env.JWT_SECRET,
  ADMIN_PASSWORD_KDF_ITERATIONS,
  ADMIN_PASSWORD_DERIVED_KEY_LEN,
  ADMIN_PASSWORD_KDF_DIGEST
)

function safeTimingEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)

  const maxLen = Math.max(aBuf.length, bBuf.length)
  const aPadded = Buffer.alloc(maxLen)
  const bPadded = Buffer.alloc(maxLen)
  aBuf.copy(aPadded)
  bBuf.copy(bPadded)

  const contentEqual = timingSafeEqual(aPadded, bPadded)
  return contentEqual && aBuf.length === bBuf.length
}

function safePasswordEqual(password: string): boolean {
  const passwordDerivedKey = pbkdf2Sync(
    password,
    env.JWT_SECRET,
    ADMIN_PASSWORD_KDF_ITERATIONS,
    ADMIN_PASSWORD_DERIVED_KEY_LEN,
    ADMIN_PASSWORD_KDF_DIGEST
  )
  return timingSafeEqual(passwordDerivedKey, adminPasswordDerivedKey)
}

function sign(payload: string): string {
  return createHmac('sha256', env.JWT_SECRET).update(payload).digest('base64url')
}

export function verifyAdminCredentials(input: {
  username: string
  password: string
}): boolean {
  return (
    safeTimingEqual(input.username, ADMIN_USERNAME) &&
    safePasswordEqual(input.password)
  )
}

export function createAdminSessionCookieValue(): string {
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS
  const nonce = randomBytes(16).toString('base64url')
  const payload = `${ADMIN_USERNAME}.${expiresAt}.${nonce}`
  return `${payload}.${sign(payload)}`
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
  if (!value) return false

  const parts = value.split('.')
  if (parts.length !== 4) return false

  const [username, expiresAtRaw, nonce, signature] = parts
  const payload = `${username}.${expiresAtRaw}.${nonce}`
  if (!safeTimingEqual(signature, sign(payload))) return false
  if (!safeTimingEqual(username, ADMIN_USERNAME)) return false

  const expiresAt = Number(expiresAtRaw)
  return Number.isFinite(expiresAt) && Date.now() <= expiresAt
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
  const expiresAt = Date.now() + ADMIN_IMPERSONATION_TTL_MS
  const nonce = randomBytes(16).toString('base64url')
  const payload = `${ADMIN_IMPERSONATION_PREFIX}.${userId}.${expiresAt}.${nonce}`
  return `${payload}.${sign(payload)}`
}

export function verifyAdminImpersonationToken(token: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 5) return null

  const [prefix, userId, expiresAtRaw, nonce, signature] = parts
  const payload = `${prefix}.${userId}.${expiresAtRaw}.${nonce}`
  if (!safeTimingEqual(prefix, ADMIN_IMPERSONATION_PREFIX)) return null
  if (!safeTimingEqual(signature, sign(payload))) return null

  const expiresAt = Number(expiresAtRaw)
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null

  return userId
}

export { ADMIN_SESSION_COOKIE }
