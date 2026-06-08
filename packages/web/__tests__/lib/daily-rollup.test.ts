import { describe, expect, it } from 'vitest'
import {
  parseDailyUserStats,
  parseEventMetadata,
  serializeDailyUserStats,
} from '@/lib/server/parsers'

const VALID_USER_STATS = [
  {
    userId: 'user-1',
    name: 'Ada',
    avatarUrl: null,
    sessionCount: 3,
    inputTokens: 120,
    outputTokens: 45,
    estimatedCostUsd: 0.42,
    skillCalls: 2,
    agentCalls: 1,
  },
]

describe('daily rollup JSON parsers', () => {
  it('parses valid DailyUserStat JSON', () => {
    expect(parseDailyUserStats(VALID_USER_STATS)).toEqual(VALID_USER_STATS)
  })

  it('returns a safe fallback for malformed DailyUserStat JSON', () => {
    expect(parseDailyUserStats([{ userId: 'user-1', sessionCount: 1 }])).toEqual([])
    expect(parseDailyUserStats({ userId: 'user-1' })).toEqual([])
  })

  it('returns the default empty array for nullish DailyUserStat JSON', () => {
    expect(parseDailyUserStats(null)).toEqual([])
    expect(parseDailyUserStats(undefined)).toEqual([])
  })

  it('serializes DailyUserStat arrays only after schema validation', () => {
    expect(serializeDailyUserStats(VALID_USER_STATS)).toEqual(VALID_USER_STATS)
  })

  it('parses event metadata as JSON-safe Prisma input', () => {
    expect(
      parseEventMetadata({
        command: 'bash',
        nested: { ok: true, count: 2, values: ['a', null] },
      })
    ).toEqual({
      command: 'bash',
      nested: { ok: true, count: 2, values: ['a', null] },
    })
    expect(parseEventMetadata(undefined)).toBeUndefined()
    expect(parseEventMetadata({ bad: Number.POSITIVE_INFINITY })).toEqual({})
  })
})
