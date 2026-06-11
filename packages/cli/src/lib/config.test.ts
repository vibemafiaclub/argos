/**
 * config.test.ts — normalizeApiUrl 가드
 *
 * normalizeApiUrl 은 ~/.argos/config.json 의 apiUrl override 를 유지할지
 * 버릴지 결정한다. 여기가 틀어지면 (1) 기본 서비스 URL 이 override 로
 * 박제되어 서비스 도메인 이전 시 CLI 가 죽거나, (2) 커스텀(self-hosted)
 * URL 이 무시되어 이벤트가 엉뚱한 곳으로 간다. 현재 동작을 고정한다.
 */
import { describe, it, expect } from 'vitest'
import { normalizeApiUrl, DEFAULT_API_URL } from './config.js'

describe('normalizeApiUrl — override 를 버리는 경우 (undefined 반환)', () => {
  it('빈 입력 (undefined/null/"")', () => {
    expect(normalizeApiUrl(undefined)).toBeUndefined()
    expect(normalizeApiUrl(null)).toBeUndefined()
    expect(normalizeApiUrl('')).toBeUndefined()
  })

  it('URL 파싱 불가 (스킴 없는 문자열 포함)', () => {
    expect(normalizeApiUrl('not a url')).toBeUndefined()
    expect(normalizeApiUrl('argos-ai.xyz')).toBeUndefined()
  })

  it('기본 서비스 도메인 (argos-ai.xyz 및 모든 서브도메인)', () => {
    expect(normalizeApiUrl('https://argos-ai.xyz')).toBeUndefined()
    expect(normalizeApiUrl('https://www.argos-ai.xyz')).toBeUndefined()
    expect(normalizeApiUrl('https://api.argos-ai.xyz/v2')).toBeUndefined()
    // URL 은 hostname 을 소문자로 정규화하므로 대문자 표기도 걸러진다
    expect(normalizeApiUrl('https://WWW.ARGOS-AI.XYZ')).toBeUndefined()
  })

  it('DEFAULT_API_URL 자기 자신도 override 로 취급하지 않는다', () => {
    expect(normalizeApiUrl(DEFAULT_API_URL)).toBeUndefined()
  })
})

describe('normalizeApiUrl — override 를 유지하는 경우 (원본 그대로 반환)', () => {
  it('localhost 개발 서버', () => {
    expect(normalizeApiUrl('http://localhost:3000')).toBe('http://localhost:3000')
  })

  it('self-hosted URL 은 path 포함 원본 그대로 보존한다', () => {
    expect(normalizeApiUrl('https://argos.internal.example.com/base')).toBe(
      'https://argos.internal.example.com/base',
    )
  })

  it('suffix 가 비슷해도 도메인 경계(.)가 다르면 별개 호스트로 취급한다', () => {
    // "evil-argos-ai.xyz" 는 ".argos-ai.xyz" 의 서브도메인이 아니므로 커스텀 호스트
    expect(normalizeApiUrl('https://evil-argos-ai.xyz')).toBe('https://evil-argos-ai.xyz')
  })
})
