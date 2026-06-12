import { describe, it, expect } from 'vitest'
import { normalizeApiUrl, DEFAULT_API_URL } from './config.js'

describe('normalizeApiUrl', () => {
  it('빈 값(undefined/null/"")은 undefined 를 반환한다', () => {
    expect(normalizeApiUrl(undefined)).toBeUndefined()
    expect(normalizeApiUrl(null)).toBeUndefined()
    expect(normalizeApiUrl('')).toBeUndefined()
  })

  it('커스텀 호스트 URL 은 입력 문자열 그대로 반환한다 (정규화 없음)', () => {
    expect(normalizeApiUrl('http://localhost:3000')).toBe('http://localhost:3000')
    expect(normalizeApiUrl('https://my-argos.example.com/base/')).toBe(
      'https://my-argos.example.com/base/',
    )
  })

  it('기본 서비스 호스트(argos-ai.xyz)는 override 로 취급하지 않고 undefined 를 반환한다', () => {
    expect(normalizeApiUrl('https://argos-ai.xyz')).toBeUndefined()
    expect(normalizeApiUrl(DEFAULT_API_URL)).toBeUndefined() // https://www.argos-ai.xyz
  })

  it('argos-ai.xyz 의 모든 서브도메인을 기본 서비스로 취급한다', () => {
    expect(normalizeApiUrl('https://api.argos-ai.xyz/v2')).toBeUndefined()
    expect(normalizeApiUrl('https://staging.api.argos-ai.xyz')).toBeUndefined()
  })

  it('유사 도메인(evil-argos-ai.xyz)은 서브도메인이 아니므로 커스텀 URL 로 통과시킨다', () => {
    expect(normalizeApiUrl('https://evil-argos-ai.xyz')).toBe('https://evil-argos-ai.xyz')
  })

  it('URL 로 파싱할 수 없는 문자열은 undefined 를 반환한다', () => {
    expect(normalizeApiUrl('not a url')).toBeUndefined()
    expect(normalizeApiUrl('//missing-scheme.com')).toBeUndefined()
  })

  it('같은 입력으로 반복 호출해도 결과가 같다 (순수성)', () => {
    const input = 'https://self-hosted.corp.internal'
    expect(normalizeApiUrl(input)).toBe(normalizeApiUrl(input))
  })
})
