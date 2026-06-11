/**
 * pricing.test.ts — normalizeModelName / getModelPricing 회귀 가드
 *
 * 모든 비용 계산(web cost.ts, 대시보드 KPI)이 이 정규화에 의존한다.
 * 매핑이 한 줄만 어긋나도 청구 추정치가 통째로 틀어지므로 현재 동작을 고정한다.
 */
import { describe, it, expect } from 'vitest'
import { normalizeModelName, getModelPricing, MODEL_PRICING } from './pricing.js'

describe('normalizeModelName — Claude 모델', () => {
  it('정확히 일치하는 키는 그대로 반환한다', () => {
    expect(normalizeModelName('claude-opus-4-7')).toBe('claude-opus-4-7')
    expect(normalizeModelName('claude-haiku-3-5')).toBe('claude-haiku-3-5')
  })

  it('끝의 -YYYYMMDD 스냅샷 suffix 를 제거한다', () => {
    expect(normalizeModelName('claude-sonnet-4-6-20260201')).toBe('claude-sonnet-4-6')
  })

  it('구형 표기 claude-3-5-haiku 는 prefix fallback 으로 claude-haiku-3-5 에 매핑된다', () => {
    expect(normalizeModelName('claude-3-5-haiku-20241022')).toBe('claude-haiku-3-5')
  })

  it('대문자·공백·dot/underscore 표기를 정규화한다', () => {
    expect(normalizeModelName('  Claude.Opus_4-7  ')).toBe('claude-opus-4-7')
  })
})

describe('normalizeModelName — OpenAI(Codex) 모델', () => {
  it('dot 버전 표기(gpt-5.5)를 dash 키(gpt-5-5)로 정규화한다', () => {
    expect(normalizeModelName('gpt-5.5')).toBe('gpt-5-5')
    expect(normalizeModelName('gpt-5.4-mini')).toBe('gpt-5-4-mini')
  })

  it('-YYYY-MM-DD 스냅샷 suffix 는 정규식으로 못 지우지만 prefix fallback 이 흡수한다', () => {
    // `-\d{8}$` 는 'gpt-5-4-mini-2026-01-15' 에 매치되지 않는다 — prefix 매칭이 안전망.
    expect(normalizeModelName('gpt-5.4-mini-2026-01-15')).toBe('gpt-5-4-mini')
  })

  it('mini/nano 가 base prefix(gpt-5-4)보다 먼저 매칭된다 (리스트 순서 보장)', () => {
    expect(normalizeModelName('gpt-5.4-nano-preview')).toBe('gpt-5-4-nano')
    expect(normalizeModelName('gpt-5.4-preview')).toBe('gpt-5-4')
  })

  it('별도 단가가 없는 gpt-5 변형은 gpt-5 base 로 흡수된다', () => {
    expect(normalizeModelName('gpt-5-turbo')).toBe('gpt-5')
  })

  it('경계 없는 prefix 매칭: gpt-5-40 같은 미래 모델명이 gpt-5-4 단가로 흡수된다', () => {
    // TODO(bug): prefix 매칭에 토큰 경계가 없어 'gpt-5-40'(가상의 신모델)이
    // 'gpt-5-4' 단가에 매핑된다. 신모델 출시 시 잘못된 단가로 조용히 계산될 수 있다.
    // 현재 동작을 고정하되, 경계( startsWith(prefix + '-') || === prefix ) 도입 검토 필요.
    expect(normalizeModelName('gpt-5-40')).toBe('gpt-5-4')
  })
})

describe('normalizeModelName — 미지/빈 입력', () => {
  it('null/undefined/빈 문자열은 default 로 떨어진다', () => {
    expect(normalizeModelName(undefined)).toBe('default')
    expect(normalizeModelName(null)).toBe('default')
    expect(normalizeModelName('')).toBe('default')
  })

  it('알 수 없는 모델명은 default 로 떨어진다', () => {
    expect(normalizeModelName('gemini-3-pro')).toBe('default')
  })

  it('같은 입력으로 반복 호출해도 결과가 같다 (정규식 상태 누수 없음)', () => {
    const first = normalizeModelName('claude-opus-4-7-20251025')
    const second = normalizeModelName('claude-opus-4-7-20251025')
    expect(second).toBe(first)
  })
})

describe('getModelPricing', () => {
  it('알려진 모델은 해당 단가 객체를 반환한다', () => {
    expect(getModelPricing('claude-haiku-4-5')).toEqual({
      inputPerM: 1.0,
      outputPerM: 5.0,
      cacheWritePerM: 1.25,
      cacheReadPerM: 0.1,
    })
  })

  it('미지 모델은 Sonnet 단가(default)로 fallback 한다', () => {
    expect(getModelPricing('totally-unknown')).toEqual(MODEL_PRICING.default)
    expect(MODEL_PRICING.default.inputPerM).toBe(3.0)
  })

  it('OpenAI 모델은 cache write 과금이 0 이다 (Codex 파서 계약)', () => {
    expect(getModelPricing('gpt-5.5').cacheWritePerM).toBe(0)
    expect(getModelPricing('gpt-5.3-codex').cacheWritePerM).toBe(0)
    expect(getModelPricing('gpt-5').cacheWritePerM).toBe(0)
  })
})
