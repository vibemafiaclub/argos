import { NextResponse } from 'next/server'
import { db } from '@/lib/server/db'
import { requireAuth } from '@/lib/server/auth-helper'
import { handleRouteError } from '@/lib/server/error-helper'
import { assertOrgAccessBySlugOrResponse } from '@/lib/server/dashboard-route-helper'
import { canManageOrg, forbiddenByRole } from '@/lib/server/rbac'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/orgs/:orgSlug/members
// 멤버 목록(Manager+만). 역할 관리 UI에서 사용.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const { userId } = auth

    const { orgSlug } = await params

    const access = await assertOrgAccessBySlugOrResponse(orgSlug, userId)
    if (access instanceof NextResponse) return access

    if (!canManageOrg(access.role)) {
      return forbiddenByRole(access.role, 'MANAGER 이상')
    }

    const memberships = await db.orgMembership.findMany({
      where: { orgId: access.org.id },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
      members: memberships.map((m) => ({
        membershipId: m.id,
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
        joinedAt: m.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    return handleRouteError(err)
  }
}

// POST /api/orgs/:orgSlug/members
export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const { userId } = auth

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
  } catch (err) {
    return handleRouteError(err)
  }
}
