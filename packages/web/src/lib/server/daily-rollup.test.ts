/**
 * daily-rollup.test.ts — WU-6: daily-rollup builder 통합 회귀 가드
 *
 * 테스트 구성:
 *  1. normalizeAggregateSummaryOptions 단위 테스트 (pure, DB 불필요)
 *     - undefined → { topSkillsN: 5, topAgentsN: 5 }
 *     - number(10) → { topSkillsN: 10, topAgentsN: 10 }  (legacy weekly-report 호환)
 *     - { topSkillsN: 10 } → { topSkillsN: 10, topAgentsN: 5 }  (overview 패턴)
 *     - { topSkillsN: 10, topAgentsN: 3 } → { topSkillsN: 10, topAgentsN: 3 }
 *  2. aggregateSummary 정렬 deterministic 검증 (pure, DB 불필요)
 *     - 동률 tie-break: callCount DESC, skillName ASC (alphabet 순)
 *  3. skill 회귀 가드: getDailyRollups → skillCounts = EXPECTED_SKILL_COUNTS
 *     - DATABASE_URL 미설정 시 skip (플래그: SKIP_DB_TESTS)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  normalizeAggregateSummaryOptions,
  aggregateSummary,
  getDailyRollups,
  type DailyRollup,
} from './daily-rollup'

// ─── 1. normalizeAggregateSummaryOptions ─────────────────────────────────────

describe('normalizeAggregateSummaryOptions', () => {
  it('undefined → { topSkillsN: 5, topAgentsN: 5 } (기본값)', () => {
    expect(normalizeAggregateSummaryOptions(undefined)).toEqual({
      topSkillsN: 5,
      topAgentsN: 5,
    })
  })

  it('number(10) → { topSkillsN: 10, topAgentsN: 10 } (legacy positional overload)', () => {
    // weekly-report.ts 의 aggregateSummary(rollups, 10) 호출을 커버한다.
    // Decision-4: number 입력은 두 N 에 동일 적용 → 현행 weekly-report 동작 보존.
    expect(normalizeAggregateSummaryOptions(10)).toEqual({
      topSkillsN: 10,
      topAgentsN: 10,
    })
  })

  it('{ topSkillsN: 10 } → { topSkillsN: 10, topAgentsN: 5 } (overview 패턴)', () => {
    // overview route 가 aggregateSummary(rollups, { topSkillsN: 10 }) 로 호출하는 패턴.
    // topAgentsN 미지정 → 기본 5 유지 (Negative Space: Top Agents 카드 회귀 없음).
    expect(normalizeAggregateSummaryOptions({ topSkillsN: 10 })).toEqual({
      topSkillsN: 10,
      topAgentsN: 5,
    })
  })

  it('{ topSkillsN: 10, topAgentsN: 3 } → { topSkillsN: 10, topAgentsN: 3 } (양쪽 지정)', () => {
    expect(normalizeAggregateSummaryOptions({ topSkillsN: 10, topAgentsN: 3 })).toEqual({
      topSkillsN: 10,
      topAgentsN: 3,
    })
  })
})

// ─── 2. aggregateSummary — 정렬 deterministic (tie-break) ──────────────────

describe('aggregateSummary — deterministic sort (tie-break)', () => {
  /**
   * 동률 skill 2개 (zz:5, aa:5) 를 포함한 fixture rollup.
   * topSkills 결과가 alphabet 오름차순 tie-break 로 [aa, zz] 가 되어야 한다.
   * Decision-5: callCount DESC, skillName ASC (localeCompare).
   */
  const tieBreakRollup: DailyRollup = {
    date: '2026-05-14',
    sessionCount: 2,
    turnCount: 10,
    activeUserCount: 1,
    activeUserIds: ['u1'],
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    estimatedCostUsd: 0,
    skillCounts: { zz: 5, aa: 5, mid: 3 },
    agentCounts: { 'agent-b': 2, 'agent-a': 2 },
    modelTokens: {},
    userStats: [],
  }

  it('topSkills: callCount DESC → 동률은 skillName ASC (aa < zz)', () => {
    const summary = aggregateSummary([tieBreakRollup], { topSkillsN: 5 })
    // zz:5 와 aa:5 는 동률 → alphabet 오름차순: aa first
    expect(summary.topSkills[0]).toEqual({ skillName: 'aa', callCount: 5 })
    expect(summary.topSkills[1]).toEqual({ skillName: 'zz', callCount: 5 })
    // mid:3 이 마지막
    expect(summary.topSkills[2]).toEqual({ skillName: 'mid', callCount: 3 })
  })

  it('topAgents: callCount DESC → 동률은 agentType ASC (agent-a < agent-b)', () => {
    const summary = aggregateSummary([tieBreakRollup], { topAgentsN: 5 })
    expect(summary.topAgents[0]).toEqual({ agentType: 'agent-a', callCount: 2 })
    expect(summary.topAgents[1]).toEqual({ agentType: 'agent-b', callCount: 2 })
  })

  it('topSkillsN=2 → 상위 2개만 반환 (aa, zz), mid 제외', () => {
    const summary = aggregateSummary([tieBreakRollup], { topSkillsN: 2 })
    expect(summary.topSkills).toHaveLength(2)
    expect(summary.topSkills.map(s => s.skillName)).toEqual(['aa', 'zz'])
  })

  it('legacy overload aggregateSummary(rollups, 10) → topSkills 최대 10개', () => {
    // weekly-report.ts 의 positional topN=10 호출 패턴 회귀 없음 가드
    const summary = aggregateSummary([tieBreakRollup], 10)
    // fixture 에 3개 스킬만 있으므로 3개 반환
    expect(summary.topSkills).toHaveLength(3)
    // topAgents 도 10 으로 설정됨 (legacy overload)
    expect(summary.topAgents).toHaveLength(2)
  })

  it('no-arg overload aggregateSummary(rollups) → topSkillsN=5 기본값', () => {
    const summary = aggregateSummary([tieBreakRollup])
    // fixture 에 3개 스킬만 있으므로 3개 반환 (5보다 적음)
    expect(summary.topSkills).toHaveLength(3)
  })

  it('여러 rollup 합산 후 정렬도 deterministic', () => {
    const rollup2: DailyRollup = {
      ...tieBreakRollup,
      date: '2026-05-15',
      skillCounts: { zz: 3 }, // zz 에 3 추가 → zz:8, aa:5
    }
    const summary = aggregateSummary([tieBreakRollup, rollup2], { topSkillsN: 5 })
    // zz:8 > aa:5 → zz first (no tie)
    expect(summary.topSkills[0]).toEqual({ skillName: 'zz', callCount: 8 })
    expect(summary.topSkills[1]).toEqual({ skillName: 'aa', callCount: 5 })
  })
})

// ─── 3. skill 회귀 가드 (DB 연동, DATABASE_URL 없으면 skip) ───────────────────

const HAS_DB = !!process.env.DATABASE_URL
const describeWithDb = HAS_DB ? describe : describe.skip

describeWithDb('getDailyRollups — skill 회귀 가드 (DB 연동)', () => {
  /**
   * DB 연동 테스트는 WU-4 fixture 를 import 해 실제 Postgres 에 데이터를 삽입하고
   * getDailyRollups 결과의 skillCounts 가 EXPECTED_SKILL_COUNTS 와 일치하는지 검증한다.
   *
   * 실행 조건: DATABASE_URL 환경 변수가 설정된 dev DB.
   * CI / worktree 환경에서 DATABASE_URL 없으면 이 블록 전체 skip.
   */

  // 동적 import — DB 없는 환경에서 모듈 로드 오류 방지
  let seedSkillCallFixture: (opts: {
    projectId: string
    sessionId: string
    userId: string
    day: Date
  }) => Promise<void>
  let cleanupSkillCallFixture: (opts: {
    projectId: string
    sessionId?: string
    userId?: string
    cleanupSupporting?: boolean
  }) => Promise<void>
  let EXPECTED_SKILL_COUNTS: Record<string, number>

  const FIXTURE_PROJECT_ID = 'wu6-test-project'
  const FIXTURE_SESSION_ID = 'wu6-test-session'
  const FIXTURE_USER_ID = 'wu6-test-user'
  const FIXTURE_DAY = new Date('2026-05-14T00:00:00Z')

  beforeAll(async () => {
    const fixtureModule = await import('./__fixtures__/skill-call-fixture.js')
    seedSkillCallFixture = fixtureModule.seedSkillCallFixture
    cleanupSkillCallFixture = fixtureModule.cleanupSkillCallFixture
    EXPECTED_SKILL_COUNTS = fixtureModule.EXPECTED_SKILL_COUNTS

    await seedSkillCallFixture({
      projectId: FIXTURE_PROJECT_ID,
      sessionId: FIXTURE_SESSION_ID,
      userId: FIXTURE_USER_ID,
      day: FIXTURE_DAY,
    })
  })

  afterAll(async () => {
    if (cleanupSkillCallFixture) {
      await cleanupSkillCallFixture({
        projectId: FIXTURE_PROJECT_ID,
        sessionId: FIXTURE_SESSION_ID,
        userId: FIXTURE_USER_ID,
        cleanupSupporting: true,
      })
    }
  })

  it('skillCounts 가 EXPECTED_SKILL_COUNTS 와 정확히 일치 (UNION 정의 회귀 없음)', async () => {
    const rollups = await getDailyRollups(FIXTURE_PROJECT_ID, FIXTURE_DAY, FIXTURE_DAY)
    // 해당 day 의 rollup 이 적어도 하나 있어야 함
    const dayKey = FIXTURE_DAY.toISOString().slice(0, 10) // '2026-05-14'
    const rollup = rollups.find(r => r.date === dayKey)

    expect(rollup, `${dayKey} rollup 이 없음 — fixture seed 실패 또는 projectId 없음`).toBeDefined()

    if (!rollup) return

    // Set 비교: EXPECTED_SKILL_COUNTS 의 모든 key 가 존재하고, 값이 일치해야 한다.
    for (const [skillName, expectedCount] of Object.entries(EXPECTED_SKILL_COUNTS)) {
      expect(
        rollup.skillCounts[skillName],
        `skillCounts['${skillName}'] 기대=${expectedCount}`,
      ).toBe(expectedCount)
    }

    // 기대 외의 skill 이 없어야 한다 (정확히 일치).
    const unexpectedSkills = Object.keys(rollup.skillCounts).filter(
      k => !(k in EXPECTED_SKILL_COUNTS),
    )
    expect(unexpectedSkills, '예상치 못한 skill 이 포함됨').toHaveLength(0)
  })
})
