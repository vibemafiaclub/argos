import { describe, it, expect } from 'vitest'
import { LoginRequestSchema, RegisterRequestSchema, ExchangeRequestSchema } from './auth.js'

describe('LoginRequestSchema', () => {
  it('유효한 이메일과 8자 이상 비밀번호는 통과한다', () => {
    expect(
      LoginRequestSchema.safeParse({ email: 'a@b.com', password: '12345678' }).success,
    ).toBe(true)
  })

  it('이메일 형식이 아니면 실패한다', () => {
    expect(
      LoginRequestSchema.safeParse({ email: 'not-an-email', password: '12345678' }).success,
    ).toBe(false)
  })

  it('비밀번호가 7자면 실패한다 (min 8 경계)', () => {
    expect(
      LoginRequestSchema.safeParse({ email: 'a@b.com', password: '1234567' }).success,
    ).toBe(false)
  })
})

describe('RegisterRequestSchema', () => {
  it('이름이 빈 문자열이면 실패한다', () => {
    expect(
      RegisterRequestSchema.safeParse({ email: 'a@b.com', password: '12345678', name: '' }).success,
    ).toBe(false)
  })

  it('이름이 1자면 통과한다', () => {
    expect(
      RegisterRequestSchema.safeParse({ email: 'a@b.com', password: '12345678', name: 'k' }).success,
    ).toBe(true)
  })
})

describe('ExchangeRequestSchema', () => {
  it('onboardToken 이 빈 문자열이면 실패한다', () => {
    expect(ExchangeRequestSchema.safeParse({ onboardToken: '' }).success).toBe(false)
  })
})
