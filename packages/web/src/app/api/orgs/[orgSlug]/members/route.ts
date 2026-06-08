import { NextResponse } from 'next/server'
import { db } from '@/lib/server/db'
import { withAuth, withOrgAuth } from '@/lib/server/route-wrappers'
import { canManageOrg, forbiddenByRole } from '@/lib/server/rbac'
import {
  getDailyRollupsForProjects,
  aggregateUserStats,
} from '@/lib/server/daily-rollup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/orgs/:orgSlug/members
// 멤버 목록(Manager+만). 역할 관리 UI에서 사용.
export const GET = withOrgAuth(async (_req, _context, { org, role }) => {
  if (!canManageOrg(role)) {
    return forbiddenByRole(role, 'MANAGER 이상')
  }

  const [memberships, projects] = await Promise.all([
    db.orgMembership.findMany({
      where: { orgId: org.id },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    db.project.findMany({
      where: { orgId: org.id },
      select: { id: true },
    }),
  ])

  // 최근 7일 유저별 비용 집계
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - 6) // 오늘 포함 7일
  from.setHours(0, 0, 0, 0)

  const projectIds = projects.map((p) => p.id)
  const rollups = await getDailyRollupsForProjects(projectIds, from, to)
  const userStatsMap = new Map(
    aggregateUserStats(rollups).map((u) => [u.userId, u.estimatedCostUsd])
  )

  return NextResponse.json({
    members: memberships.map((m) => ({
      membershipId: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      joinedAt: m.createdAt.toISOString(),
      sevenDayCostUsd: userStatsMap.get(m.user.id) ?? 0,
    })),
  })
})

// POST /api/orgs/:orgSlug/members
export const POST = withAuth<{ params: Promise<{ orgSlug: string }> }>(
  async (_req, { params }, { userId }) => {
    const { orgSlug } = await params

    // CLI 는 v0.1.13 미만에서 만들어진 project.json 에 orgSlug 가 없을 때
    // 같은 위치에 orgId 를 그대로 넣어 호출한다. slug 우선, 실패 시 id 로 조회.
    let org = await db.organization.findUnique({
      where: { slug: orgSlug },
      select: { id: true },
    })
    if (!org) {
      org = await db.organization.findUnique({
        where: { id: orgSlug },
        select: { id: true },
      })
    }

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // 이미 멤버인지 확인 (멱등성)
    const existingMembership = await db.orgMembership.findUnique({
      where: { userId_orgId: { userId, orgId: org.id } },
    })

    if (existingMembership) {
      return NextResponse.json({ ok: true })
    }

    // OrgMembership(MEMBER) 생성
    await db.orgMembership.create({
      data: {
        userId,
        orgId: org.id,
        role: 'MEMBER',
      },
    })

    return NextResponse.json({ ok: true }, { status: 201 })
  }
)
