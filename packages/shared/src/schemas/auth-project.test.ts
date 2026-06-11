import { describe, expect, it } from 'vitest'
import { ExchangeRequestSchema, LoginRequestSchema, RegisterRequestSchema } from './auth.js'
import { CreateProjectSchema, TransferProjectSchema, UpdateProjectSchema } from './project.js'

describe('LoginRequestSchema / RegisterRequestSchema', () => {
  it('올바른 이메일 + 8자 이상 비밀번호를 요구한다', () => {
    expect(LoginRequestSchema.safeParse({ email: 'a@b.co', password: '12345678' }).success).toBe(true)
    expect(LoginRequestSchema.safeParse({ email: 'not-an-email', password: '12345678' }).success).toBe(false)
    expect(LoginRequestSchema.safeParse({ email: 'a@b.co', password: '1234567' }).success).toBe(false)
  })

  it('Register 는 name 1자 이상을 추가로 요구한다', () => {
    expect(RegisterRequestSchema.safeParse({ email: 'a@b.co', password: '12345678', name: 'A' }).success).toBe(true)
    expect(RegisterRequestSchema.safeParse({ email: 'a@b.co', password: '12345678', name: '' }).success).toBe(false)
    expect(RegisterRequestSchema.safeParse({ email: 'a@b.co', password: '12345678' }).success).toBe(false)
  })

  it('ExchangeRequest 는 비어있지 않은 onboardToken 을 요구한다', () => {
    expect(ExchangeRequestSchema.safeParse({ onboardToken: 't' }).success).toBe(true)
    expect(ExchangeRequestSchema.safeParse({ onboardToken: '' }).success).toBe(false)
  })
})

describe('CreateProjectSchema / UpdateProjectSchema', () => {
  it('name 은 1~100자만 허용한다', () => {
    expect(CreateProjectSchema.safeParse({ name: 'p' }).success).toBe(true)
    expect(CreateProjectSchema.safeParse({ name: 'p'.repeat(100) }).success).toBe(true)
    expect(CreateProjectSchema.safeParse({ name: '' }).success).toBe(false)
    expect(CreateProjectSchema.safeParse({ name: 'p'.repeat(101) }).success).toBe(false)
    expect(UpdateProjectSchema.safeParse({ name: '' }).success).toBe(false)
  })

  it('orgId 는 선택이다', () => {
    expect(CreateProjectSchema.safeParse({ name: 'p', orgId: 'org-1' }).success).toBe(true)
    expect(CreateProjectSchema.safeParse({ name: 'p' }).success).toBe(true)
  })
})

describe('TransferProjectSchema', () => {
  it('소문자 영숫자와 하이픈만 허용한다', () => {
    expect(TransferProjectSchema.safeParse({ targetOrgSlug: 'my-org-2' }).success).toBe(true)
    expect(TransferProjectSchema.safeParse({ targetOrgSlug: 'My-Org' }).success).toBe(false)
    expect(TransferProjectSchema.safeParse({ targetOrgSlug: 'org_1' }).success).toBe(false)
    expect(TransferProjectSchema.safeParse({ targetOrgSlug: '' }).success).toBe(false)
  })

  it('앞뒤 공백은 trim 후 검증한다', () => {
    const result = TransferProjectSchema.safeParse({ targetOrgSlug: '  my-org  ' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.targetOrgSlug).toBe('my-org')
    }
  })
})
