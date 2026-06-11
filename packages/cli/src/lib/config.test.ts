/**
 * config.test.ts — normalizeApiUrl 가드
 *
 * normalizeApiUrl 은 모든 텔레메트리의 목적지를 결정하는 게이트다:
 * 기본 서비스(*.argos-ai.xyz) URL 은 override 로 인정하지 않고 버리고,
 * self-hosted URL 만 통과시킨다. 여기가 틀어지면 이벤트가 엉뚱한 서버로
 * 가거나 (self-heal 경로) 기본 서버로 강제 회귀한다.
 */

import { describe, it, expect } from 'vitest'
import { normalizeApiUrl, DEFAULT_API_URL } from './config.js'

describe('normalizeApiUrl — 기본 서비스 URL 은 버린다', () => {
  it('argos-ai.xyz 정확 일치는 undefined', () => {
    expect(normalizeApiUrl('https://argos-ai.xyz')).toBeUndefined()
  })

  it('www / api 등 서브도메인도 undefined', () => {
    expect(normalizeApiUrl('https://www.argos-ai.xyz')).toBeUndefined()
    expect(normalizeApiUrl('https://api.argos-ai.xyz/v1')).toBeUndefined()
  })

  it('DEFAULT_API_URL 자기 자신도 undefined (저장된 기본값을 override 로 안 본다)', () => {
    expect(normalizeApiUrl(DEFAULT_API_URL)).toBeUndefined()
  })

  it('대문자 URL 도 hostname 소문자화로 걸러진다', () => {
    expect(normalizeApiUrl('HTTPS://ARGOS-AI.XYZ')).toBeUndefined()
  })
})

describe('normalizeApiUrl — self-hosted URL 은 원문 그대로 통과시킨다', () => {
  it('일반 커스텀 도메인은 그대로 반환한다', () => {
    expect(normalizeApiUrl('https://argos.acme.com')).toBe('https://argos.acme.com')
  })

  it('localhost 와 포트도 통과한다', () => {
    expect(normalizeApiUrl('http://localhost:3000')).toBe('http://localhost:3000')
  })

  it('path 가 붙어 있어도 원문을 보존한다', () => {
    expect(normalizeApiUrl('https://argos.acme.com/base/')).toBe('https://argos.acme.com/base/')
  })

  it('suffix 가 비슷해도 다른 도메인이면 통과한다 (evilargos-ai.xyz)', () => {
    expect(normalizeApiUrl('https://evilargos-ai.xyz')).toBe('https://evilargos-ai.xyz')
  })
})

describe('normalizeApiUrl — 비정상 입력', () => {
  it('빈 값/null/undefined 는 undefined', () => {
    expect(normalizeApiUrl('')).toBeUndefined()
    expect(normalizeApiUrl(null)).toBeUndefined()
    expect(normalizeApiUrl(undefined)).toBeUndefined()
  })

  it('URL 로 파싱 불가능한 문자열은 undefined', () => {
    expect(normalizeApiUrl('not a url')).toBeUndefined()
    expect(normalizeApiUrl('argos.acme.com')).toBeUndefined()
  })
})
