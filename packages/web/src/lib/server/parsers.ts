import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import type { DailyUserStat } from './daily-rollup'

type JsonPrimitive = string | number | boolean | null
type JsonObject = { [key: string]: JsonValue }
type JsonValue = JsonPrimitive | JsonObject | JsonValue[]

export const DailyUserStatSchema = z.object({
  userId: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  sessionCount: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  estimatedCostUsd: z.number().finite().nonnegative(),
  skillCalls: z.number().int().nonnegative(),
  agentCalls: z.number().int().nonnegative(),
}) satisfies z.ZodType<DailyUserStat>

const DailyUserStatsSchema = z.array(DailyUserStatSchema)

export function parseDailyUserStats(data: unknown): DailyUserStat[] {
  if (data === null || data === undefined) return []

  const result = DailyUserStatsSchema.safeParse(data)
  if (!result.success) return []

  return result.data
}

export function serializeDailyUserStats(stats: DailyUserStat[]): Prisma.InputJsonValue {
  return DailyUserStatsSchema.parse(stats)
}

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ])
)

export const EventMetadataSchema: z.ZodType<JsonObject> = z.record(JsonValueSchema)

export function parseEventMetadata(data: unknown): Prisma.InputJsonValue | undefined {
  if (data === null || data === undefined) return undefined

  const result = EventMetadataSchema.safeParse(data)
  if (!result.success) return {}

  return result.data
}
