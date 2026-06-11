/**
 * admin-auth.test.ts — admin HMAC 쿠키/임퍼스네이션 토큰 가드
 *
 * /api/admin/* 전체의 인증이 이 모듈 하나에 걸려 있으나 기존 테스트가 없었다.
 * 쿠키 와이어 포맷(`user.exp.nonce.sig`)과 만료·변조·위장 거부를 고정한다.
 */
import { describe, it, expect, vi } from 'vitest'
import { createHmac } from 'crypto'
import { NextRequest } from 'next/server'

const TEST_ENV = vi.hoisted(() => ({
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD: 'correct-horse-battery-staple',
  ADMIN_COOKIE_SECRET: 'admin-cookie-secret-32-chars-long!!!',
}))

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('./env', () => ({ env: TEST_ENV }))

import {
  verifyAdminCredentials,
  createAdminSessionCookieValue,
  verifyAdminSessionCookie,
  createAdminImpersonationToken,
  verifyAdminImpersonationToken,
  requireAdmin,
} from './admin-auth'

/** admin-auth.ts 내부 sign() 과 동일한 HMAC 서명 (와이어 포맷 호환성 검증용) */
function hmacSign(payload: string): string {
  return createHmac('sha256', TEST_ENV.ADMIN_COOKIE_SECRET).update(payload).digest('base64url')
}

describe('verifyAdminCredentials', () => {
  it('정확한 username + password → true', () => {
    expect(verifyAdminCredentials({ username: 'admin', password: 'correct-horse-battery-staple' })).toBe(true)
  })

  it('username 또는 password 불일치 → false', () => {
    expect(verifyAdminCredentials({ username: 'admin2', password: 'correct-horse-battery-staple' })).toBe(false)
    expect(verifyAdminCredentials({ username: 'admin', password: 'wrong-password-wrong' })).toBe(false)
  })

  it('512 바이트 초과 입력 → false (timingSafeEqual 패딩 한계 가드)', () => {
    expect(verifyAdminCredentials({ username: 'admin', password: 'a'.repeat(513) })).toBe(false)
  })
})

describe('admin 세션 쿠키', () => {
  it('createAdminSessionCookieValue → verifyAdminSessionCookie 라운드트립', () => {
    const value = createAdminSessionCookieValue()
    expect(value.split('.')).toHaveLength(4)
    expect(verifyAdminSessionCookie(value)).toBe(true)
  })

  it('undefined / 빈 문자열 / 분절 수 불일치 → false', () => {
    expect(verifyAdminSessionCookie(undefined)).toBe(false)
    expect(verifyAdminSessionCookie('')).toBe(false)
    expect(verifyAdminSessionCookie('a.b.c')).toBe(false)
  })

  it('서명 변조 → false', () => {
    const value = createAdminSessionCookieValue()
    expect(verifyAdminSessionCookie(value + 'x')).toBe(false)
  })

  it('와이어 포맷 호환: 외부에서 같은 포맷·시크릿으로 서명하면 검증된다', () => {
    const payload = `admin.${Date.now() + 60_000}.nonce123`
    expect(verifyAdminSessionCookie(`${payload}.${hmacSign(payload)}`)).toBe(true)
  })

  it('만료된 세션 (유효 서명) → false', () => {
    const payload = `admin.${Date.now() - 1_000}.nonce123`
    expect(verifyAdminSessionCookie(`${payload}.${hmacSign(payload)}`)).toBe(false)
  })

  it('다른 username 으로 서명된 쿠키 (유효 서명) → false', () => {
    const payload = `other.${Date.now() + 60_000}.nonce123`
    expect(verifyAdminSessionCookie(`${payload}.${hmacSign(payload)}`)).toBe(false)
  })
})

describe('admin 임퍼스네이션 토큰', () => {
  it('create → verify 라운드트립은 userId 를 돌려준다', () => {
    const token = createAdminImpersonationToken('user-1')
    expect(verifyAdminImpersonationToken(token)).toBe('user-1')
  })

  it('만료된 토큰 (유효 서명) → null', () => {
    const payload = `argos_imp.user-1.${Date.now() - 1_000}.nonce123`
    expect(verifyAdminImpersonationToken(`${payload}.${hmacSign(payload)}`)).toBeNull()
  })

  it('서명 변조 / prefix 불일치 → null', () => {
    const token = createAdminImpersonationToken('user-1')
    expect(verifyAdminImpersonationToken(token + 'x')).toBeNull()

    const payload = `argos_other.user-1.${Date.now() + 60_000}.nonce123`
    expect(verifyAdminImpersonationToken(`${payload}.${hmacSign(payload)}`)).toBeNull()
  })

  // TODO(bug): userId 에 '.' 이 포함되면 토큰이 6분절이 되어 round-trip 이 깨진다
  // (create 는 성공하지만 verify 가 null). 현재 userId 는 cuid 라 '.' 이 들어올 수
  // 없어 실해는 없으나, ID 포맷이 바뀌면 임퍼스네이션이 조용히 전부 실패한다.
  // env.ts 의 ADMIN_USERNAME 처럼 생성 시점 가드가 없다. HEALTH.md 리스크 참조.
  it('userId 에 "." 포함 시 round-trip 이 깨진다 (현재 동작 고정)', () => {
    const token = createAdminImpersonationToken('user.1')
    expect(verifyAdminImpersonationToken(token)).toBeNull()
  })
})

describe('requireAdmin', () => {
  it('유효한 세션 쿠키 → null (통과)', () => {
    const value = createAdminSessionCookieValue()
    const req = new NextRequest('http://localhost/api/admin/users', {
      headers: { cookie: `argos_admin_session=${value}` },
    })
    expect(requireAdmin(req)).toBeNull()
  })

  it('쿠키 없음 → 401 응답', () => {
    const req = new NextRequest('http://localhost/api/admin/users')
    const res = requireAdmin(req)
    expect(res?.status).toBe(401)
  })
})
