/**
 * pricing.test.ts — 모델명 정규화·단가 테이블 계약 가드
 *
 * web 의 cost.test.ts 가 calculateCost 경유로 일부를 덮지만, shared 는
 * standalone 으로 `pnpm --filter @argos/shared test` 가 의미를 가져야 하므로
 * 여기서는 정규화 규칙 자체와 단가 테이블의 불변식(invariant)을 고정한다.
 */
import { describe, it, expect } from 'vitest'
import { MODEL_PRICING, normalizeModelName, getModelPricing } from './pricing.js'

describe('normalizeModelName — 정규화 규칙', () => {
  it('빈 입력(null/undefined/"") → "default"', () => {
    expect(normalizeModelName(null)).toBe('default')
    expect(normalizeModelName(undefined)).toBe('default')
    expect(normalizeModelName('')).toBe('default')
  })

  it('소문자화 + trim + `.`/`_` → `-`', () => {
    expect(normalizeModelName('  Claude-Sonnet-4-6 ')).toBe('claude-sonnet-4-6')
    expect(normalizeModelName('gpt-5.4')).toBe('gpt-5-4')
    expect(normalizeModelName('claude_haiku_4_5')).toBe('claude-haiku-4-5')
  })

  it('끝의 8자리 날짜 suffix 만 제거한다', () => {
    expect(normalizeModelName('claude-opus-4-7-20251025')).toBe('claude-opus-4-7')
    // 8자리가 아닌 숫자 suffix 는 날짜로 보지 않는다 — prefix fallback 으로 흡수
    expect(normalizeModelName('claude-opus-4-7-2025')).toBe('claude-opus-4-7')
    // dash 로 구분된 날짜(YYYY-MM-DD)는 끝 2자리만으로는 매칭 안 됨 — prefix fallback
    expect(normalizeModelName('gpt-5.5-2026-01-15')).toBe('gpt-5-5')
  })

  it('긴/구체적인 prefix 가 짧은 prefix 보다 우선한다', () => {
    expect(normalizeModelName('gpt-5-4-mini-snapshot')).toBe('gpt-5-4-mini')
    expect(normalizeModelName('gpt-5-4-snapshot')).toBe('gpt-5-4')
    expect(normalizeModelName('gpt-5-3-codex-20260101')).toBe('gpt-5-3-codex')
    expect(normalizeModelName('claude-opus-4-7-variant')).toBe('claude-opus-4-7')
    expect(normalizeModelName('claude-opus-4-variant')).toBe('claude-opus-4')
  })

  it('legacy 별칭: claude-3-5-haiku → claude-haiku-3-5', () => {
    expect(normalizeModelName('claude-3-5-haiku-20241022')).toBe('claude-haiku-3-5')
  })

  it('미지의 모델명 → "default"', () => {
    expect(normalizeModelName('gemini-3-pro')).toBe('default')
    expect(normalizeModelName('gpt-4o')).toBe('default')
    expect(normalizeModelName('claude-sonnet-5')).toBe('default')
  })
})

describe('MODEL_PRICING — 단가 테이블 불변식', () => {
  it('모든 엔트리는 4개 단가 필드가 음수가 아닌 유한수다', () => {
    for (const [key, p] of Object.entries(MODEL_PRICING)) {
      for (const field of ['inputPerM', 'outputPerM', 'cacheWritePerM', 'cacheReadPerM'] as const) {
        expect(Number.isFinite(p[field]), `${key}.${field}`).toBe(true)
        expect(p[field], `${key}.${field}`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('OpenAI(gpt-*) 모델은 cache write 과금이 없다 (cacheWritePerM === 0)', () => {
    const gptKeys = Object.keys(MODEL_PRICING).filter((k) => k.startsWith('gpt-'))
    expect(gptKeys.length).toBeGreaterThan(0)
    for (const key of gptKeys) {
      expect(MODEL_PRICING[key].cacheWritePerM, key).toBe(0)
    }
  })

  it('default fallback 은 Sonnet 단가다 ($3/$15/$3.75/$0.3)', () => {
    expect(MODEL_PRICING.default).toEqual({
      inputPerM: 3.0,
      outputPerM: 15.0,
      cacheWritePerM: 3.75,
      cacheReadPerM: 0.3,
    })
  })
})

describe('getModelPricing', () => {
  it('정규화를 거쳐 단가를 찾는다', () => {
    expect(getModelPricing('Claude-Opus-4-7-20251025')).toBe(MODEL_PRICING['claude-opus-4-7'])
    expect(getModelPricing('gpt-5.4-mini')).toBe(MODEL_PRICING['gpt-5-4-mini'])
  })

  it('매핑 실패·빈 입력 → default 단가', () => {
    expect(getModelPricing('totally-unknown')).toBe(MODEL_PRICING.default)
    expect(getModelPricing(undefined)).toBe(MODEL_PRICING.default)
    expect(getModelPricing(null)).toBe(MODEL_PRICING.default)
  })
})
