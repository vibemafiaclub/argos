/**
 * jwt.test.ts — CLI 토큰 서명/검증 가드
 *
 * verifyJwt 는 모든 CLI API 요청 인증의 1차 관문이다 (auth-helper.requireAuth).
 * 만료·변조·서명키 불일치·sub 누락이 전부 null 로 떨어지는지 고정한다.
 */
import { describe, it, expect, vi } from 'vitest'
import { SignJWT } from 'jose'

const TEST_ENV = vi.hoisted(() => ({
  JWT_SECRET: 'test-jwt-secret-with-at-least-32-chars!!',
}))

vi.mock('./env', () => ({ env: TEST_ENV }))

import { signJwt, verifyJwt } from './jwt'

const secretKey = new TextEncoder().encode(TEST_ENV.JWT_SECRET)
const otherKey = new TextEncoder().encode('another-secret-also-32-characters-long!')

function b64url(s: string): string {
  return Buffer.from(s).toString('base64url')
}

describe('signJwt → verifyJwt 라운드트립', () => {
  it('서명한 토큰은 { sub: userId } 로 검증된다', async () => {
    const token = await signJwt('user-123')
    expect(await verifyJwt(token)).toEqual({ sub: 'user-123' })
  })

  it('토큰은 header.payload.signature 3분절 JWT 형식이다', async () => {
    const token = await signJwt('user-123')
    expect(token.split('.')).toHaveLength(3)
  })
})

describe('verifyJwt — 거부 케이스 (모두 null)', () => {
  it('서명부가 변조된 토큰', async () => {
    const token = await signJwt('user-123')
    expect(await verifyJwt(token + 'x')).toBeNull()
  })

  it('다른 시크릿으로 서명된 토큰', async () => {
    const forged = await new SignJWT({ sub: 'user-123' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(otherKey)
    expect(await verifyJwt(forged)).toBeNull()
  })

  it('만료된 토큰', async () => {
    const expired = await new SignJWT({ sub: 'user-123' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(secretKey)
    expect(await verifyJwt(expired)).toBeNull()
  })

  it('sub 클레임이 없는 토큰 (서명은 유효)', async () => {
    const noSub = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(secretKey)
    expect(await verifyJwt(noSub)).toBeNull()
  })

  it('alg:none unsecured 토큰', async () => {
    const unsecured = `${b64url('{"alg":"none"}')}.${b64url('{"sub":"user-123"}')}.`
    expect(await verifyJwt(unsecured)).toBeNull()
  })

  it('JWT 형식이 아닌 문자열', async () => {
    expect(await verifyJwt('not-a-jwt')).toBeNull()
    expect(await verifyJwt('')).toBeNull()
  })
})
