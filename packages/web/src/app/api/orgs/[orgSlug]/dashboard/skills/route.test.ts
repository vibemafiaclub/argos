/**
 * route.test.ts — WU-8: skills route contract 테스트
 *
 * 같은 (org, from, to, projectId) 에서 skills route GET handler 가
 * EXPECTED_SKILL_COUNTS (bar=1, baz=1, qux=1, whitespace-ok=1) 를
 * callCount DESC, skillName ASC 순으로 반환하는지 검증한다.
 *
 * - auth 관련 헬퍼 (requireAuth, assertOrgAccessBySlugOrResponse,
 *   resolveOrgScopedProjectIds) 는 vi.mock 으로 bypass.
 * - DB 접근 (db.$queryRaw) 은 실제 Postgres DB 사용.
 * - DATABASE_URL 미설정 시 전체 suite 를 skip.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import type { Organization, OrgRole } from '@prisma/client'

// ─── auth / route helper 를 route.ts 가 import 하기 전에 mock ────────────────
// vi.mock 호이스팅 덕분에 실제 모듈 평가 전 적용됨.

vi.mock('server-only', () => ({}))

vi.mock('@/lib/server/auth-helper', () => ({
  requireAuth: vi.fn(),
}))

vi.mock('@/lib/server/dashboard-route-helper', () => ({
  assertOrgAccessBySlugOrResponse: vi.fn(),
  resolveOrgScopedProjectIds: vi.fn(),
}))

// error-helper 가 'server-only' 를 transitively import 하지 않도록 모킹.
vi.mock('@/lib/server/error-helper', () => ({
  handleRouteError: (err: unknown) => {
    console.error('[test] handleRouteError:', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  },
}))

// ─── 실제 구현 import (mock 설정 후) ─────────────────────────────────────────

import { GET } from './route'
import { db } from '@/lib/server/db'
import { requireAuth } from '@/lib/server/auth-helper'
import {
  assertOrgAccessBySlugOrResponse,
  resolveOrgScopedProjectIds,
} from '@/lib/server/dashboard-route-helper'
import {
  EXPECTED_SKILL_COUNTS,
  seedSkillCallFixture,
  cleanupSkillCallFixture,
} from '@/lib/server/__fixtures__/skill-call-fixture'
import type { SkillStat } from '@argos/shared'

// ─── DB 가용성 가드 ──────────────────────────────────────────────────────────

const DB_AVAILABLE = Boolean(process.env.DATABASE_URL)

// ─── 픽스처 ID 상수 (WU-8 전용 — WU-5 / WU-6 / WU-7 과 충돌 없도록 별도 prefix) ──

const TEST_ORG_ID = 'test-skills-route-org'
const TEST_USER_ID = 'test-skills-route-user'
const TEST_PROJECT_ID = 'test-skills-route-proj'
const TEST_SESSION_ID = 'test-skills-route-sess'
const TEST_ORG_SLUG = 'test-skills-route-org'

// 픽스처 row 의 timestamp 기준일 (UTC 00:00:00)
const FIXTURE_DAY = new Date('2026-02-10T00:00:00.000Z')

// parseDateRange 가 FIXTURE_DAY 당일을 포함하도록 from / to 쿼리 파라미터 설정.
// parseDateRange 는 to 를 23:59:59.999 로 보정 후 route 내부에서 +1ms toExclusive 로 변환.
const FROM_PARAM = '2026-02-10'
const TO_PARAM = '2026-02-10'

// ─── mock 타입 단언 ──────────────────────────────────────────────────────────

const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>
const mockAssertOrgAccess = assertOrgAccessBySlugOrResponse as ReturnType<typeof vi.fn>
const mockResolveProjectIds = resolveOrgScopedProjectIds as ReturnType<typeof vi.fn>

// ─── DB setup / teardown ─────────────────────────────────────────────────────

async function setupSupportingRecords() {
  await db.organization.upsert({
    where: { id: TEST_ORG_ID },
    create: {
      id: TEST_ORG_ID,
      name: 'Test Skills Route Org',
      slug: TEST_ORG_SLUG,
    },
    update: {},
  })

  await db.user.upsert({
    where: { id: TEST_USER_ID },
    create: {
      id: TEST_USER_ID,
      email: 'test-skills-route@test.internal',
      passwordHash: 'test-hash',
      name: 'Test Skills Route User',
    },
    update: {},
  })

  await db.project.upsert({
    where: { id: TEST_PROJECT_ID },
    create: {
      id: TEST_PROJECT_ID,
      orgId: TEST_ORG_ID,
      name: 'Test Skills Route Project',
      slug: 'test-skills-route-proj',
    },
    update: {},
  })

  await db.claudeSession.upsert({
    where: { id: TEST_SESSION_ID },
    create: {
      id: TEST_SESSION_ID,
      projectId: TEST_PROJECT_ID,
      userId: TEST_USER_ID,
      startedAt: FIXTURE_DAY,
    },
    update: {},
  })
}

async function teardownSupportingRecords() {
  // cascade 로 하위 row 삭제 (events, messages 포함)
  await db.project.deleteMany({ where: { id: TEST_PROJECT_ID } })
  await db.user.deleteMany({ where: { id: TEST_USER_ID } })
  await db.organization.deleteMany({ where: { id: TEST_ORG_ID } })
}

// ─── NextRequest 헬퍼 ────────────────────────────────────────────────────────

function makeRequest(params?: Record<string, string>): NextRequest {
  const url = new URL(
    `http://localhost/api/orgs/${TEST_ORG_SLUG}/dashboard/skills`,
  )
  url.searchParams.set('from', FROM_PARAM)
  url.searchParams.set('to', TO_PARAM)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }
  }
  return new NextRequest(url.toString(), { method: 'GET' })
}

// ─── 공통 auth mock 세팅 ─────────────────────────────────────────────────────

function setupAuthMocks() {
  mockRequireAuth.mockResolvedValue({ userId: TEST_USER_ID })

  const mockOrg: Partial<Organization> = {
    id: TEST_ORG_ID,
    name: 'Test Skills Route Org',
    slug: TEST_ORG_SLUG,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  mockAssertOrgAccess.mockResolvedValue({
    org: mockOrg as Organization,
    role: 'OWNER' as OrgRole,
  })

  mockResolveProjectIds.mockResolvedValue([TEST_PROJECT_ID])
}

// ─── 테스트 suite ─────────────────────────────────────────────────────────────

describe.skipIf(!DB_AVAILABLE)(
  'GET /api/orgs/:orgSlug/dashboard/skills — contract',
  () => {
    beforeAll(async () => {
      await setupSupportingRecords()
      await seedSkillCallFixture({
        projectId: TEST_PROJECT_ID,
        sessionId: TEST_SESSION_ID,
        userId: TEST_USER_ID,
        day: FIXTURE_DAY,
      })
    })

    afterAll(async () => {
      await cleanupSkillCallFixture({ projectId: TEST_PROJECT_ID })
      await teardownSupportingRecords()
    })

    // ── 정상 응답 및 callCount 정확성 ──────────────────────────────────────

    it('fixture 기대치 (bar=1, baz=1, qux=1, whitespace-ok=1) 를 모두 반환한다', async () => {
      setupAuthMocks()

      const req = makeRequest()
      const res = await GET(req, { params: Promise.resolve({ orgSlug: TEST_ORG_SLUG }) })

      expect(res.status).toBe(200)

      const body = (await res.json()) as { skills: SkillStat[] }
      expect(body).toHaveProperty('skills')

      const actual: Record<string, number> = {}
      for (const skill of body.skills) {
        actual[skill.skillName] = skill.callCount
      }

      // 기대치 키 전체 존재 + callCount 일치
      for (const [name, count] of Object.entries(EXPECTED_SKILL_COUNTS)) {
        expect(actual[name], `${name} callCount`).toBe(count)
      }
    })

    // ── 정렬 순서 (callCount DESC, skillName ASC) ─────────────────────────

    it('동일 callCount(=1) 항목은 skillName ASC (알파벳 순) 으로 정렬된다', async () => {
      setupAuthMocks()

      const req = makeRequest()
      const res = await GET(req, { params: Promise.resolve({ orgSlug: TEST_ORG_SLUG }) })

      expect(res.status).toBe(200)

      const body = (await res.json()) as { skills: SkillStat[] }
      const names = body.skills.map((s) => s.skillName)

      // 모든 callCount = 1 이므로 tie-break 로 skillName ASC 가 적용됨.
      // 알파벳 순: bar < baz < qux < whitespace-ok
      const expectedOrder = ['bar', 'baz', 'qux', 'whitespace-ok']

      // fixture 항목들의 상대 순서가 알파벳 순인지 확인
      const fixtureNames = names.filter((n) => n in EXPECTED_SKILL_COUNTS)
      expect(fixtureNames).toEqual(expectedOrder)
    })

    // ── 추가 필드 형식 확인 ──────────────────────────────────────────────

    it('각 skill 항목은 callCount, sessionCount, userCount, lastUsedAt 필드를 포함한다', async () => {
      setupAuthMocks()

      const req = makeRequest()
      const res = await GET(req, { params: Promise.resolve({ orgSlug: TEST_ORG_SLUG }) })

      expect(res.status).toBe(200)

      const body = (await res.json()) as { skills: SkillStat[] }
      expect(body.skills.length).toBeGreaterThan(0)

      for (const skill of body.skills) {
        expect(typeof skill.skillName).toBe('string')
        expect(typeof skill.callCount).toBe('number')
        expect(typeof skill.sessionCount).toBe('number')
        expect(typeof skill.userCount).toBe('number')
        expect(typeof skill.lastUsedAt).toBe('string')
      }
    })

    // ── 빈 projectIds 조기 반환 ──────────────────────────────────────────

    it('projectIds 가 빈 배열이면 빈 skills 배열을 반환한다', async () => {
      mockRequireAuth.mockResolvedValue({ userId: TEST_USER_ID })

      const mockOrg: Partial<Organization> = {
        id: TEST_ORG_ID,
        name: 'Test Skills Route Org',
        slug: TEST_ORG_SLUG,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockAssertOrgAccess.mockResolvedValue({
        org: mockOrg as Organization,
        role: 'OWNER' as OrgRole,
      })
      mockResolveProjectIds.mockResolvedValue([]) // 빈 배열

      const req = makeRequest()
      const res = await GET(req, { params: Promise.resolve({ orgSlug: TEST_ORG_SLUG }) })

      expect(res.status).toBe(200)
      const body = (await res.json()) as { skills: SkillStat[] }
      expect(body.skills).toEqual([])
    })

    // ── 인증 실패 → mock 이 NextResponse 반환 시 그대로 전달 ─────────────

    it('requireAuth 가 NextResponse 를 반환하면 route 가 그대로 401 응답한다', async () => {
      mockRequireAuth.mockResolvedValue(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      )

      const req = makeRequest()
      const res = await GET(req, { params: Promise.resolve({ orgSlug: TEST_ORG_SLUG }) })

      expect(res.status).toBe(401)
    })
  },
)
