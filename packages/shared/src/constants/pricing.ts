// Anthropic Claude API 공식 단가 (USD / 1M tokens)
// Source: https://platform.claude.com/docs/en/about-claude/pricing
//
// cacheWritePerM 은 5분 캐시 (base × 1.25) 기준. Claude Code 는 기본 5m TTL 을 사용한다.
// 1시간 캐시 (base × 2.0) 는 transcript 의 cache_creation_input_tokens 합계만으로는
// 구분할 수 없어 단일 단가로 근사한다.
//
// Sources for new and deprecated models:
// - Opus 4.7 / 4.6 / 4.5 : input $5, output $25, 5m cache write $6.25, cache read $0.50
// - Opus 4.1 / 4         : input $15, output $75, 5m cache write $18.75, cache read $1.50
// - Sonnet 4.6 / 4.5 / 4 : input $3, output $15, 5m cache write $3.75, cache read $0.30
// - Haiku 4.5            : input $1, output $5, 5m cache write $1.25, cache read $0.10
// - Haiku 3.5            : input $0.80, output $4, 5m cache write $1.00, cache read $0.08
export interface ModelPricing {
  inputPerM: number
  outputPerM: number
  cacheWritePerM: number
  cacheReadPerM: number
}

const OPUS_LATEST: ModelPricing = { inputPerM: 5.0, outputPerM: 25.0, cacheWritePerM: 6.25, cacheReadPerM: 0.5 }
const OPUS_LEGACY: ModelPricing = { inputPerM: 15.0, outputPerM: 75.0, cacheWritePerM: 18.75, cacheReadPerM: 1.5 }
const SONNET: ModelPricing = { inputPerM: 3.0, outputPerM: 15.0, cacheWritePerM: 3.75, cacheReadPerM: 0.3 }
const HAIKU_4_5: ModelPricing = { inputPerM: 1.0, outputPerM: 5.0, cacheWritePerM: 1.25, cacheReadPerM: 0.1 }
const HAIKU_3_5: ModelPricing = { inputPerM: 0.8, outputPerM: 4.0, cacheWritePerM: 1.0, cacheReadPerM: 0.08 }

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-7': OPUS_LATEST,
  'claude-opus-4-6': OPUS_LATEST,
  'claude-opus-4-5': OPUS_LATEST,
  'claude-opus-4-1': OPUS_LEGACY,
  'claude-opus-4': OPUS_LEGACY,
  'claude-sonnet-4-6': SONNET,
  'claude-sonnet-4-5': SONNET,
  'claude-sonnet-4': SONNET,
  'claude-haiku-4-5': HAIKU_4_5,
  'claude-haiku-3-5': HAIKU_3_5,
  // 매핑 실패 시 가장 흔한 production 모델인 Sonnet 단가를 fallback 으로 사용
  default: SONNET,
}

// 매핑 우선순위가 긴 prefix 부터 검사돼야 하므로 명시적으로 정렬된 리스트로 관리한다.
const PREFIX_FALLBACKS: ReadonlyArray<readonly [string, string]> = [
  ['claude-opus-4-7', 'claude-opus-4-7'],
  ['claude-opus-4-6', 'claude-opus-4-6'],
  ['claude-opus-4-5', 'claude-opus-4-5'],
  ['claude-opus-4-1', 'claude-opus-4-1'],
  ['claude-opus-4', 'claude-opus-4'],
  ['claude-sonnet-4-6', 'claude-sonnet-4-6'],
  ['claude-sonnet-4-5', 'claude-sonnet-4-5'],
  ['claude-sonnet-4', 'claude-sonnet-4'],
  ['claude-haiku-4-5', 'claude-haiku-4-5'],
  ['claude-haiku-3-5', 'claude-haiku-3-5'],
  ['claude-3-5-haiku', 'claude-haiku-3-5'],
]

// Claude transcript 의 model 필드는 보통 `claude-opus-4-7-20251025` 같은 날짜 suffix 가 붙는다.
// 정규화: 소문자화 → `.`/`_` 를 `-` 로 → 끝의 `-YYYYMMDD` 제거 → 정확 매칭 → prefix fallback.
export function normalizeModelName(modelName?: string | null): string {
  if (!modelName) return 'default'

  const normalized = modelName
    .trim()
    .toLowerCase()
    .replace(/[._]/g, '-')
    .replace(/-\d{8}$/, '')

  if (MODEL_PRICING[normalized]) return normalized

  for (const [prefix, target] of PREFIX_FALLBACKS) {
    if (normalized.startsWith(prefix)) return target
  }

  return 'default'
}

export function getModelPricing(modelName?: string | null): ModelPricing {
  return MODEL_PRICING[normalizeModelName(modelName)] ?? MODEL_PRICING.default
}
