/**
 * auth.test.ts — 로그인/가입/토큰 교환 요청 스키마 회귀 가드
 *
 * web 의 /api/auth/* 라우트가 그대로 사용하는 입력 검증 계약.
 */
import { describe, it, expect } from 'vitest'
import { LoginRequestSchema, RegisterRequestSchema, ExchangeRequestSchema } from './auth.js'

describe('LoginRequestSchema', () => {
  it('정상 이메일 + 8자 비밀번호는 통과한다', () => {
    expect(
      LoginRequestSchema.safeParse({ email: 'a@b.co', password: '12345678' }).success
    ).toBe(true)
  })

  it('이메일 형식이 아니면 거부한다', () => {
    expect(
      LoginRequestSchema.safeParse({ email: 'not-an-email', password: '12345678' }).success
    ).toBe(false)
  })

  it('비밀번호 7자는 거부한다 (최소 8자 경계)', () => {
    expect(
      LoginRequestSchema.safeParse({ email: 'a@b.co', password: '1234567' }).success
    ).toBe(false)
  })
})

describe('RegisterRequestSchema', () => {
  it('이름이 빈 문자열이면 거부한다', () => {
    expect(
      RegisterRequestSchema.safeParse({ email: 'a@b.co', password: '12345678', name: '' })
        .success
    ).toBe(false)
  })

  it('이메일·비밀번호·이름이 모두 유효하면 통과한다', () => {
    expect(
      RegisterRequestSchema.safeParse({ email: 'a@b.co', password: '12345678', name: '김아르' })
        .success
    ).toBe(true)
  })
})

describe('ExchangeRequestSchema', () => {
  it('빈 onboardToken 은 거부한다', () => {
    expect(ExchangeRequestSchema.safeParse({ onboardToken: '' }).success).toBe(false)
  })

  it('1자 이상이면 형식 검사 없이 통과한다 (토큰 형식 검증은 서버 로직 책임)', () => {
    expect(ExchangeRequestSchema.safeParse({ onboardToken: 'argos_onb_x' }).success).toBe(true)
  })
})
