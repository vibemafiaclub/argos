/**
 * auth.test.ts — 로그인/가입/토큰 교환 입력 계약 가드
 */

import { describe, it, expect } from 'vitest'
import { LoginRequestSchema, RegisterRequestSchema, ExchangeRequestSchema } from './auth.js'

describe('LoginRequestSchema', () => {
  it('정상 이메일 + 8자 비밀번호는 통과한다', () => {
    expect(LoginRequestSchema.safeParse({ email: 'a@b.co', password: '12345678' }).success).toBe(true)
  })

  it('이메일 형식이 아니면 거부한다', () => {
    expect(LoginRequestSchema.safeParse({ email: 'not-an-email', password: '12345678' }).success).toBe(false)
  })

  it('비밀번호 7자는 거부한다 (min 8 경계)', () => {
    expect(LoginRequestSchema.safeParse({ email: 'a@b.co', password: '1234567' }).success).toBe(false)
  })
})

describe('RegisterRequestSchema', () => {
  it('빈 이름은 거부한다', () => {
    expect(
      RegisterRequestSchema.safeParse({ email: 'a@b.co', password: '12345678', name: '' }).success,
    ).toBe(false)
  })

  it('이름 1자부터 통과한다', () => {
    expect(
      RegisterRequestSchema.safeParse({ email: 'a@b.co', password: '12345678', name: '김' }).success,
    ).toBe(true)
  })
})

describe('ExchangeRequestSchema', () => {
  it('빈 onboardToken 은 거부한다', () => {
    expect(ExchangeRequestSchema.safeParse({ onboardToken: '' }).success).toBe(false)
  })
})
