import { describe, it, expect } from 'vitest'
import { generateSlug } from './slug'

// generateSlug 는 org/project 의 URL-facing slug 를 만드는 순수 함수다.
// 정규화 순서(소문자 → 공백→하이픈 → 비허용문자 제거 → 하이픈 압축 → 양끝 트림)나
// "영숫자 없으면 빈 문자열" 가드가 깨지면 URL 이 깨지거나 충돌하므로 현재 동작을 고정한다.

describe('generateSlug — 기본 정규화', () => {
  it('공백을 하이픈으로 바꾸고 소문자화한다', () => {
    expect(generateSlug('My Project')).toBe('my-project')
  })

  it('연속 공백을 단일 하이픈으로 압축한다', () => {
    expect(generateSlug('a   b')).toBe('a-b')
  })

  it('양끝 공백/하이픈을 트림한다', () => {
    expect(generateSlug('  spaced  ')).toBe('spaced')
  })

  it('연속 하이픈을 단일 하이픈으로 압축한다', () => {
    expect(generateSlug('a---b')).toBe('a-b')
  })

  it('숫자를 보존한다', () => {
    expect(generateSlug('Project 2')).toBe('project-2')
    expect(generateSlug('123')).toBe('123')
  })

  it('이미 slug 형태면 그대로 둔다', () => {
    expect(generateSlug('already-slug')).toBe('already-slug')
  })
})

describe('generateSlug — 비허용 문자 처리', () => {
  it('구두점은 제거된다 (공백만 하이픈이 됨)', () => {
    expect(generateSlug('Hello, World!')).toBe('hello-world')
  })

  it('언더스코어는 하이픈이 아니라 제거된다', () => {
    // _ 는 [a-z0-9-] 에 없으므로 하이픈으로 치환되지 않고 그냥 사라진다
    expect(generateSlug('foo_bar')).toBe('foobar')
  })

  it('비ASCII(한글)는 제거되고 ASCII 부분만 남는다', () => {
    expect(generateSlug('한글 abc')).toBe('abc')
  })
})

describe('generateSlug — 영숫자가 하나도 없으면 빈 문자열', () => {
  it('한글만 입력', () => {
    expect(generateSlug('한글')).toBe('')
  })

  it('기호만 입력', () => {
    expect(generateSlug('###')).toBe('')
    expect(generateSlug('!!!')).toBe('')
  })

  it('빈 문자열 입력', () => {
    expect(generateSlug('')).toBe('')
  })
})
