import { describe, expect, it } from 'vitest'
import { generateSlug } from './slug'

// generateSlug 의 출력은 org/project URL 라우팅 키가 된다.
// 특히 "빈 문자열 반환" 계약은 generateUniqueOrgSlug/generateUniqueProjectSlug 가
// `generateSlug(name) || 'org-<random>'` 으로 폴백하는 근거이므로,
// 이 계약이 깨지면 한글 이름 org 가 깨진 slug 로 생성된다.

describe('generateSlug', () => {
  it('영문 이름은 소문자 + 하이픈 slug 로 변환된다', () => {
    expect(generateSlug('My Project')).toBe('my-project')
  })

  it('연속 공백·탭은 하이픈 하나로 합쳐진다', () => {
    expect(generateSlug('a \t  b')).toBe('a-b')
  })

  it('특수문자는 제거된다', () => {
    expect(generateSlug('Hello, World!')).toBe('hello-world')
  })

  it('대문자와 숫자 조합은 소문자로 유지된다', () => {
    expect(generateSlug('ABC123')).toBe('abc123')
  })

  it('한글만 있는 이름은 빈 문자열을 반환한다 (random suffix 폴백 계약)', () => {
    expect(generateSlug('아르고스')).toBe('')
  })

  it('기호만 있는 이름도 빈 문자열을 반환한다', () => {
    expect(generateSlug('###')).toBe('')
  })

  it('빈 문자열 입력은 빈 문자열을 반환한다', () => {
    expect(generateSlug('')).toBe('')
  })

  it('한글+영문 혼합은 영문/숫자 부분만 남는다', () => {
    expect(generateSlug('아르고스 Argos 2')).toBe('argos-2')
  })

  it('앞뒤 공백·하이픈 장식은 모두 정리된다', () => {
    expect(generateSlug('  --Foo--  ')).toBe('foo')
  })

  it('공백으로 감싼 하이픈은 하나로 합쳐진다', () => {
    expect(generateSlug('a - b')).toBe('a-b')
  })

  it('이모지는 제거되고 영문만 남는다', () => {
    expect(generateSlug('🚀 Launch')).toBe('launch')
  })

  it('이미 slug 형태인 입력은 그대로 반환된다 (멱등성)', () => {
    expect(generateSlug('my-project')).toBe('my-project')
  })
})
