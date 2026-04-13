import { MODEL_PRICING } from '@argos/shared'
import type { UsagePayload } from '@argos/shared'

// UsagePayload를 받아 USD 비용을 계산한다
// 모델명 매핑 실패 시 'default' 키 사용
export function calculateCost(usage: UsagePayload): number {
  const modelName = usage.model ?? 'default'
  const pricing = MODEL_PRICING[modelName] ?? MODEL_PRICING['default']

  const cost =
    (usage.inputTokens / 1_000_000) * pricing.inputPerM +
    (usage.outputTokens / 1_000_000) * pricing.outputPerM +
    (usage.cacheCreationTokens / 1_000_000) * pricing.cacheWritePerM +
    (usage.cacheReadTokens / 1_000_000) * pricing.cacheReadPerM

  return cost
}
