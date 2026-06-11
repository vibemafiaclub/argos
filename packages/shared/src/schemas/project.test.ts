/**
 * project.test.ts — 프로젝트 생성/이관 요청 스키마 회귀 가드
 *
 * TransferProjectSchema 의 trim → regex 순서가 특히 중요하다:
 * 공백이 섞인 slug 가 trim 후 통과해야 CLI/web 양쪽 호출자가 안전하다.
 */
import { describe, it, expect } from 'vitest'
import {
  CreateProjectSchema,
  UpdateProjectSchema,
  JoinOrgSchema,
  TransferProjectSchema,
} from './project.js'

describe('CreateProjectSchema', () => {
  it('이름 100자는 통과, 101자는 거부한다 (max 경계)', () => {
    expect(CreateProjectSchema.safeParse({ name: 'a'.repeat(100) }).success).toBe(true)
    expect(CreateProjectSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false)
  })

  it('빈 이름은 거부한다', () => {
    expect(CreateProjectSchema.safeParse({ name: '' }).success).toBe(false)
  })

  it('orgId 는 선택 필드다 (없으면 자동 org 생성 플로우)', () => {
    expect(CreateProjectSchema.safeParse({ name: 'p' }).success).toBe(true)
    expect(CreateProjectSchema.safeParse({ name: 'p', orgId: 'org-1' }).success).toBe(true)
  })
})

describe('UpdateProjectSchema / JoinOrgSchema', () => {
  it('UpdateProjectSchema 도 이름 1~100자 규칙을 따른다', () => {
    expect(UpdateProjectSchema.safeParse({ name: '새 이름' }).success).toBe(true)
    expect(UpdateProjectSchema.safeParse({ name: '' }).success).toBe(false)
  })

  it('JoinOrgSchema 는 orgId 가 없으면 거부한다', () => {
    expect(JoinOrgSchema.safeParse({}).success).toBe(false)
    expect(JoinOrgSchema.safeParse({ orgId: 'org-1' }).success).toBe(true)
  })
})

describe('TransferProjectSchema', () => {
  it('앞뒤 공백은 trim 되어 통과하고, 출력값도 trim 된 slug 다', () => {
    const result = TransferProjectSchema.safeParse({ targetOrgSlug: '  my-org  ' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.targetOrgSlug).toBe('my-org')
    }
  })

  it('공백만 있는 slug 는 trim 후 빈 문자열이 되어 거부된다', () => {
    expect(TransferProjectSchema.safeParse({ targetOrgSlug: '   ' }).success).toBe(false)
  })

  it('대문자·underscore 등 slug 규칙 위반은 거부한다', () => {
    expect(TransferProjectSchema.safeParse({ targetOrgSlug: 'My-Org' }).success).toBe(false)
    expect(TransferProjectSchema.safeParse({ targetOrgSlug: 'my_org' }).success).toBe(false)
  })

  it('소문자·숫자·하이픈 조합은 통과한다', () => {
    expect(TransferProjectSchema.safeParse({ targetOrgSlug: 'team-42' }).success).toBe(true)
  })
})
