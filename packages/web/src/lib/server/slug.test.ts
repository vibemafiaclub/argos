import { describe, it, expect } from 'vitest'
import { generateSlug } from './slug'

// generateSlug 는 org/project 이름을 URL slug 로 변환한다. 결과 slug 는 그대로 URL 경로가
// 되므로 입력→출력 매핑이 곧 계약이다. 특히 "영숫자가 하나도 없으면 '' 반환" 분기는
// generateUniqueOrgSlug/ProjectSlug 의 `org-<random>` fallback 을 트리거하는 load-bearing
// 동작이다 — 이게 깨지면 한글-only/기호-only 이름에 깨진 slug 가 URL 로 새어나간다.
// (slug.ts 는 crypto/db 만 import 하므로 쿼리 없이 안전하게 import 된다.)

describe('generateSlug — 정상 변환', () => {
  it('소문자화 + 공백을 하이픈으로 바꾼다', () => {
    expect(generateSlug('My Org')).toBe('my-org')
  })

  it('연속 공백을 하나의 하이픈으로 접고 앞뒤 공백을 제거한다', () => {
    expect(generateSlug('  Hello   World  ')).toBe('hello-world')
  })

  it('영숫자/하이픈이 아닌 문자는 제거한다', () => {
    expect(generateSlug('Foo!!!Bar')).toBe('foobar')
    expect(generateSlug('Project 2024-Q1!')).toBe('project-2024-q1')
  })

  it('연속/앞뒤 하이픈을 정리한다', () => {
    expect(generateSlug('a---b')).toBe('a-b')
    expect(generateSlug('-leading-and-trailing-')).toBe('leading-and-trailing')
  })
})

describe('generateSlug — 영숫자 없음 → 빈 문자열 (fallback 트리거)', () => {
  it('한글만 입력하면 빈 문자열을 반환한다', () => {
    expect(generateSlug('한글')).toBe('')
  })

  it('기호만 입력하면 빈 문자열을 반환한다', () => {
    expect(generateSlug('###')).toBe('')
    expect(generateSlug('   ')).toBe('')
  })

  it('한글+ascii 혼합은 ascii 부분만 남긴다 (비-ascii 는 소거)', () => {
    expect(generateSlug('한글 abc')).toBe('abc')
  })
})
