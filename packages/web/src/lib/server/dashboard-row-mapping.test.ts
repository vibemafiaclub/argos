import { describe, it, expect } from 'vitest'
import { mapSkillRow, DURATION_SAMPLE_THRESHOLD } from './dashboard-row-mapping'

const baseRow = {
  skill_name: 'test-skill',
  call_count: BigInt(10),
  session_count: BigInt(5),
  user_count: BigInt(3),
  last_used_at: new Date('2026-01-01T00:00:00Z'),
}

describe('mapSkillRow — medianDurationMs 임계값', () => {
  it(`duration_sample_count=0 → medianDurationMs === null`, () => {
    const row = { ...baseRow, median_duration_ms: null, duration_sample_count: BigInt(0) }
    expect(mapSkillRow(row).medianDurationMs).toBeNull()
  })

  it(`duration_sample_count=2 (임계값 ${DURATION_SAMPLE_THRESHOLD} 미달) → medianDurationMs === null`, () => {
    const row = { ...baseRow, median_duration_ms: 100, duration_sample_count: BigInt(2) }
    expect(mapSkillRow(row).medianDurationMs).toBeNull()
  })

  it(`duration_sample_count=3 (임계값 ${DURATION_SAMPLE_THRESHOLD} 이상) → medianDurationMs === 100`, () => {
    const row = { ...baseRow, median_duration_ms: 100, duration_sample_count: BigInt(3) }
    expect(mapSkillRow(row).medianDurationMs).toBe(100)
  })
})
