/**
 * cost.test.ts — calculateCost / normalizeModelName 회귀 가드
 *
 * Issue #15 (2026-05-21): Argos 가 claude-opus-4-7 transcript 의 모델명
 * (`claude-opus-4-7-20251025` 같은 날짜 suffix) 를 매핑하지 못해 'default'
 * (Sonnet) 단가로 fallback 하던 버그를 가드한다.
 */

import { describe, it, expect } from 'vitest'
import { normalizeModelName, getModelPricing, MODEL_PRICING } from '@argos/shared'
import { calculateCost } from './cost'

describe('normalizeModelName', () => {
  it('null/undefined/empty → "default"', () => {
    expect(normalizeModelName(undefined)).toBe('default')
    expect(normalizeModelName(null)).toBe('default')
    expect(normalizeModelName('')).toBe('default')
  })

  it('정확 매칭', () => {
    expect(normalizeModelName('claude-opus-4-7')).toBe('claude-opus-4-7')
    expect(normalizeModelName('claude-sonnet-4-6')).toBe('claude-sonnet-4-6')
    expect(normalizeModelName('claude-haiku-4-5')).toBe('claude-haiku-4-5')
  })

  it('대소문자 / 공백 정규화', () => {
    expect(normalizeModelName('  Claude-Opus-4-7  ')).toBe('claude-opus-4-7')
    expect(normalizeModelName('CLAUDE-SONNET-4-6')).toBe('claude-sonnet-4-6')
  })

  it('날짜 suffix 제거 (YYYYMMDD)', () => {
    expect(normalizeModelName('claude-opus-4-7-20251025')).toBe('claude-opus-4-7')
    expect(normalizeModelName('claude-sonnet-4-6-20260201')).toBe('claude-sonnet-4-6')
    expect(normalizeModelName('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5')
  })

  it('. / _ → -', () => {
    expect(normalizeModelName('claude.opus.4.7')).toBe('claude-opus-4-7')
    expect(normalizeModelName('claude_opus_4_7')).toBe('claude-opus-4-7')
  })

  it('legacy haiku 별칭', () => {
    expect(normalizeModelName('claude-3-5-haiku-20241022')).toBe('claude-haiku-3-5')
  })

  it('알 수 없는 모델 → "default"', () => {
    expect(normalizeModelName('gpt-4')).toBe('default')
    expect(normalizeModelName('claude-sonnet-5')).toBe('default')
  })

  it('긴 prefix 가 짧은 prefix 보다 우선', () => {
    // `claude-opus-4-7` 가 `claude-opus-4` 보다 먼저 매칭돼야 한다.
    expect(normalizeModelName('claude-opus-4-7-future-variant')).toBe('claude-opus-4-7')
    expect(normalizeModelName('claude-opus-4-1-future-variant')).toBe('claude-opus-4-1')
  })
})

describe('getModelPricing', () => {
  it('opus-4-7 = $5 / $25 / $6.25 / $0.5', () => {
    const p = getModelPricing('claude-opus-4-7-20251025')
    expect(p.inputPerM).toBe(5)
    expect(p.outputPerM).toBe(25)
    expect(p.cacheWritePerM).toBe(6.25)
    expect(p.cacheReadPerM).toBe(0.5)
  })

  it('opus-4-1 (legacy) = $15 / $75', () => {
    const p = getModelPricing('claude-opus-4-1-20250805')
    expect(p.inputPerM).toBe(15)
    expect(p.outputPerM).toBe(75)
  })

  it('sonnet-4-6 = $3 / $15', () => {
    const p = getModelPricing('claude-sonnet-4-6')
    expect(p.inputPerM).toBe(3)
    expect(p.outputPerM).toBe(15)
  })

  it('haiku-4-5 = $1 / $5', () => {
    const p = getModelPricing('claude-haiku-4-5')
    expect(p.inputPerM).toBe(1)
    expect(p.outputPerM).toBe(5)
  })

  it('unknown → default (Sonnet 단가)', () => {
    const p = getModelPricing('unknown-model')
    expect(p).toEqual(MODEL_PRICING.default)
  })

  it('OpenAI(Codex) gpt-5.5 = $5 / $30, cached $0.5, cache write 0', () => {
    const p = getModelPricing('gpt-5.5')
    expect(p.inputPerM).toBe(5)
    expect(p.outputPerM).toBe(30)
    expect(p.cacheReadPerM).toBe(0.5)
    expect(p.cacheWritePerM).toBe(0)
  })

  it('OpenAI gpt-5.4 / mini / nano / 5.3-codex 매핑', () => {
    expect(getModelPricing('gpt-5.4').outputPerM).toBe(15)
    expect(getModelPricing('gpt-5.4-mini').inputPerM).toBe(0.75)
    expect(getModelPricing('gpt-5.4-nano').outputPerM).toBe(1.25)
    expect(getModelPricing('gpt-5.3-codex').inputPerM).toBe(1.75)
  })

  it('OpenAI codex 변형/스냅샷은 base prefix 로 흡수', () => {
    expect(normalizeModelName('gpt-5.5-codex')).toBe('gpt-5-5')
    expect(normalizeModelName('gpt-5-codex')).toBe('gpt-5-codex')
    expect(getModelPricing('gpt-5-codex').inputPerM).toBe(1.25)
    expect(normalizeModelName('gpt-5.5-2026-01-15')).toBe('gpt-5-5')
  })
})

describe('calculateCost', () => {
  it('Issue #15 시나리오: 9,300 input + 5,000,000 output @ opus-4-7 ≈ $125.05', () => {
    const cost = calculateCost({
      inputTokens: 9_300,
      outputTokens: 5_000_000,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      model: 'claude-opus-4-7-20251025',
    })
    expect(cost).toBeCloseTo(0.0465 + 125, 2)
  })

  it('cache 토큰이 단가에 정확히 반영된다 (opus-4-7)', () => {
    const cost = calculateCost({
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheCreationTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      model: 'claude-opus-4-7',
    })
    // input $5 + cache_write $6.25 + cache_read $0.5
    expect(cost).toBeCloseTo(5 + 6.25 + 0.5, 6)
  })

  it('model 미지정 → default(Sonnet) 단가', () => {
    const cost = calculateCost({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    })
    // sonnet input $3 + output $15
    expect(cost).toBeCloseTo(18, 6)
  })

  it('zero usage → 0', () => {
    expect(
      calculateCost({
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        model: 'claude-opus-4-7',
      }),
    ).toBe(0)
  })
})
