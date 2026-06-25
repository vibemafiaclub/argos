/**
 * admin-session.test.ts — 관리자 HMAC 세션 쿠키 / impersonation 토큰 검증 로직 고정
 *
 * admin-auth.ts('server-only' + env 의존)에서 분리한 admin-session.ts 의 순수 함수를
 * 검증한다. 분리 전후 동작 동일성은 ① 와이어 포맷 골든 테스트(서명을 테스트 안에서
 * node:crypto 로 독립 재계산)와 ② 분기별 검증 순서 테스트로 증명한다.
 *
 * 검증 순서(분리 전 admin-auth.ts 와 동일):
 *  - 세션 쿠키: parts(4) → 서명 → username → 만료 (Date.now() <= expiresAt)
 *  - impersonation: parts(5) → prefix → 서명 → 만료 (Date.now() > expiresAt 이면 거부)
 */
import { createHmac } from 'crypto'
import { describe, expect, it } from 'vitest'

import {
  ADMIN_IMPERSONATION_PREFIX,
  createImpersonationToken,
  createSessionCookieValue,
  safeEqual,
  verifyImpersonationToken,
  verifySessionCookieValue,
} from './admin-session'

const SECRET = 'test-admin-cookie-secret-32bytes!!'
const OTHER_SECRET = 'another-admin-cookie-secret-32b!!!'
const USERNAME = 'admin'
const NOW = 1_770_000_000_000 // 고정 기준 시각
const TTL = 12 * 60 * 60 * 1000

// 테스트 내 독립 재계산용 — 구현과 별도로 포맷 스펙을 재서술한다.
function hmac(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function makeSessionCookie(overrides?: {
  username?: string
  expiresAt?: string | number
  nonce?: string
  secret?: string
}): string {
  const username = overrides?.username ?? USERNAME
  const expiresAt = overrides?.expiresAt ?? NOW + TTL
  const nonce = overrides?.nonce ?? 'fixednonce'
  const secret = overrides?.secret ?? SECRET
  const payload = `${username}.${expiresAt}.${nonce}`
  return `${payload}.${hmac(secret, payload)}`
}

describe('safeEqual', () => {
  it('동일 문자열 → true, 다른 문자열 → false', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
  })

  it('길이가 다르면 false (prefix 일치해도)', () => {
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })

  it('빈 문자열끼리는 true', () => {
    expect(safeEqual('', '')).toBe(true)
  })

  // TODO(bug): 512바이트 초과는 동일한 값이어도 무조건 false다 (DoS 가드).
  // env.ts 는 ADMIN_PASSWORD 를 512 "문자"까지 허용하므로, 멀티바이트 문자(한글 등)로
  // 512바이트를 넘는 비밀번호를 설정하면 env 검증은 통과하지만 로그인은 영구히 실패한다.
  // 예: 한글 200자 = UTF-8 600바이트. (HEALTH.md 리스크 섹션에 기록)
  it('512바이트 초과 입력은 동일 값이어도 false (멀티바이트 포함)', () => {
    const long = 'a'.repeat(513)
    expect(safeEqual(long, long)).toBe(false)

    const korean = '가'.repeat(200) // 600 bytes
    expect(safeEqual(korean, korean)).toBe(false)
  })

  it('512바이트 경계값은 true', () => {
    const max = 'a'.repeat(512)
    expect(safeEqual(max, max)).toBe(true)
  })
})

describe('createSessionCookieValue', () => {
  it('골든: 와이어 포맷은 `${username}.${expiresAt}.${nonce}.${base64url(HMAC-SHA256)}`', () => {
    const cookie = createSessionCookieValue({
      username: USERNAME,
      secret: SECRET,
      ttlMs: TTL,
      now: NOW,
      nonce: 'fixednonce',
    })
    const expectedPayload = `${USERNAME}.${NOW + TTL}.fixednonce`
    expect(cookie).toBe(`${expectedPayload}.${hmac(SECRET, expectedPayload)}`)
  })

  it('같은 입력(now/nonce 고정)으로 두 번 호출해도 결과가 같다 (순수성)', () => {
    const input = { username: USERNAME, secret: SECRET, ttlMs: TTL, now: NOW, nonce: 'n' }
    expect(createSessionCookieValue(input)).toBe(createSessionCookieValue(input))
  })

  it('nonce 미지정 시 임의 nonce 로 4-파트 쿠키를 생성하고 즉시 검증을 통과한다', () => {
    const cookie = createSessionCookieValue({
      username: USERNAME,
      secret: SECRET,
      ttlMs: TTL,
      now: NOW,
    })
    expect(cookie.split('.')).toHaveLength(4)
    expect(verifySessionCookieValue(cookie, { username: USERNAME, secret: SECRET, now: NOW })).toBe(true)
  })
})

describe('verifySessionCookieValue', () => {
  const verify = (value: string | undefined, now = NOW) =>
    verifySessionCookieValue(value, { username: USERNAME, secret: SECRET, now })

  it('정상 쿠키 round-trip → true', () => {
    expect(verify(makeSessionCookie())).toBe(true)
  })

  it('undefined / 빈 문자열 → false', () => {
    expect(verify(undefined)).toBe(false)
    expect(verify('')).toBe(false)
  })

  it('파트 수가 4가 아니면 false (3파트, 5파트)', () => {
    expect(verify('admin.123.sig')).toBe(false)
    expect(verify('admin.123.nonce.extra.sig')).toBe(false)
  })

  it('서명 변조 → false', () => {
    const cookie = makeSessionCookie()
    expect(verify(cookie.slice(0, -1) + (cookie.endsWith('A') ? 'B' : 'A'))).toBe(false)
  })

  it('payload 변조(만료 시각 연장) → 서명 불일치로 false', () => {
    const [username, , nonce, sig] = makeSessionCookie().split('.')
    expect(verify(`${username}.${NOW + TTL * 100}.${nonce}.${sig}`)).toBe(false)
  })

  it('다른 secret 으로 서명된 쿠키 → false', () => {
    expect(verify(makeSessionCookie({ secret: OTHER_SECRET }))).toBe(false)
  })

  it('서명은 유효하지만 username 이 다르면 false', () => {
    expect(verify(makeSessionCookie({ username: 'alice' }))).toBe(false)
  })

  it('만료 경계: now == expiresAt 은 유효, now == expiresAt + 1 은 만료', () => {
    const expiresAt = NOW + TTL
    const cookie = makeSessionCookie({ expiresAt })
    expect(verify(cookie, expiresAt)).toBe(true)
    expect(verify(cookie, expiresAt + 1)).toBe(false)
  })

  it('서명은 유효하지만 expiresAt 이 숫자가 아니면 false', () => {
    expect(verify(makeSessionCookie({ expiresAt: 'notanumber' }))).toBe(false)
  })

  it('expiresAt 이 빈 문자열이면 Number("") === 0 으로 만료 처리되어 false', () => {
    expect(verify(makeSessionCookie({ expiresAt: '' }))).toBe(false)
  })

  it('username 에 "."이 들어가면 생성한 쿠키가 5파트가 되어 자기 자신도 검증 실패한다', () => {
    // env.ts 가 ADMIN_USERNAME 의 "." 포함을 차단하므로(refine) 실제 배포에선 도달 불가.
    // 함수 단독으로는 가드가 없다는 현재 동작을 고정해 둔다.
    const cookie = createSessionCookieValue({
      username: 'ad.min',
      secret: SECRET,
      ttlMs: TTL,
      now: NOW,
      nonce: 'n',
    })
    expect(cookie.split('.')).toHaveLength(5)
    expect(verifySessionCookieValue(cookie, { username: 'ad.min', secret: SECRET, now: NOW })).toBe(false)
  })
})

describe('createImpersonationToken / verifyImpersonationToken', () => {
  const USER_ID = 'cmbz1a2b3c4d5e6f7g8h9i0j1'
  const IMP_TTL = 60 * 1000

  const make = (overrides?: { userId?: string; now?: number; secret?: string }) =>
    createImpersonationToken({
      userId: overrides?.userId ?? USER_ID,
      secret: overrides?.secret ?? SECRET,
      ttlMs: IMP_TTL,
      now: overrides?.now ?? NOW,
      nonce: 'fixednonce',
    })

  it('골든: 포맷은 `argos_imp.${userId}.${expiresAt}.${nonce}.${sig}`', () => {
    const payload = `${ADMIN_IMPERSONATION_PREFIX}.${USER_ID}.${NOW + IMP_TTL}.fixednonce`
    expect(make()).toBe(`${payload}.${hmac(SECRET, payload)}`)
  })

  it('round-trip: 유효 토큰 → userId 반환', () => {
    expect(verifyImpersonationToken(make(), { secret: SECRET, now: NOW })).toBe(USER_ID)
  })

  it('만료 경계: now == expiresAt 은 유효, now == expiresAt + 1 은 null', () => {
    const expiresAt = NOW + IMP_TTL
    expect(verifyImpersonationToken(make(), { secret: SECRET, now: expiresAt })).toBe(USER_ID)
    expect(verifyImpersonationToken(make(), { secret: SECRET, now: expiresAt + 1 })).toBeNull()
  })

  it('다른 secret 으로 서명된 토큰 → null', () => {
    expect(verifyImpersonationToken(make({ secret: OTHER_SECRET }), { secret: SECRET, now: NOW })).toBeNull()
  })

  it('prefix 변조(재서명 포함) → null', () => {
    const expiresAt = NOW + IMP_TTL
    const payload = `argos_evil.${USER_ID}.${expiresAt}.fixednonce`
    const forged = `${payload}.${hmac(SECRET, payload)}`
    expect(verifyImpersonationToken(forged, { secret: SECRET, now: NOW })).toBeNull()
  })

  it('파트 수가 5가 아니면 null', () => {
    expect(verifyImpersonationToken('argos_imp.user.123.sig', { secret: SECRET, now: NOW })).toBeNull()
  })

  it('세션 쿠키(4파트)는 impersonation 토큰으로 검증되지 않고, 그 역도 성립한다', () => {
    const sessionCookie = makeSessionCookie()
    expect(verifyImpersonationToken(sessionCookie, { secret: SECRET, now: NOW })).toBeNull()
    expect(
      verifySessionCookieValue(make(), { username: USERNAME, secret: SECRET, now: NOW }),
    ).toBe(false)
  })

  // TODO(bug): userId 에 "."이 들어가면 토큰이 6파트가 되어 자기 자신도 검증에 실패한다.
  // ADMIN_USERNAME 과 달리 userId 쪽엔 어떤 레이어에도 "." 가드가 없다 — 현재는 User.id 가
  // cuid 라 사실상 안전하지만, id 체계가 바뀌면(예: email 기반) 조용히 깨진다.
  // (HEALTH.md 리스크 섹션에 기록)
  it('userId 에 "."이 들어가면 생성된 토큰이 6파트가 되어 검증이 null 을 반환한다', () => {
    const token = make({ userId: 'user.with.dots' })
    expect(token.split('.').length).toBeGreaterThan(5)
    expect(verifyImpersonationToken(token, { secret: SECRET, now: NOW })).toBeNull()
  })
})
