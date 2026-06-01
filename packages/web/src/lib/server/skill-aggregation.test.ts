/**
 * skill-aggregation.test.ts
 *
 * WU-5: aggregateSkillCountsForRange 단위 테스트.
 *
 * 실제 Postgres DB 를 사용한다 (기존 dev DB 재사용).
 * DATABASE_URL 미설정 시 전체 suite 를 skip 한다.
 *
 * Case A — slash command only (messages 만, events 없음)
 * Case B — UNION + anti-join + role filter + whitespace (공유 fixture)
 */

// Vitest 2.x 는 .env.local 을 자동으로 로드하지 않으므로 직접 로드한다.
// (vitest.config.ts 에 envFile 설정을 추가하는 것이 이상적이지만
//  WU-5 는 vitest.config.ts 를 소유하지 않으므로 테스트 파일 내에서 처리한다.)
import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'path'

// Vitest 는 packages/web 을 cwd 로 실행한다. .env.local 을 직접 로드.
// Prisma 는 DATABASE_URL 과 DIRECT_URL 모두 필요하므로 .env.local 에서 로드한다.
dotenvConfig({ path: resolve(process.cwd(), '.env.local') })
dotenvConfig({ path: resolve(process.cwd(), '.env') })

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from './db'
import { aggregateSkillCountsForRange } from './skill-aggregation'
import {
  EXPECTED_SKILL_COUNTS,
  seedSkillCallFixture,
  cleanupSkillCallFixture,
} from './__fixtures__/skill-call-fixture'

// ─── DB 가용성 가드 ──────────────────────────────────────────────────────────

const DB_AVAILABLE = Boolean(process.env.DATABASE_URL)

// ─── 테스트 픽스처 ID 상수 ───────────────────────────────────────────────────

const TEST_ORG_ID = 'test-skill-agg-org'
const TEST_USER_ID = 'test-skill-agg-user'
const TEST_PROJECT_ID_B = 'test-skill-agg-proj-b'
const TEST_PROJECT_ID_A = 'test-skill-agg-proj-a'
const TEST_SESSION_ID_B = 'test-skill-agg-sess-b'
const TEST_SESSION_ID_A = 'test-skill-agg-sess-a'

// Case B 의 고정 날짜 (UTC)
const FIXTURE_DAY = new Date('2026-01-15T00:00:00.000Z')
const FIXTURE_DAY_NEXT = new Date('2026-01-16T00:00:00.000Z')

// ─── 공유 setup/teardown ─────────────────────────────────────────────────────

async function setupSupportingRecords() {
  // 조직 생성 (이미 있으면 skip)
  await db.organization.upsert({
    where: { id: TEST_ORG_ID },
    create: {
      id: TEST_ORG_ID,
      name: 'Test Skill Agg Org',
      slug: 'test-skill-agg-org',
    },
    update: {},
  })

  // 유저 생성
  await db.user.upsert({
    where: { id: TEST_USER_ID },
    create: {
      id: TEST_USER_ID,
      email: 'test-skill-agg@test.internal',
      passwordHash: 'test-hash',
      name: 'Test Skill Agg User',
    },
    update: {},
  })

  // 프로젝트 A (Case A 전용)
  await db.project.upsert({
    where: { id: TEST_PROJECT_ID_A },
    create: {
      id: TEST_PROJECT_ID_A,
      orgId: TEST_ORG_ID,
      name: 'Test Skill Agg Project A',
      slug: 'test-skill-agg-a',
    },
    update: {},
  })

  // 프로젝트 B (Case B 전용)
  await db.project.upsert({
    where: { id: TEST_PROJECT_ID_B },
    create: {
      id: TEST_PROJECT_ID_B,
      orgId: TEST_ORG_ID,
      name: 'Test Skill Agg Project B',
      slug: 'test-skill-agg-b',
    },
    update: {},
  })

  // 세션 A
  await db.claudeSession.upsert({
    where: { id: TEST_SESSION_ID_A },
    create: {
      id: TEST_SESSION_ID_A,
      projectId: TEST_PROJECT_ID_A,
      userId: TEST_USER_ID,
      startedAt: FIXTURE_DAY,
    },
    update: {},
  })

  // 세션 B
  await db.claudeSession.upsert({
    where: { id: TEST_SESSION_ID_B },
    create: {
      id: TEST_SESSION_ID_B,
      projectId: TEST_PROJECT_ID_B,
      userId: TEST_USER_ID,
      startedAt: FIXTURE_DAY,
    },
    update: {},
  })
}

async function teardownSupportingRecords() {
  // cascade 로 하위 row 가 삭제되므로 상위만 삭제
  await db.project.deleteMany({
    where: { id: { in: [TEST_PROJECT_ID_A, TEST_PROJECT_ID_B] } },
  })
  await db.user.deleteMany({ where: { id: TEST_USER_ID } })
  await db.organization.deleteMany({ where: { id: TEST_ORG_ID } })
}

// ─── Case A 전용 inline fixture ─────────────────────────────────────────────

async function seedCaseAFixture() {
  // Case A: messages 2건만 (events 없음). 동일 세션에서 'foo' slash 커맨드 2회.
  const ts = new Date(FIXTURE_DAY)
  ts.setUTCHours(12, 0, 0, 0)

  await db.message.createMany({
    data: [
      {
        id: `fixture-ca-m1-${TEST_PROJECT_ID_A}`,
        sessionId: TEST_SESSION_ID_A,
        role: 'HUMAN',
        content: '<command-message>run foo</command-message><command-name>/foo</command-name>',
        sequence: 0,
        timestamp: ts,
      },
      {
        id: `fixture-ca-m2-${TEST_PROJECT_ID_A}`,
        sessionId: TEST_SESSION_ID_A,
        role: 'HUMAN',
        content: '<command-message>run foo again</command-message><command-name>/foo</command-name>',
        sequence: 1,
        timestamp: ts,
      },
    ],
  })
}

async function cleanupCaseAFixture() {
  await db.message.deleteMany({
    where: {
      id: {
        in: [
          `fixture-ca-m1-${TEST_PROJECT_ID_A}`,
          `fixture-ca-m2-${TEST_PROJECT_ID_A}`,
        ],
      },
    },
  })
}

// ─── 테스트 suite ────────────────────────────────────────────────────────────

describe.skipIf(!DB_AVAILABLE)(
  'aggregateSkillCountsForRange',
  () => {
    beforeAll(async () => {
      await setupSupportingRecords()
    })

    afterAll(async () => {
      await teardownSupportingRecords()
    })

    // ── Case A ─────────────────────────────────────────────────────────────

    describe('Case A — slash command only (messages 만, events 없음)', () => {
      beforeAll(async () => {
        await seedCaseAFixture()
      })

      afterAll(async () => {
        await cleanupCaseAFixture()
      })

      it('messages 2건의 /foo 커맨드를 callCount=2 로 집계한다', async () => {
        const result = await aggregateSkillCountsForRange(
          [TEST_PROJECT_ID_A],
          FIXTURE_DAY,
          FIXTURE_DAY_NEXT,
        )

        expect(result).toHaveLength(1)
        expect(result[0]).toEqual({ skillName: 'foo', callCount: 2 })
      })

      it('빈 projectIds → 빈 배열 early return (DB 호출 없음)', async () => {
        const result = await aggregateSkillCountsForRange([], FIXTURE_DAY, FIXTURE_DAY_NEXT)
        expect(result).toEqual([])
      })
    })

    // ── Case B ─────────────────────────────────────────────────────────────

    describe('Case B — UNION + anti-join + role filter + whitespace', () => {
      beforeAll(async () => {
        await seedSkillCallFixture({
          projectId: TEST_PROJECT_ID_B,
          sessionId: TEST_SESSION_ID_B,
          userId: TEST_USER_ID,
          day: FIXTURE_DAY,
        })
      })

      afterAll(async () => {
        await cleanupSkillCallFixture({
          projectId: TEST_PROJECT_ID_B,
          sessionId: TEST_SESSION_ID_B,
          userId: TEST_USER_ID,
          cleanupSupporting: true,
        })
      })

      it('EXPECTED_SKILL_COUNTS 와 정확히 일치한다 (skillName set + callCount)', async () => {
        const result = await aggregateSkillCountsForRange(
          [TEST_PROJECT_ID_B],
          FIXTURE_DAY,
          FIXTURE_DAY_NEXT,
        )

        // Set 비교: 순서 보장 없으므로 Record 로 변환 후 비교
        const actual: Record<string, number> = {}
        for (const { skillName, callCount } of result) {
          actual[skillName] = callCount
        }

        expect(actual).toEqual(EXPECTED_SKILL_COUNTS)
      })

      it('ASSISTANT role 메시지(M4)는 카운트에 포함되지 않는다', async () => {
        const result = await aggregateSkillCountsForRange(
          [TEST_PROJECT_ID_B],
          FIXTURE_DAY,
          FIXTURE_DAY_NEXT,
        )

        const skillNames = result.map((r) => r.skillName)
        // M4 ASSISTANT 메시지는 어떤 skill 로도 카운트되지 않음
        // (EXPECTED_SKILL_COUNTS 에 없는 skill 이 없어야 함)
        expect(skillNames.every((name) => name in EXPECTED_SKILL_COUNTS)).toBe(true)
      })

      it('anti-join: baz 는 callCount=1 (events E2 에서만, messages M1 는 중복 제거)', async () => {
        const result = await aggregateSkillCountsForRange(
          [TEST_PROJECT_ID_B],
          FIXTURE_DAY,
          FIXTURE_DAY_NEXT,
        )

        const baz = result.find((r) => r.skillName === 'baz')
        expect(baz).toBeDefined()
        expect(baz!.callCount).toBe(1)
      })

      it('whitespace-ok: command-message 와 command-name 사이 공백 있어도 집계된다', async () => {
        const result = await aggregateSkillCountsForRange(
          [TEST_PROJECT_ID_B],
          FIXTURE_DAY,
          FIXTURE_DAY_NEXT,
        )

        const ws = result.find((r) => r.skillName === 'whitespace-ok')
        expect(ws).toBeDefined()
        expect(ws!.callCount).toBe(1)
      })

      it('시간 경계 외 데이터는 집계하지 않는다 (half-open [from, toExclusive))', async () => {
        // FIXTURE_DAY 이전 구간: 결과가 없어야 함
        const yesterday = new Date(FIXTURE_DAY.getTime() - 86400_000)
        const result = await aggregateSkillCountsForRange(
          [TEST_PROJECT_ID_B],
          yesterday,
          FIXTURE_DAY, // toExclusive = FIXTURE_DAY → fixture ts (낮 12시) 미포함
        )

        expect(result).toHaveLength(0)
      })
    })
  },
)
