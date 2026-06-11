/**
 * config.test.ts — normalizeApiUrl 회귀 가드
 *
 * normalizeApiUrl 은 "이 URL 이 기본 Argos 서비스인가, 셀프호스트 override 인가"를
 * 판정하는 신뢰 경계다. 판정이 틀리면 이벤트·토큰이 의도하지 않은 호스트로 간다.
 * readConfig / 프로젝트 설정 로드 양쪽이 이 함수를 거친다.
 */
import { describe, it, expect } from 'vitest'
import { normalizeApiUrl, DEFAULT_API_URL } from './config.js'

describe('normalizeApiUrl — 기본 서비스 판정 (undefined 반환)', () => {
  it('빈 값(undefined/null/빈 문자열)은 undefined 를 반환한다', () => {
    expect(normalizeApiUrl(undefined)).toBeUndefined()
    expect(normalizeApiUrl(null)).toBeUndefined()
    expect(normalizeApiUrl('')).toBeUndefined()
  })

  it('apex 도메인 argos-ai.xyz 는 기본 서비스로 보고 undefined 를 반환한다', () => {
    expect(normalizeApiUrl('https://argos-ai.xyz')).toBeUndefined()
  })

  it('www 등 서브도메인도 기본 서비스로 흡수한다', () => {
    expect(normalizeApiUrl(DEFAULT_API_URL)).toBeUndefined()
    expect(normalizeApiUrl('https://api.argos-ai.xyz')).toBeUndefined()
  })

  it('포트·스킴이 달라도 호스트만 보고 판정한다', () => {
    expect(normalizeApiUrl('https://argos-ai.xyz:9000')).toBeUndefined()
    expect(normalizeApiUrl('http://www.argos-ai.xyz/path?q=1')).toBeUndefined()
  })
})

describe('normalizeApiUrl — 커스텀 override 보존', () => {
  it('셀프호스트 URL 은 그대로 반환한다 (path/포트 포함 원본 보존)', () => {
    expect(normalizeApiUrl('https://argos.my-corp.com')).toBe('https://argos.my-corp.com')
    expect(normalizeApiUrl('http://localhost:3000')).toBe('http://localhost:3000')
  })

  it('argos-ai.xyz 가 다른 도메인의 서브도메인인 경우는 기본 서비스가 아니다 (suffix 위장 방지)', () => {
    expect(normalizeApiUrl('https://argos-ai.xyz.attacker.com')).toBe(
      'https://argos-ai.xyz.attacker.com'
    )
  })

  it('argos-ai.xyz 로 끝나지만 dot 경계가 없는 호스트는 기본 서비스가 아니다', () => {
    expect(normalizeApiUrl('https://evilargos-ai.xyz')).toBe('https://evilargos-ai.xyz')
  })
})

describe('normalizeApiUrl — 깨진 입력', () => {
  it('URL 파싱이 불가능한 문자열은 throw 없이 undefined 를 반환한다', () => {
    expect(normalizeApiUrl('not a url')).toBeUndefined()
    expect(normalizeApiUrl('http://')).toBeUndefined()
  })

  it('스킴 없는 host:port 는 scheme 으로 오파싱되어 커스텀 URL 로 보존된다', () => {
    // TODO(bug): 'localhost:3000' 은 URL 파서가 scheme 'localhost:' 로 해석해
    // hostname '' 이 되고, 기본 서비스 판정을 통과해 "커스텀 URL" 로 그대로 보존된다.
    // 이후 fetch('localhost:3000/api/...') 는 런타임에서 실패한다.
    // 잘못 입력된 설정이 조용히 저장되는 현재 동작을 고정한다.
    expect(normalizeApiUrl('localhost:3000')).toBe('localhost:3000')
  })
})
