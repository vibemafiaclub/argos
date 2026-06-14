import { describe, it, expect } from 'vitest'
import { generateSlug } from './slug'

/**
 * generateSlug 는 사용자 입력 이름을 URL slug 로 정규화하는 순수 함수다.
 * 산출 slug 는 라우트 키(/[orgSlug], /[orgSlug]/[projectSlug])로 직접 노출되고,
 * **빈 문자열 반환 계약**이 generateUniqueOrgSlug/generateUniqueProjectSlug 의
 * `org-<random>` / `project-<random>` fallback 트리거다 — 이 계약이 깨지면
 * 한글/기호 전용 이름의 org·project 가 빈 slug 로 충돌하거나 fallback 을 잃는다.
 * 따라서 여기서 고정하는 것은 "현재 동작"이며, 깨지면 slug 정책이 바뀐 것이다.
 */
describe('generateSlug', () => {
  it('소문자화 + 공백을 단일 하이픈으로', () => {
    expect(generateSlug('My Org')).toBe('my-org')
    expect(generateSlug('MixedCASE')).toBe('mixedcase')
    expect(generateSlug('Team 123')).toBe('team-123')
  })

  it('연속 공백을 하나의 하이픈으로 축약', () => {
    expect(generateSlug('Hello   World')).toBe('hello-world')
  })

  it('앞뒤 공백은 끝의 하이픈으로 변환됐다가 트림된다', () => {
    expect(generateSlug('  Hello   World  ')).toBe('hello-world')
  })

  it('[a-z0-9-] 이외 문자는 제거 (점·언더스코어·악센트 포함)', () => {
    expect(generateSlug('Acme Inc.')).toBe('acme-inc')
    expect(generateSlug('v2.0')).toBe('v20')
    expect(generateSlug('a_b')).toBe('ab')
    expect(generateSlug('Café')).toBe('caf')
  })

  it('연속 하이픈을 하나로 축약', () => {
    expect(generateSlug('a---b')).toBe('a-b')
  })

  it('앞뒤 하이픈을 트림', () => {
    expect(generateSlug('-leading-and-trailing-')).toBe('leading-and-trailing')
  })

  it('이미 slug 형태면 그대로 통과', () => {
    expect(generateSlug('hello-world')).toBe('hello-world')
  })

  // 빈 문자열 반환 계약: fallback(org-<random>/project-<random>) 트리거의 단일 진실원
  it('영숫자가 하나도 없으면 빈 문자열 (fallback 트리거)', () => {
    expect(generateSlug('한글')).toBe('')
    expect(generateSlug('###')).toBe('')
    expect(generateSlug('   ')).toBe('')
    expect(generateSlug('')).toBe('')
  })

  it('영숫자가 하나라도 있으면 비어있지 않다 (fallback 안 함)', () => {
    expect(generateSlug('한글a')).toBe('a')
    expect(generateSlug('프로젝트1')).toBe('1')
  })
})
