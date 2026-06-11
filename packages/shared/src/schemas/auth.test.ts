/**
 * auth.test.ts — 인증 요청 스키마 계약 가드
 * /api/auth/{login,register,exchange} 의 입력 검증 경계를 고정한다.
 */
import { describe, it, expect } from 'vitest'
import { LoginRequestSchema, RegisterRequestSchema, ExchangeRequestSchema } from './auth.js'

describe('LoginRequestSchema', () => {
  it('유효한 email + 8자 이상 password → 성공', () => {
    expect(LoginRequestSchema.safeParse({ email: 'a@b.co', password: '12345678' }).success).toBe(true)
  })

  it('email 형식 위반 → 실패', () => {
    expect(LoginRequestSchema.safeParse({ email: 'not-an-email', password: '12345678' }).success).toBe(false)
  })

  it('password 7자 → 실패 (min 8 경계)', () => {
    expect(LoginRequestSchema.safeParse({ email: 'a@b.co', password: '1234567' }).success).toBe(false)
  })
})

describe('RegisterRequestSchema', () => {
  const valid = { email: 'a@b.co', password: '12345678', name: 'Sumin' }

  it('유효 입력 → 성공', () => {
    expect(RegisterRequestSchema.safeParse(valid).success).toBe(true)
  })

  it('name 빈 문자열 → 실패 (min 1)', () => {
    expect(RegisterRequestSchema.safeParse({ ...valid, name: '' }).success).toBe(false)
  })
})

describe('ExchangeRequestSchema', () => {
  it('onboardToken 빈 문자열 → 실패', () => {
    expect(ExchangeRequestSchema.safeParse({ onboardToken: '' }).success).toBe(false)
    expect(ExchangeRequestSchema.safeParse({ onboardToken: 'tok' }).success).toBe(true)
  })
})
