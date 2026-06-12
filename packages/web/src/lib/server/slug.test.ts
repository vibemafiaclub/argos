/**
 * slug.test.ts — generateSlug 정규식 체인 고정
 *
 * generateSlug 는 org/project 의 URL 식별자를 만드는 순수 함수다. 결과는
 * Organization.slug unique 제약과 라우팅(`/[orgSlug]/...`)에 직결되므로,
 * 정규식 한 글자가 바뀌어도 티 안 나게 깨지는 전형적인 로직이다.
 * generateUniqueOrgSlug / generateUniqueProjectSlug 는 DB 의존이라 여기서 다루지
 * 않는다 (테스트 전략: DB 통합 지점은 목으로 대체하지 않음).
 */
import { describe, expect, it } from 'vitest'

import { generateSlug } from './slug'

describe('generateSlug', () => {
  it('골든: 영문 이름 → 소문자 하이픈 slug', () => {
    expect(generateSlug('My Project')).toBe('my-project')
    expect(generateSlug('Argos')).toBe('argos')
  })

  it('대문자는 소문자로 변환된다', () => {
    expect(generateSlug('ARGOS AI')).toBe('argos-ai')
  })

  it('숫자는 유지된다', () => {
    expect(generateSlug('2026 Report')).toBe('2026-report')
  })

  it('연속 공백·탭·개행은 하이픈 1개로 합쳐진다', () => {
    expect(generateSlug('a  b')).toBe('a-b')
    expect(generateSlug('a\tb\nc')).toBe('a-b-c')
  })

  it('특수문자는 제거된다', () => {
    expect(generateSlug('Hello, World!')).toBe('hello-world')
    expect(generateSlug('a@b#c')).toBe('abc')
  })

  it('연속 하이픈은 1개로 합쳐진다', () => {
    expect(generateSlug('a---b')).toBe('a-b')
  })

  it('앞뒤 하이픈은 제거된다', () => {
    expect(generateSlug('-abc-')).toBe('abc')
    expect(generateSlug('  abc  ')).toBe('abc')
  })

  it('한글만 입력하면 빈 문자열을 반환한다 (호출자가 random fallback 처리)', () => {
    expect(generateSlug('아르고스')).toBe('')
  })

  it('한글+영문 혼합은 영문 부분만 남는다', () => {
    expect(generateSlug('아르고스 argos')).toBe('argos')
  })

  it('기호만 입력하면 빈 문자열을 반환한다', () => {
    expect(generateSlug('###')).toBe('')
    expect(generateSlug('---')).toBe('')
  })

  it('빈 문자열·공백만 입력 → 빈 문자열', () => {
    expect(generateSlug('')).toBe('')
    expect(generateSlug('   ')).toBe('')
  })

  it('이모지는 제거되고 남은 하이픈이 정리된다', () => {
    expect(generateSlug('app 🚀')).toBe('app')
  })

  it('멱등성: 이미 slug 인 입력은 그대로 유지된다', () => {
    expect(generateSlug('my-project')).toBe('my-project')
    expect(generateSlug(generateSlug('My Project'))).toBe(generateSlug('My Project'))
  })
})
