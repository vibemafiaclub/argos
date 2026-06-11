import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAdminImpersonationToken,
  createAdminSessionCookieValue,
  verifyAdminCredentials,
  verifyAdminImpersonationToken,
  verifyAdminSessionCookie,
} from './admin-auth'

const TEST_ENV = vi.hoisted(() => ({
  ADMIN_USERNAME: 'admin-user',
  ADMIN_PASSWORD: 'admin-password-at-least-16',
  ADMIN_COOKIE_SECRET: 'test-admin-cookie-secret-32-chars!!',
}))

// admin-auth.ts 는 'server-only' 와 next/headers 를 import 하므로 노드 환경에서 bypass.
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('./env', () => ({ env: TEST_ENV }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-12T00:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('verifyAdminCredentials', () => {
  it('정확한 username/password 조합만 통과한다', () => {
    expect(
      verifyAdminCredentials({ username: TEST_ENV.ADMIN_USERNAME, password: TEST_ENV.ADMIN_PASSWORD }),
    ).toBe(true)
    expect(verifyAdminCredentials({ username: TEST_ENV.ADMIN_USERNAME, password: 'wrong' })).toBe(false)
    expect(verifyAdminCredentials({ username: 'wrong', password: TEST_ENV.ADMIN_PASSWORD })).toBe(false)
    expect(verifyAdminCredentials({ username: '', password: '' })).toBe(false)
  })

  it('prefix 만 일치하는 입력은 거부한다 (길이 비교 포함)', () => {
    expect(
      verifyAdminCredentials({
        username: TEST_ENV.ADMIN_USERNAME,
        password: TEST_ENV.ADMIN_PASSWORD + 'x',
      }),
    ).toBe(false)
    expect(
      verifyAdminCredentials({
        username: TEST_ENV.ADMIN_USERNAME,
        password: TEST_ENV.ADMIN_PASSWORD.slice(0, -1),
      }),
    ).toBe(false)
  })

  it('512 바이트를 넘는 입력은 즉시 거부한다 (timingSafeEqual 패딩 한계)', () => {
    expect(
      verifyAdminCredentials({ username: 'a'.repeat(513), password: TEST_ENV.ADMIN_PASSWORD }),
    ).toBe(false)
  })
})

describe('admin session cookie', () => {
  it('round-trip: 발급한 쿠키는 검증을 통과한다', () => {
    const cookie = createAdminSessionCookieValue()
    expect(verifyAdminSessionCookie(cookie)).toBe(true)
  })

  it('TTL(12시간) 안에서는 유효하고, 지나면 만료된다', () => {
    const cookie = createAdminSessionCookieValue()
    vi.advanceTimersByTime(12 * 60 * 60 * 1000 - 1)
    expect(verifyAdminSessionCookie(cookie)).toBe(true)
    vi.advanceTimersByTime(2)
    expect(verifyAdminSessionCookie(cookie)).toBe(false)
  })

  it('서명·payload 변조는 거부한다', () => {
    const cookie = createAdminSessionCookieValue()
    const parts = cookie.split('.')

    const tamperedSig = [...parts.slice(0, 3), 'forged-signature'].join('.')
    expect(verifyAdminSessionCookie(tamperedSig)).toBe(false)

    const tamperedUser = ['other-user', ...parts.slice(1)].join('.')
    expect(verifyAdminSessionCookie(tamperedUser)).toBe(false)

    const tamperedExpiry = [parts[0], String(Date.now() + 10 ** 9), ...parts.slice(2)].join('.')
    expect(verifyAdminSessionCookie(tamperedExpiry)).toBe(false)
  })

  it('형식이 깨진 값(빈 값, 파트 수 불일치)은 거부한다', () => {
    expect(verifyAdminSessionCookie(undefined)).toBe(false)
    expect(verifyAdminSessionCookie('')).toBe(false)
    expect(verifyAdminSessionCookie('a.b.c')).toBe(false)
    expect(verifyAdminSessionCookie('a.b.c.d.e')).toBe(false)
  })
})

describe('admin impersonation token', () => {
  it('round-trip: 발급한 토큰에서 userId 를 복원한다', () => {
    const token = createAdminImpersonationToken('user-42')
    expect(verifyAdminImpersonationToken(token)).toBe('user-42')
  })

  it('TTL(60초)이 지나면 null 을 반환한다', () => {
    const token = createAdminImpersonationToken('user-42')
    vi.advanceTimersByTime(60 * 1000 - 1)
    expect(verifyAdminImpersonationToken(token)).toBe('user-42')
    vi.advanceTimersByTime(2)
    expect(verifyAdminImpersonationToken(token)).toBeNull()
  })

  it('userId·서명 변조는 null 을 반환한다', () => {
    const token = createAdminImpersonationToken('user-42')
    const parts = token.split('.')

    const swappedUser = [parts[0], 'user-99', ...parts.slice(2)].join('.')
    expect(verifyAdminImpersonationToken(swappedUser)).toBeNull()

    const forgedSig = [...parts.slice(0, 4), 'forged'].join('.')
    expect(verifyAdminImpersonationToken(forgedSig)).toBeNull()
  })

  it('prefix 가 다르거나 파트 수가 다른 토큰은 null 을 반환한다', () => {
    const token = createAdminImpersonationToken('user-42')
    const parts = token.split('.')
    const wrongPrefix = ['evil_imp', ...parts.slice(1)].join('.')
    expect(verifyAdminImpersonationToken(wrongPrefix)).toBeNull()
    expect(verifyAdminImpersonationToken('a.b.c.d')).toBeNull()
    expect(verifyAdminImpersonationToken('')).toBeNull()
  })

  // TODO(bug): payload 가 '.' 구분자 join 이라 userId 에 '.' 이 들어가면 발급은 되지만
  // 검증 시 parts.length !== 5 로 항상 null 이 된다 (조용한 round-trip 실패).
  // 현재 userId 는 cuid 라 '.' 이 없어 실해는 없지만, ID 체계가 바뀌면 터진다. 현재 동작을 고정한다.
  it("userId 에 '.' 이 포함되면 발급된 토큰이 검증에 실패한다 (현재 동작)", () => {
    const token = createAdminImpersonationToken('user.42')
    expect(verifyAdminImpersonationToken(token)).toBeNull()
  })
})
