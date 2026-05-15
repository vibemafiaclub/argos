/**
 * skill-call-fixture.ts
 *
 * skill-call 정의 회귀 가드용 공유 fixture. owner: WU-4. 변경은 4 테스트 모두 영향.
 *
 * WU-5 (skill-aggregation.test), WU-6 (daily-rollup.test),
 * WU-7 (weekly-report.test), WU-8 (skills route.test) 가 read-only import.
 *
 * 실제 Postgres DB 를 사용한다 (기존 dev DB 재사용). DATABASE_URL 환경 변수 필요.
 *
 * 시드 데이터 설계 — Case B (표준 fixture):
 *
 *   events (2건):
 *     E1: is_skill_call=true, is_slash_command=false, skill_name='bar'
 *         → events 분기에서 bar:1 기여
 *     E2: is_skill_call=true, is_slash_command=true,  skill_name='baz'
 *         → events 분기에서 baz:1 기여
 *         → messages 분기의 baz slash 를 anti-join 으로 제거
 *
 *   messages (4건):
 *     M1 HUMAN: <command-message>...</command-message><command-name>/baz</command-name>
 *         → E2 의 anti-join 조건 충족 → messages 분기에서 제거 (중복 방지)
 *     M2 HUMAN: <command-message>...</command-message><command-name>/qux</command-name>
 *         → events anti-join 불일치 → messages 분기에서 qux:1 기여
 *     M3 HUMAN: <command-message>...</command-message>  <command-name>/whitespace-ok</command-name>
 *         → command-message 와 command-name 사이에 공백 (regex [[:space:]]*) → whitespace-ok:1 기여
 *     M4 ASSISTANT: 일반 텍스트 → role='HUMAN' 필터에서 제거
 *
 *   UNION 결과: { bar:1, baz:1, qux:1, 'whitespace-ok':1 } = EXPECTED_SKILL_COUNTS
 */

import { db } from '../db'

// ─── 기대 결과 상수 ────────────────────────────────────────────────────────────

/**
 * seedSkillCallFixture 로 시드한 데이터에서 aggregateSkillCountsForRange 가
 * 반환해야 할 기대 callCount. WU-5/6/7/8 이 동일 기대치를 공유한다.
 */
export const EXPECTED_SKILL_COUNTS: Record<string, number> = {
  bar: 1,
  baz: 1,
  qux: 1,
  'whitespace-ok': 1,
}

// ─── 시드 함수 ─────────────────────────────────────────────────────────────────

export interface SkillCallFixtureOpts {
  /** 픽스처 row 를 귀속할 projectId (이미 DB 에 존재해야 한다). */
  projectId: string
  /** 픽스처 이벤트 / 메시지를 귀속할 sessionId (이미 DB 에 존재해야 한다). */
  sessionId: string
  /** 픽스처 이벤트를 귀속할 userId (이미 DB 에 존재해야 한다). */
  userId: string
  /**
   * 픽스처 row 의 timestamp 기준일 (UTC 00:00:00).
   * half-open 구간 [day, day+1d) 로 aggregateSkillCountsForRange 를 호출할 때 사용하는 날짜.
   */
  day: Date
}

/**
 * Case B (표준 fixture) 에 해당하는 DB row 를 삽입한다.
 * events 2건 + messages 4건 (HUMAN 3 + ASSISTANT 1).
 *
 * 테스트 afterEach/afterAll 에서 반드시 cleanupSkillCallFixture 를 호출해야 한다.
 */
export async function seedSkillCallFixture(opts: SkillCallFixtureOpts): Promise<void> {
  const { projectId, sessionId, userId, day } = opts

  // supporting records 보장 (idempotent upsert).
  // - 호출자가 실제 org/user/project/session row 를 이미 만들어둔 경우 update:{} 로 no-op.
  // - 호출자가 임의 id 만 던지고 supporting row 가 없는 경우 fixture 가 직접 생성.
  // cleanupSkillCallFixture({ cleanupSupporting: true }) 로 정리한다.
  const orgId = `fixture-org-${projectId}`
  await db.organization.upsert({
    where: { id: orgId },
    create: { id: orgId, name: `Fixture Org ${projectId}`, slug: orgId },
    update: {},
  })
  await db.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      email: `${userId}@argos.fixture`,
      passwordHash: 'fixture-no-login',
      name: `Fixture User ${userId}`,
    },
    update: {},
  })
  await db.project.upsert({
    where: { id: projectId },
    create: {
      id: projectId,
      orgId,
      name: `Fixture Project ${projectId}`,
      slug: `fixture-project-${projectId}`,
    },
    update: {},
  })
  await db.claudeSession.upsert({
    where: { id: sessionId },
    create: { id: sessionId, projectId, userId },
    update: {},
  })

  // day 기준 UTC 낮 12시 — half-open [day, day+1d) 구간 안에 들어가도록
  const ts = new Date(day)
  ts.setUTCHours(12, 0, 0, 0)

  // ── events ──────────────────────────────────────────────────────────────────

  // E1: events 분기 only (is_slash_command=false). skill_name='bar' → bar:1
  await db.event.create({
    data: {
      id: `fixture-e1-${projectId}`,
      sessionId,
      userId,
      projectId,
      eventType: 'PRE_TOOL_USE',
      toolName: 'mcp__bar__bar',
      isSkillCall: true,
      skillName: 'bar',
      isSlashCommand: false,
      isAgentCall: false,
      timestamp: ts,
    },
  })

  // E2: events 분기 기여 + messages 분기 anti-join target.
  //     is_slash_command=true, skill_name='baz' → baz:1 (events branch)
  //     messages M1 (baz slash) 을 anti-join 으로 제거한다.
  await db.event.create({
    data: {
      id: `fixture-e2-${projectId}`,
      sessionId,
      userId,
      projectId,
      eventType: 'PRE_TOOL_USE',
      toolName: 'mcp__baz__baz',
      isSkillCall: true,
      skillName: 'baz',
      isSlashCommand: true,
      isAgentCall: false,
      timestamp: ts,
    },
  })

  // ── messages ────────────────────────────────────────────────────────────────

  // M1 HUMAN: slash command for 'baz' — E2 의 anti-join 조건 충족 → messages 분기에서 제거
  await db.message.create({
    data: {
      id: `fixture-m1-${projectId}`,
      sessionId,
      role: 'HUMAN',
      content:
        '<command-message>run baz</command-message><command-name>/baz</command-name>',
      sequence: 0,
      timestamp: ts,
    },
  })

  // M2 HUMAN: slash command for 'qux' — events 에 없음 → messages 분기에서 qux:1 기여
  await db.message.create({
    data: {
      id: `fixture-m2-${projectId}`,
      sessionId,
      role: 'HUMAN',
      content:
        '<command-message>run qux</command-message><command-name>/qux</command-name>',
      sequence: 1,
      timestamp: ts,
    },
  })

  // M3 HUMAN: command-message 와 command-name 사이에 공백 (regex [[:space:]]*)
  //           → 'whitespace-ok' 기여. 스킬 이름 앞 '/' 도 regex 로 제거.
  await db.message.create({
    data: {
      id: `fixture-m3-${projectId}`,
      sessionId,
      role: 'HUMAN',
      content:
        '<command-message>run whitespace-ok</command-message>  <command-name>/whitespace-ok</command-name>',
      sequence: 2,
      timestamp: ts,
    },
  })

  // M4 ASSISTANT: 일반 텍스트 → role='HUMAN' 필터에서 제거 (카운트에 포함 안 됨)
  await db.message.create({
    data: {
      id: `fixture-m4-${projectId}`,
      sessionId,
      role: 'ASSISTANT',
      content: 'Sure, running the requested skill.',
      sequence: 3,
      timestamp: ts,
    },
  })
}

// ─── 정리 함수 ─────────────────────────────────────────────────────────────────

/**
 * seedSkillCallFixture 가 삽입한 row 를 모두 삭제한다.
 * 테스트 afterEach / afterAll 에서 호출해 테스트 간 격리를 보장한다.
 *
 * projectId 를 키로 삽입 시 고정 id prefix 를 사용했으므로 다른 row 에 영향 없음.
 *
 * cleanupSupporting=true 면 fixture 가 upsert 한 org/user/project/session row 도 삭제.
 * 호출자가 자기 supporting row 를 미리 만들어둔 경우 false (기본) 로 호출해야 한다.
 */
export async function cleanupSkillCallFixture(opts: {
  projectId: string
  sessionId?: string
  userId?: string
  cleanupSupporting?: boolean
}): Promise<void> {
  const { projectId, sessionId, userId, cleanupSupporting = false } = opts

  await db.message.deleteMany({
    where: {
      id: {
        in: [
          `fixture-m1-${projectId}`,
          `fixture-m2-${projectId}`,
          `fixture-m3-${projectId}`,
          `fixture-m4-${projectId}`,
        ],
      },
    },
  })

  await db.event.deleteMany({
    where: {
      id: {
        in: [`fixture-e1-${projectId}`, `fixture-e2-${projectId}`],
      },
    },
  })

  if (cleanupSupporting) {
    if (sessionId) await db.claudeSession.deleteMany({ where: { id: sessionId } })
    await db.project.deleteMany({ where: { id: projectId } })
    if (userId) await db.user.deleteMany({ where: { id: userId } })
    await db.organization.deleteMany({ where: { id: `fixture-org-${projectId}` } })
  }
}
