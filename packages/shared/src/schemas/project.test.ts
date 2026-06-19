import { describe, it, expect } from 'vitest'
import { CreateProjectSchema, TransferProjectSchema } from './project.js'

describe('CreateProjectSchema', () => {
  it('이름 1~100자는 통과하고 orgId 는 생략 가능하다', () => {
    expect(CreateProjectSchema.safeParse({ name: 'my-project' }).success).toBe(true)
    expect(CreateProjectSchema.safeParse({ name: 'a'.repeat(100) }).success).toBe(true)
  })

  it('이름이 빈 문자열이거나 101자면 실패한다 (경계)', () => {
    expect(CreateProjectSchema.safeParse({ name: '' }).success).toBe(false)
    expect(CreateProjectSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false)
  })
})

describe('TransferProjectSchema', () => {
  it('소문자-숫자-하이픈 slug 는 통과한다', () => {
    expect(TransferProjectSchema.safeParse({ targetOrgSlug: 'my-org-2' }).success).toBe(true)
  })

  it('앞뒤 공백은 trim 된 뒤 검증된다', () => {
    const result = TransferProjectSchema.safeParse({ targetOrgSlug: '  my-org  ' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.targetOrgSlug).toBe('my-org')
    }
  })

  it('대문자가 포함된 slug 는 실패한다', () => {
    expect(TransferProjectSchema.safeParse({ targetOrgSlug: 'My-Org' }).success).toBe(false)
  })

  it('언더스코어 등 허용 외 문자는 실패한다', () => {
    expect(TransferProjectSchema.safeParse({ targetOrgSlug: 'my_org' }).success).toBe(false)
  })

  it('공백만 있는 입력은 trim 후 빈 문자열이 되어 실패한다', () => {
    expect(TransferProjectSchema.safeParse({ targetOrgSlug: '   ' }).success).toBe(false)
  })
})
