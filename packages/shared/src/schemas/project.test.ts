/**
 * project.test.ts — 프로젝트 생성/이관 입력 계약 가드
 *
 * TransferProjectSchema 의 slug 정규식은 org 간 프로젝트 이관 API 의 유일한
 * 입력 검증선이다 (대문자/특수문자가 통과하면 slug 조회가 항상 miss).
 */

import { describe, it, expect } from 'vitest'
import { CreateProjectSchema, TransferProjectSchema } from './project.js'

describe('CreateProjectSchema', () => {
  it('이름 1~100자는 통과한다', () => {
    expect(CreateProjectSchema.safeParse({ name: 'a' }).success).toBe(true)
    expect(CreateProjectSchema.safeParse({ name: 'a'.repeat(100) }).success).toBe(true)
  })

  it('빈 이름과 101자 이름은 거부한다', () => {
    expect(CreateProjectSchema.safeParse({ name: '' }).success).toBe(false)
    expect(CreateProjectSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false)
  })

  it('orgId 는 생략 가능하다', () => {
    expect(CreateProjectSchema.safeParse({ name: 'p', orgId: 'org-1' }).success).toBe(true)
    expect(CreateProjectSchema.safeParse({ name: 'p' }).success).toBe(true)
  })
})

describe('TransferProjectSchema', () => {
  it('소문자/숫자/하이픈 slug 는 통과한다', () => {
    expect(TransferProjectSchema.safeParse({ targetOrgSlug: 'my-org-2' }).success).toBe(true)
  })

  it('앞뒤 공백은 trim 되어 통과한다', () => {
    const parsed = TransferProjectSchema.parse({ targetOrgSlug: '  my-org  ' })
    expect(parsed.targetOrgSlug).toBe('my-org')
  })

  it('대문자가 섞이면 거부한다', () => {
    expect(TransferProjectSchema.safeParse({ targetOrgSlug: 'My-Org' }).success).toBe(false)
  })

  it('언더스코어·공백 등 허용 외 문자는 거부한다', () => {
    expect(TransferProjectSchema.safeParse({ targetOrgSlug: 'my_org' }).success).toBe(false)
    expect(TransferProjectSchema.safeParse({ targetOrgSlug: 'my org' }).success).toBe(false)
  })

  it('공백만 있는 입력은 trim 후 빈 문자열이 되어 거부한다', () => {
    expect(TransferProjectSchema.safeParse({ targetOrgSlug: '   ' }).success).toBe(false)
  })
})
