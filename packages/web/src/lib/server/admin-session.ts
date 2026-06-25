import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

// admin-auth.ts 의 HMAC 세션 쿠키 / impersonation 토큰 로직을 순수 함수로 분리한 모듈.
// admin-auth.ts 는 'server-only' + env 의존이라 vitest 에서 import 할 수 없어,
// week-range.ts 와 동일한 수법으로 secret/username/now 를 인자로 받는 형태로 추출했다.
// 기본 인자(now = Date.now(), nonce = random)일 때 동작은 분리 전과 동일하다.

const MAX_SAFE_EQUAL_BYTES = 512
export const ADMIN_IMPERSONATION_PREFIX = 'argos_imp'

export function safeEqual(a: string, b: string): boolean {
  const aBytes = Buffer.from(a)
  const bBytes = Buffer.from(b)

  if (aBytes.length > MAX_SAFE_EQUAL_BYTES || bBytes.length > MAX_SAFE_EQUAL_BYTES) {
    return false
  }

  const aPadded = Buffer.alloc(MAX_SAFE_EQUAL_BYTES)
  const bPadded = Buffer.alloc(MAX_SAFE_EQUAL_BYTES)
  aBytes.copy(aPadded)
  bBytes.copy(bPadded)

  return timingSafeEqual(aPadded, bPadded) && aBytes.length === bBytes.length
}

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function createSessionCookieValue(input: {
  username: string
  secret: string
  ttlMs: number
  now?: number
  nonce?: string
}): string {
  const expiresAt = (input.now ?? Date.now()) + input.ttlMs
  const nonce = input.nonce ?? randomBytes(16).toString('base64url')
  const payload = `${input.username}.${expiresAt}.${nonce}`
  return `${payload}.${sign(input.secret, payload)}`
}

export function verifySessionCookieValue(
  value: string | undefined,
  input: { username: string; secret: string; now?: number },
): boolean {
  if (!value) return false

  const parts = value.split('.')
  if (parts.length !== 4) return false

  const [username, expiresAtRaw, nonce, signature] = parts
  const payload = `${username}.${expiresAtRaw}.${nonce}`
  if (!safeEqual(signature, sign(input.secret, payload))) return false
  if (!safeEqual(username, input.username)) return false

  const expiresAt = Number(expiresAtRaw)
  return Number.isFinite(expiresAt) && (input.now ?? Date.now()) <= expiresAt
}

export function createImpersonationToken(input: {
  userId: string
  secret: string
  ttlMs: number
  now?: number
  nonce?: string
}): string {
  const expiresAt = (input.now ?? Date.now()) + input.ttlMs
  const nonce = input.nonce ?? randomBytes(16).toString('base64url')
  const payload = `${ADMIN_IMPERSONATION_PREFIX}.${input.userId}.${expiresAt}.${nonce}`
  return `${payload}.${sign(input.secret, payload)}`
}

export function verifyImpersonationToken(
  token: string,
  input: { secret: string; now?: number },
): string | null {
  const parts = token.split('.')
  if (parts.length !== 5) return null

  const [prefix, userId, expiresAtRaw, nonce, signature] = parts
  const payload = `${prefix}.${userId}.${expiresAtRaw}.${nonce}`
  if (!safeEqual(prefix, ADMIN_IMPERSONATION_PREFIX)) return null
  if (!safeEqual(signature, sign(input.secret, payload))) return null

  const expiresAt = Number(expiresAtRaw)
  if (!Number.isFinite(expiresAt) || (input.now ?? Date.now()) > expiresAt) return null

  return userId
}
