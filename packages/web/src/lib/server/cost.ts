import { getModelPricing, normalizeModelName } from '@argos/shared'
import type { UsagePayload } from '@argos/shared'

// in-process throttle: 같은 unknown 모델명에 대해 1회만 warning.
// 새 Claude 모델이 production 에 등장했는데 pricing.ts 에 단가가 누락된 경우
// 운영자가 빨리 알아채도록 함. 처음 한 번이라 로그 폭주는 없음.
const warnedUnknownModels = new Set<string>()

// UsagePayload 를 받아 USD 비용을 계산한다.
// 모델명은 normalizeModelName 을 거쳐 매핑되므로 `claude-opus-4-7-20251025` 같은
// 날짜 suffix 가 붙어도 정확한 단가를 적용한다.
export function calculateCost(usage: UsagePayload): number {
  const normalized = normalizeModelName(usage.model)
  if (normalized === 'default' && usage.model && !warnedUnknownModels.has(usage.model)) {
    warnedUnknownModels.add(usage.model)
    console.warn(
      `[cost] unknown model "${usage.model}" — falling back to default(Sonnet) pricing. Add it to packages/shared/src/constants/pricing.ts.`,
    )
  }

  const pricing = getModelPricing(usage.model)

  return (
    (usage.inputTokens / 1_000_000) * pricing.inputPerM +
    (usage.outputTokens / 1_000_000) * pricing.outputPerM +
    (usage.cacheCreationTokens / 1_000_000) * pricing.cacheWritePerM +
    (usage.cacheReadTokens / 1_000_000) * pricing.cacheReadPerM
  )
}
