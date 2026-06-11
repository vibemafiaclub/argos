/**
 * pricing.test.ts — normalizeModelName / getModelPricing invariant 가드
 *
 * packages/web/src/lib/server/cost.test.ts 가 골든 패스(정확 매칭·날짜 suffix·단가표)를
 * 이미 커버하므로, 여기서는 shared 자체 하네스로 그 외의 경계·invariant 를 고정한다:
 * Codex 스냅샷 날짜 형식, prefix 우선순위, 미래 모델의 silent fallback, 멱등성.
 */

import { describe, it, expect } from 'vitest'
import { normalizeModelName, getModelPricing, MODEL_PRICING } from './pricing.js'

describe('normalizeModelName — Codex 스냅샷/변형 흡수', () => {
  it('dash 구분 날짜(-2026-01-15)는 정규식으로 안 잘리지만 prefix fallback 이 흡수한다', () => {
    // `-\d{8}$` 는 YYYYMMDD 만 매칭하므로 -2026-01-15 형태는 남는다 → prefix 로 해결
    expect(normalizeModelName('gpt-5.3-codex-2026-01-15')).toBe('gpt-5-3-codex')
  })

  it('gpt-5-4-mini 스냅샷은 gpt-5-4 가 아니라 더 긴 gpt-5-4-mini prefix 로 매핑된다', () => {
    expect(normalizeModelName('gpt-5-4-mini-2026-02-02')).toBe('gpt-5-4-mini')
  })

  it('dot 표기(gpt-5.4)는 dash 로 정규화되어 정확 매칭된다', () => {
    expect(normalizeModelName('gpt-5.4')).toBe('gpt-5-4')
  })

  it('8자리가 아닌 숫자 suffix 는 정규식에 안 걸려도 prefix fallback 으로 흡수된다', () => {
    expect(normalizeModelName('claude-opus-4-7-123456789')).toBe('claude-opus-4-7')
  })
})

describe('normalizeModelName — 미지의 미래 모델 (현재 동작 고정)', () => {
  it('claude-opus-5 는 어떤 prefix 에도 안 걸려 default(Sonnet 단가) 로 떨어진다', () => {
    // TODO(bug): 차세대 모델(opus-5 등)이 출시되면 단가표 갱신 전까지 Sonnet 단가로
    // 조용히 과소/과대 계산된다. cost.ts 의 warn 은 인스턴스당 1회뿐이라 알아채기 어렵다.
    expect(normalizeModelName('claude-opus-5')).toBe('default')
  })

  it('gpt-5-6 같은 신규 마이너는 gpt-5 prefix 에 걸려 GPT-5 base 단가로 흡수된다', () => {
    // TODO(bug): 실제 단가가 다른 신규 gpt-5-x 모델도 gpt-5 base 로 silent 매핑된다.
    expect(normalizeModelName('gpt-5-6')).toBe('gpt-5')
  })

  it('전혀 모르는 벤더 모델명은 default 로 떨어진다', () => {
    expect(normalizeModelName('gemini-3-pro')).toBe('default')
  })
})

describe('normalizeModelName — 멱등성/순수성', () => {
  it('정규화 결과를 다시 정규화해도 같은 값이 나온다', () => {
    const samples = [
      'claude-opus-4-7-20251025',
      'gpt-5.3-codex-2026-01-15',
      'CLAUDE_SONNET_4_6',
      'unknown-model',
      '',
    ]
    for (const s of samples) {
      const once = normalizeModelName(s)
      expect(normalizeModelName(once)).toBe(once)
    }
  })

  it('같은 입력으로 반복 호출해도 결과가 같다 (내부 상태 누수 없음)', () => {
    expect(normalizeModelName('claude-opus-4-7-20251025')).toBe('claude-opus-4-7')
    expect(normalizeModelName('claude-opus-4-7-20251025')).toBe('claude-opus-4-7')
  })
})

describe('getModelPricing — 단가표 invariant', () => {
  it('어떤 입력이 와도 4개 단가 필드가 모두 유한한 0 이상 숫자다', () => {
    const inputs = ['claude-opus-4-7', 'gpt-5-5', 'totally-unknown', null, undefined, '한글모델']
    for (const input of inputs) {
      const p = getModelPricing(input)
      for (const v of [p.inputPerM, p.outputPerM, p.cacheWritePerM, p.cacheReadPerM]) {
        expect(Number.isFinite(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('normalizeModelName 의 모든 산출 키는 MODEL_PRICING 에 존재한다', () => {
    const inputs = [
      'claude-opus-4-7-20251025',
      'claude-3-5-haiku-20241022',
      'gpt-5-codex-2026-01-15',
      'nope',
    ]
    for (const input of inputs) {
      expect(MODEL_PRICING[normalizeModelName(input)]).toBeDefined()
    }
  })

  it('OpenAI 계열 단가는 cache write 과금이 0 이다', () => {
    for (const key of Object.keys(MODEL_PRICING).filter((k) => k.startsWith('gpt-'))) {
      expect(MODEL_PRICING[key].cacheWritePerM).toBe(0)
    }
  })
})
