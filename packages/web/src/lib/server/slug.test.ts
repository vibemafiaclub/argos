/**
 * slug.test.ts — generateSlug 회귀 가드 (pure, DB 불필요)
 *
 * generateSlug 는 org/project URL slug 를 만드는 순수 함수다. 두 가지가 load-bearing 이라
 * 무방비 상태로 두면 안 된다:
 *   1) 정규화 규칙(소문자·공백→하이픈·특수문자 제거·하이픈 collapse/trim) → URL 정확성
 *   2) "영숫자가 하나도 없으면 '' 반환" 계약 → generateUniqueOrgSlug/ProjectSlug 의
 *      `generateSlug(name) || 'org-<random>'` fallback 이 이 계약에 의존한다. '' 가 깨지면
 *      한글/기호만 입력했을 때 fallback 이 발동하지 않고 빈/깨진 slug 가 URL 에 들어간다.
 *
 * 이 테스트는 현재 동작을 고정한다. 깨지면 = slug 규칙 또는 fallback 계약이 바뀐 것 =
 * 모든 신규 org/project URL 에 영향. slugify 라이브러리로 교체 같은 "선의의 리팩토링"이
 * 조용히 바꾸기 쉬운 지점들(언더스코어 소멸, 악센트 문자 drop, 비-ASCII drop)을 포함한다.
 */
import { describe, it, expect } from 'vitest'
import { generateSlug } from './slug'

describe('generateSlug — 정규화 규칙', () => {
  it('소문자화 + 공백→하이픈', () => {
    expect(generateSlug('My Org')).toBe('my-org')
    expect(generateSlug('ABC')).toBe('abc')
  })

  it('연속 공백은 하이픈 하나로 collapse', () => {
    expect(generateSlug('a   b')).toBe('a-b')
  })

  it('특수문자(쉼표·느낌표 등)는 제거된다', () => {
    expect(generateSlug('Hello, World!')).toBe('hello-world')
  })

  it('앞뒤 공백/하이픈은 trim', () => {
    expect(generateSlug('  Trim Me  ')).toBe('trim-me')
    expect(generateSlug('-leading-and-trailing-')).toBe('leading-and-trailing')
  })

  it('하이픈과 공백이 섞여 생긴 연속 하이픈도 하나로 collapse', () => {
    expect(generateSlug('a -- b')).toBe('a-b')
  })

  it('숫자는 보존, 기존 하이픈 slug 는 그대로', () => {
    expect(generateSlug('Project 2026')).toBe('project-2026')
    expect(generateSlug('already-a-slug')).toBe('already-a-slug')
  })

  it('언더스코어는 하이픈이 아니라 "제거"된다 (a_b → ab)', () => {
    // 의도된 동작: [^a-z0-9-] 에 _ 가 포함되어 사라진다. 하이픈으로 바뀌지 않는다.
    expect(generateSlug('a_b')).toBe('ab')
  })

  it('악센트 라틴 문자는 transliterate 되지 않고 drop (café → caf)', () => {
    // 유니코드 정규화 없음을 명시적으로 고정. slugify 류 라이브러리는 caf-e/cafe 로 바꾼다.
    expect(generateSlug('café')).toBe('caf')
  })
})

describe('generateSlug — "" 반환 계약 (fallback load-bearing)', () => {
  it('비-ASCII(한글)만 있으면 빈 문자열', () => {
    expect(generateSlug('한글이름')).toBe('')
  })

  it('기호만 있으면 빈 문자열', () => {
    expect(generateSlug('###')).toBe('')
  })

  it('공백만 있으면 빈 문자열', () => {
    expect(generateSlug('   ')).toBe('')
  })

  it('ASCII 영숫자가 하나라도 섞이면 그 부분만 살아남는다 (My 회사 → my)', () => {
    expect(generateSlug('My 회사')).toBe('my')
  })
})
