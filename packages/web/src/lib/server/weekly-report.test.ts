/**
 * weekly-report.test.ts — WU-7: weekly-report skill-only 회귀 가드
 *
 * 핵심 보장:
 *   aggregateSummary(rollups, 10)  (legacy positional overload)
 *   와
 *   aggregateSummary(rollups, { topSkillsN: 10, topAgentsN: 10 })  (options object)
 *   가 동일 결과를 반환한다 (Decision-4 / normalizeAggregateSummaryOptions).
 *
 * 부가 보장:
 *   - topSkills 에 UNION 정의(EXPECTED_SKILL_COUNTS)의 skill 이름이 모두 포함됨.
 *   - skill N 변경이 sessionCount / turnCount / activeUserCount 등 비-skill KPI 에 영향 없음.
 *
 * weekly-report.ts 는 `import 'server-only'` 가 있어 vitest 에서 직접 import 불가.
 * plan WU-7 "비용 절감을 위해 직접 aggregateSummary 만 호출" 지침에 따라
 * aggregateSummary (daily-rollup.ts) 를 직접 호출한다.
 *
 * DB 접근 없음 — mock DailyRollup 만 사용.
 */

import { describe, it, expect } from 'vitest'
import {
  aggregateSummary,
  normalizeAggregateSummaryOptions,
  type DailyRollup,
} from './daily-rollup'
import { EXPECTED_SKILL_COUNTS } from './__fixtures__/skill-call-fixture'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRollup(overrides: Partial<DailyRollup> = {}): DailyRollup {
  return {
    date: '2026-05-14',
    sessionCount: 5,
    turnCount: 20,
    activeUserCount: 3,
    activeUserIds: ['u1', 'u2', 'u3'],
    inputTokens: 1000,
    outputTokens: 2000,
    cacheReadTokens: 100,
    cacheCreationTokens: 50,
    estimatedCostUsd: 0.01,
    skillCounts: {},
    agentCounts: {},
    modelTokens: {},
    userStats: [],
    ...overrides,
  }
}

/** EXPECTED_SKILL_COUNTS 를 skillCounts 로 갖는 단일 롤업 */
const rollupWithUnionSkills = makeRollup({ skillCounts: { ...EXPECTED_SKILL_COUNTS } })

/**
 * 많은 skill (>10) 과 agent (>10) 를 포함한 롤업 — top-N 절삭을 검증할 때 사용.
 * callCount 가 모두 다르므로 tie-break 없이 결정적.
 */
const rollupWithManySkills = makeRollup({
  skillCounts: {
    skill01: 20, skill02: 19, skill03: 18, skill04: 17, skill05: 16,
    skill06: 15, skill07: 14, skill08: 13, skill09: 12, skill10: 11,
    skill11: 10, skill12: 9,
  },
  agentCounts: {
    agent01: 20, agent02: 19, agent03: 18, agent04: 17, agent05: 16,
    agent06: 15, agent07: 14, agent08: 13, agent09: 12, agent10: 11,
    agent11: 10, agent12: 9,
  },
})

// ─── normalizeAggregateSummaryOptions 회귀 ─────────────────────────────────────

describe('normalizeAggregateSummaryOptions — weekly-report 호환성 보장', () => {
  it('number 10 → { topSkillsN: 10, topAgentsN: 10 } (weekly-report 호출 패턴)', () => {
    expect(normalizeAggregateSummaryOptions(10)).toEqual({ topSkillsN: 10, topAgentsN: 10 })
  })

  it('{ topSkillsN: 10, topAgentsN: 10 } (object) 도 동일 결과', () => {
    expect(normalizeAggregateSummaryOptions({ topSkillsN: 10, topAgentsN: 10 })).toEqual({
      topSkillsN: 10,
      topAgentsN: 10,
    })
  })

  it('legacy positional(10) 과 explicit object({ topSkillsN:10, topAgentsN:10 }) 가 동일', () => {
    const fromNumber = normalizeAggregateSummaryOptions(10)
    const fromObject = normalizeAggregateSummaryOptions({ topSkillsN: 10, topAgentsN: 10 })
    expect(fromNumber).toEqual(fromObject)
  })
})

// ─── aggregateSummary overload 동치성 ──────────────────────────────────────────

describe('aggregateSummary — positional(10) vs options({ topSkillsN:10, topAgentsN:10 }) 동치성', () => {
  it('topSkills 배열이 완전히 동일하다', () => {
    const byNumber = aggregateSummary([rollupWithManySkills], 10)
    const byObject = aggregateSummary([rollupWithManySkills], { topSkillsN: 10, topAgentsN: 10 })
    expect(byNumber.topSkills).toEqual(byObject.topSkills)
  })

  it('topAgents 배열이 완전히 동일하다', () => {
    const byNumber = aggregateSummary([rollupWithManySkills], 10)
    const byObject = aggregateSummary([rollupWithManySkills], { topSkillsN: 10, topAgentsN: 10 })
    expect(byNumber.topAgents).toEqual(byObject.topAgents)
  })

  it('sessionCount / turnCount / activeUserCount 등 비-skill KPI 도 동일하다', () => {
    const byNumber = aggregateSummary([rollupWithManySkills], 10)
    const byObject = aggregateSummary([rollupWithManySkills], { topSkillsN: 10, topAgentsN: 10 })
    expect(byNumber.sessionCount).toBe(byObject.sessionCount)
    expect(byNumber.turnCount).toBe(byObject.turnCount)
    expect(byNumber.activeUserCount).toBe(byObject.activeUserCount)
    expect(byNumber.inputTokens).toBe(byObject.inputTokens)
    expect(byNumber.outputTokens).toBe(byObject.outputTokens)
    expect(byNumber.estimatedCostUsd).toBe(byObject.estimatedCostUsd)
  })

  it('modelShare 도 동일하다', () => {
    const byNumber = aggregateSummary([rollupWithManySkills], 10)
    const byObject = aggregateSummary([rollupWithManySkills], { topSkillsN: 10, topAgentsN: 10 })
    expect(byNumber.modelShare).toEqual(byObject.modelShare)
  })
})

// ─── top-N 절삭 ────────────────────────────────────────────────────────────────

describe('aggregateSummary — N=10 으로 topSkills / topAgents 절삭', () => {
  it('skill 이 12개여도 topSkills 는 최대 10 개 (positional overload)', () => {
    const result = aggregateSummary([rollupWithManySkills], 10)
    expect(result.topSkills).toHaveLength(10)
  })

  it('agent 이 12개여도 topAgents 는 최대 10 개 (positional overload)', () => {
    const result = aggregateSummary([rollupWithManySkills], 10)
    expect(result.topAgents).toHaveLength(10)
  })

  it('options object 로 호출해도 topSkills / topAgents 각각 10 개', () => {
    const result = aggregateSummary([rollupWithManySkills], { topSkillsN: 10, topAgentsN: 10 })
    expect(result.topSkills).toHaveLength(10)
    expect(result.topAgents).toHaveLength(10)
  })

  it('topSkills 는 callCount DESC 순으로 정렬된다', () => {
    const result = aggregateSummary([rollupWithManySkills], 10)
    const counts = result.topSkills.map((s) => s.callCount)
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
  })

  it('topAgents 는 callCount DESC 순으로 정렬된다', () => {
    const result = aggregateSummary([rollupWithManySkills], 10)
    const counts = result.topAgents.map((a) => a.callCount)
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
  })
})

// ─── UNION 정의 skill 반영 ─────────────────────────────────────────────────────

describe('aggregateSummary — UNION 정의 skill (EXPECTED_SKILL_COUNTS) 반영', () => {
  it('topSkills 에 EXPECTED_SKILL_COUNTS 의 모든 skill 이름이 포함된다', () => {
    const result = aggregateSummary([rollupWithUnionSkills], 10)
    const topSkillNames = new Set(result.topSkills.map((s) => s.skillName))
    for (const skill of Object.keys(EXPECTED_SKILL_COUNTS)) {
      expect(topSkillNames).toContain(skill)
    }
  })

  it('topSkills 각 항목의 callCount 가 EXPECTED_SKILL_COUNTS 와 일치한다', () => {
    const result = aggregateSummary([rollupWithUnionSkills], 10)
    for (const { skillName, callCount } of result.topSkills) {
      expect(callCount).toBe(EXPECTED_SKILL_COUNTS[skillName])
    }
  })

  it('EXPECTED_SKILL_COUNTS 외 skill 이 topSkills 에 없다', () => {
    const result = aggregateSummary([rollupWithUnionSkills], 10)
    const expected = new Set(Object.keys(EXPECTED_SKILL_COUNTS))
    for (const { skillName } of result.topSkills) {
      expect(expected).toContain(skillName)
    }
  })
})

// ─── 비-skill KPI 불변 — skill N 변경 영향 없음 ──────────────────────────────────

describe('aggregateSummary — 비-skill KPI 는 topSkillsN / topAgentsN 에 영향받지 않음', () => {
  const rollups = [
    makeRollup({ sessionCount: 10, turnCount: 40, activeUserIds: ['u1', 'u2'], skillCounts: { alpha: 5 } }),
    makeRollup({ sessionCount: 5, turnCount: 20, activeUserIds: ['u2', 'u3'], skillCounts: { beta: 3 } }),
  ]

  it('sessionCount 는 N 변경에 무관하게 동일하다', () => {
    const r1 = aggregateSummary(rollups, 1)
    const r10 = aggregateSummary(rollups, 10)
    expect(r1.sessionCount).toBe(r10.sessionCount)
    expect(r10.sessionCount).toBe(15)
  })

  it('turnCount 는 N 변경에 무관하게 동일하다', () => {
    const r1 = aggregateSummary(rollups, 1)
    const r10 = aggregateSummary(rollups, 10)
    expect(r1.turnCount).toBe(r10.turnCount)
    expect(r10.turnCount).toBe(60)
  })

  it('activeUserCount 는 N 변경에 무관하게 동일하다 (u1/u2/u3 union)', () => {
    const r1 = aggregateSummary(rollups, 1)
    const r10 = aggregateSummary(rollups, 10)
    expect(r1.activeUserCount).toBe(r10.activeUserCount)
    expect(r10.activeUserCount).toBe(3)
  })

  it('inputTokens / outputTokens 는 N 변경에 무관하다', () => {
    const r1 = aggregateSummary(rollups, 1)
    const r10 = aggregateSummary(rollups, 10)
    expect(r1.inputTokens).toBe(r10.inputTokens)
    expect(r1.outputTokens).toBe(r10.outputTokens)
  })
})

// ─── tie-break determinism ─────────────────────────────────────────────────────

describe('aggregateSummary — 동률 tie-break (callCount DESC, skillName ASC)', () => {
  it('동률 skill 2개는 alphabetical ASC 로 정렬된다 (zz < aa → aa first)', () => {
    const rollup = makeRollup({ skillCounts: { zz: 5, aa: 5 } })
    const result = aggregateSummary([rollup], 10)
    expect(result.topSkills).toEqual([
      { skillName: 'aa', callCount: 5 },
      { skillName: 'zz', callCount: 5 },
    ])
  })

  it('weekly-report 패턴 N=10 에서도 tie-break 가 동일하게 동작한다', () => {
    const rollup = makeRollup({ skillCounts: { zz: 5, aa: 5 } })
    const byPositional = aggregateSummary([rollup], 10)
    const byObject = aggregateSummary([rollup], { topSkillsN: 10, topAgentsN: 10 })
    expect(byPositional.topSkills).toEqual(byObject.topSkills)
  })
})
