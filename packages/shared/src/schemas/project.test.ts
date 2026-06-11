/**
 * project.test.ts — 프로젝트/조직 요청 스키마 계약 가드
 * 특히 TransferProjectSchema 는 trim + slug 정규식이 겹쳐 있어 경계를 고정한다.
 */
import { describe, it, expect } from 'vitest'
import { CreateProjectSchema, UpdateProjectSchema, TransferProjectSchema } from './project.js'

describe('CreateProjectSchema / UpdateProjectSchema — name 길이 경계', () => {
  it('1~100자 허용, 0자/101자 거부', () => {
    expect(CreateProjectSchema.safeParse({ name: 'a' }).success).toBe(true)
    expect(CreateProjectSchema.safeParse({ name: 'a'.repeat(100) }).success).toBe(true)
    expect(CreateProjectSchema.safeParse({ name: '' }).success).toBe(false)
    expect(CreateProjectSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false)
    expect(UpdateProjectSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false)
  })

  it('orgId 는 optional 이다', () => {
    expect(CreateProjectSchema.safeParse({ name: 'p', orgId: 'org-1' }).success).toBe(true)
    expect(CreateProjectSchema.safeParse({ name: 'p' }).success).toBe(true)
  })
})

describe('TransferProjectSchema — targetOrgSlug', () => {
  it('소문자 영숫자와 하이픈만 허용한다', () => {
    expect(TransferProjectSchema.safeParse({ targetOrgSlug: 'my-org-2' }).success).toBe(true)
    expect(TransferProjectSchema.safeParse({ targetOrgSlug: 'My-Org' }).success).toBe(false)
    expect(TransferProjectSchema.safeParse({ targetOrgSlug: 'my_org' }).success).toBe(false)
    expect(TransferProjectSchema.safeParse({ targetOrgSlug: 'my org' }).success).toBe(false)
  })

  it('앞뒤 공백은 trim 후 검증·반환된다', () => {
    const result = TransferProjectSchema.safeParse({ targetOrgSlug: '  my-org  ' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.targetOrgSlug).toBe('my-org')
    }
  })

  it('공백만 있는 입력은 trim 후 빈 문자열 → 실패', () => {
    expect(TransferProjectSchema.safeParse({ targetOrgSlug: '   ' }).success).toBe(false)
  })
})
