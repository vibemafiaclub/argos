import { describe, it, expect } from 'vitest'
import { normalizeModelName, getModelPricing, MODEL_PRICING } from './pricing.js'

describe('normalizeModelName', () => {
  it('날짜 suffix 가 붙은 Claude 모델명을 정확한 키로 정규화한다 (golden path)', () => {
    expect(normalizeModelName('claude-opus-4-7-20251025')).toBe('claude-opus-4-7')
  })

  it('이미 정확히 매칭되는 키는 그대로 반환한다', () => {
    expect(normalizeModelName('claude-sonnet-4-6')).toBe('claude-sonnet-4-6')
  })

  it('대문자와 앞뒤 공백을 정규화한다', () => {
    expect(normalizeModelName('  Claude-Sonnet-4-6  ')).toBe('claude-sonnet-4-6')
  })

  it('마침표를 dash 로 바꿔 OpenAI 표기(gpt-5.5)를 매핑한다', () => {
    expect(normalizeModelName('gpt-5.5')).toBe('gpt-5-5')
  })

  it('언더스코어 표기도 dash 로 정규화한다', () => {
    expect(normalizeModelName('claude_opus_4_6')).toBe('claude-opus-4-6')
  })

  it('끝의 8자리 날짜만 제거한다 — dash 로 구분된 날짜(-2026-01-15)는 prefix fallback 으로 흡수', () => {
    // '-2026-01-15' 는 `-\d{8}` 패턴이 아니므로 strip 되지 않고 prefix 매칭으로 해소된다
    expect(normalizeModelName('gpt-5-4-mini-2026-01-15')).toBe('gpt-5-4-mini')
  })

  it('prefix fallback 은 더 긴 prefix 를 먼저 매칭한다 (gpt-5-4-mini ≠ gpt-5-4)', () => {
    expect(normalizeModelName('gpt-5-4-mini-preview')).toBe('gpt-5-4-mini')
    expect(normalizeModelName('gpt-5-4-preview')).toBe('gpt-5-4')
  })

  it('버전 세분화 prefix 우선순위: claude-sonnet-4-5-* 는 claude-sonnet-4 로 떨어지지 않는다', () => {
    expect(normalizeModelName('claude-sonnet-4-5-preview')).toBe('claude-sonnet-4-5')
  })

  it('구형 표기 claude-3-5-haiku-YYYYMMDD 를 claude-haiku-3-5 로 별칭 매핑한다', () => {
    expect(normalizeModelName('claude-3-5-haiku-20241022')).toBe('claude-haiku-3-5')
  })

  it('gpt-5.3-codex 는 별도 단가 키(gpt-5-3-codex)로 매핑된다', () => {
    expect(normalizeModelName('gpt-5.3-codex')).toBe('gpt-5-3-codex')
  })

  it('알 수 없는 모델명은 default 로 떨어진다', () => {
    expect(normalizeModelName('gemini-2.5-pro')).toBe('default')
  })

  it('null / undefined / 빈 문자열은 default 를 반환한다', () => {
    expect(normalizeModelName(null)).toBe('default')
    expect(normalizeModelName(undefined)).toBe('default')
    expect(normalizeModelName('')).toBe('default')
  })

  it('같은 입력으로 반복 호출해도 결과가 같다 (순수성)', () => {
    const input = 'claude-opus-4-7-20251025'
    const first = normalizeModelName(input)
    expect(normalizeModelName(input)).toBe(first)
    expect(normalizeModelName(input)).toBe(first)
  })
})

describe('getModelPricing', () => {
  it('정확 매칭 모델은 해당 단가를 반환한다 (opus-4-7 → input $5/M)', () => {
    expect(getModelPricing('claude-opus-4-7')).toEqual({
      inputPerM: 5.0,
      outputPerM: 25.0,
      cacheWritePerM: 6.25,
      cacheReadPerM: 0.5,
    })
  })

  it('날짜 suffix 가 붙어도 동일 단가를 적용한다', () => {
    expect(getModelPricing('claude-opus-4-7-20251025')).toEqual(
      getModelPricing('claude-opus-4-7'),
    )
  })

  it('레거시 Opus(4.1/4)는 신형보다 높은 레거시 단가를 쓴다 (input $15/M)', () => {
    expect(getModelPricing('claude-opus-4-1').inputPerM).toBe(15.0)
    expect(getModelPricing('claude-opus-4-20250514').inputPerM).toBe(15.0)
  })

  it('OpenAI 모델은 cacheWritePerM 이 항상 0 이다 (cache write 무과금)', () => {
    expect(getModelPricing('gpt-5.5').cacheWritePerM).toBe(0)
    expect(getModelPricing('gpt-5-4-mini').cacheWritePerM).toBe(0)
    expect(getModelPricing('gpt-5-codex').cacheWritePerM).toBe(0)
  })

  it('알 수 없는 모델은 Sonnet 단가(default)로 fallback 한다', () => {
    expect(getModelPricing('totally-unknown-model')).toEqual(MODEL_PRICING.default)
    expect(getModelPricing('totally-unknown-model').inputPerM).toBe(3.0)
  })

  it('모델명이 없으면(null/undefined) default 단가를 반환한다', () => {
    expect(getModelPricing(null)).toEqual(MODEL_PRICING.default)
    expect(getModelPricing(undefined)).toEqual(MODEL_PRICING.default)
  })
})
