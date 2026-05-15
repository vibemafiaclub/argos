import { describe, it, expect } from 'vitest'
import { mapSkillRow, DURATION_SAMPLE_THRESHOLD } from './dashboard-row-mapping'

const baseRow = {
  skill_name: 'test-skill',
  call_count: BigInt(10),
  session_count: BigInt(5),
  user_count: BigInt(3),
  last_used_at: new Date('2026-01-01T00:00:00Z'),
  projects_json: '[]' as unknown,
  total_project_count: BigInt(0),
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

const makeProjectEntry = (i: number) => ({
  projectId: `proj-${i}`,
  projectName: `Project ${i}`,
  invocations: 10 - i,
  lastUsedAt: `2026-0${i + 1}-01T00:00:00.000Z`,
})

describe('mapSkillRow — projects / additionalProjectCount', () => {
  it('projects_json=null → projects: [], additionalProjectCount: 0', () => {
    const row = { ...baseRow, median_duration_ms: null, duration_sample_count: null, projects_json: null, total_project_count: BigInt(0) }
    const result = mapSkillRow(row)
    expect(result.projects).toEqual([])
    expect(result.additionalProjectCount).toBe(0)
  })

  it('projects_json=[3개 entry], total_project_count=3 → projects.length===3, additionalProjectCount===0', () => {
    const entries = [makeProjectEntry(0), makeProjectEntry(1), makeProjectEntry(2)]
    const row = { ...baseRow, median_duration_ms: null, duration_sample_count: null, projects_json: entries, total_project_count: BigInt(3) }
    const result = mapSkillRow(row)
    expect(result.projects).toHaveLength(3)
    expect(result.additionalProjectCount).toBe(0)
  })

  it('projects_json=[5개 entry], total_project_count=12 → additionalProjectCount===7', () => {
    const entries = [0, 1, 2, 3, 4].map(makeProjectEntry)
    const row = { ...baseRow, median_duration_ms: null, duration_sample_count: null, projects_json: entries, total_project_count: BigInt(12) }
    const result = mapSkillRow(row)
    expect(result.projects).toHaveLength(5)
    expect(result.additionalProjectCount).toBe(7)
  })

  it('projects_json=[5개 entry], total_project_count=5 → additionalProjectCount===0', () => {
    const entries = [0, 1, 2, 3, 4].map(makeProjectEntry)
    const row = { ...baseRow, median_duration_ms: null, duration_sample_count: null, projects_json: entries, total_project_count: BigInt(5) }
    const result = mapSkillRow(row)
    expect(result.projects).toHaveLength(5)
    expect(result.additionalProjectCount).toBe(0)
  })

  it('잘못된 모양(string 배열) → 빈 배열 폴백, throw 하지 않음', () => {
    const row = { ...baseRow, median_duration_ms: null, duration_sample_count: null, projects_json: ['not-an-object', 42, null], total_project_count: BigInt(3) }
    expect(() => mapSkillRow(row)).not.toThrow()
    const result = mapSkillRow(row)
    expect(result.projects).toEqual([])
    // total_project_count=3, projects.length=0 → additionalProjectCount=3
    expect(result.additionalProjectCount).toBe(3)
  })
})
