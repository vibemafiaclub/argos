import { describe, expect, it } from 'vitest'
import { MODEL_PRICING, getModelPricing, normalizeModelName } from './pricing.js'

describe('normalizeModelName', () => {
  it('빈 입력(null/undefined/빈 문자열)은 default 로 매핑된다', () => {
    expect(normalizeModelName(undefined)).toBe('default')
    expect(normalizeModelName(null)).toBe('default')
    expect(normalizeModelName('')).toBe('default')
  })

  it('날짜 suffix(-YYYYMMDD)를 제거하고 정확 매칭한다', () => {
    expect(normalizeModelName('claude-opus-4-7-20251025')).toBe('claude-opus-4-7')
    expect(normalizeModelName('claude-sonnet-4-6-20250901')).toBe('claude-sonnet-4-6')
    expect(normalizeModelName('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5')
  })

  it('대문자·공백·점·언더스코어를 정규화한다', () => {
    expect(normalizeModelName('  Claude-Opus-4-7  ')).toBe('claude-opus-4-7')
    expect(normalizeModelName('gpt-5.5')).toBe('gpt-5-5')
    expect(normalizeModelName('claude_sonnet_4_6')).toBe('claude-sonnet-4-6')
  })

  it('구형 네이밍 claude-3-5-haiku 는 claude-haiku-3-5 로 매핑된다', () => {
    expect(normalizeModelName('claude-3-5-haiku-20241022')).toBe('claude-haiku-3-5')
  })

  it('알 수 없는 suffix 는 가장 긴 prefix 로 흡수된다', () => {
    expect(normalizeModelName('claude-opus-4-7-extended-thinking')).toBe('claude-opus-4-7')
    expect(normalizeModelName('gpt-5.4-mini-2026-01-15')).toBe('gpt-5-4-mini')
    // gpt-5-5-codex 는 별도 단가가 없으므로 base prefix(gpt-5-5)로 흡수
    expect(normalizeModelName('gpt-5.5-codex')).toBe('gpt-5-5')
    // gpt-5.3-codex 만 별도 단가로 명시되어 있다
    expect(normalizeModelName('gpt-5.3-codex')).toBe('gpt-5-3-codex')
  })

  it('어떤 prefix 에도 매칭되지 않으면 default 로 떨어진다', () => {
    expect(normalizeModelName('gemini-2.0-flash')).toBe('default')
    expect(normalizeModelName('unknown-model')).toBe('default')
  })

  it('opus-4-1 / opus-4 (legacy) 는 4-5 이상과 다른 키로 매핑된다', () => {
    expect(normalizeModelName('claude-opus-4-1-20250805')).toBe('claude-opus-4-1')
    expect(normalizeModelName('claude-opus-4-20250514')).toBe('claude-opus-4')
  })

  // TODO(bug): `-YYYYMMDD` 패턴만 제거하므로 `gpt-5-3` 처럼 단독으로 등록되지 않은
  // 버전은 prefix 검사에서 더 짧은 'gpt-5'(base 단가)에 매칭된다. gpt-5.3 비-codex
  // 변형이 실제로 존재하면 단가가 과소 계산될 수 있다. 현재 동작을 고정한다.
  it('gpt-5.3 (비-codex) 은 gpt-5 base 단가로 흡수된다 (현재 동작)', () => {
    expect(normalizeModelName('gpt-5.3')).toBe('gpt-5')
  })
})

describe('getModelPricing', () => {
  it('매핑된 모델은 해당 단가를 반환한다', () => {
    expect(getModelPricing('claude-opus-4-7-20251025')).toEqual({
      inputPerM: 5.0,
      outputPerM: 25.0,
      cacheWritePerM: 6.25,
      cacheReadPerM: 0.5,
    })
    expect(getModelPricing('claude-haiku-3-5')).toEqual({
      inputPerM: 0.8,
      outputPerM: 4.0,
      cacheWritePerM: 1.0,
      cacheReadPerM: 0.08,
    })
  })

  it('알 수 없는 모델은 Sonnet 단가(default)로 fallback 한다', () => {
    expect(getModelPricing('totally-unknown')).toEqual(MODEL_PRICING.default)
    expect(getModelPricing(undefined)).toEqual(MODEL_PRICING.default)
    expect(MODEL_PRICING.default).toEqual({
      inputPerM: 3.0,
      outputPerM: 15.0,
      cacheWritePerM: 3.75,
      cacheReadPerM: 0.3,
    })
  })

  it('OpenAI 모델은 cacheWritePerM 이 항상 0 이다 (cache write 무과금)', () => {
    for (const key of Object.keys(MODEL_PRICING).filter((k) => k.startsWith('gpt-'))) {
      expect(MODEL_PRICING[key].cacheWritePerM).toBe(0)
    }
  })
})
