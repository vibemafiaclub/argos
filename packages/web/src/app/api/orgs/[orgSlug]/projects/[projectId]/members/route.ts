import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/server/db'
import { requireAuth } from '@/lib/server/auth-helper'
import { handleRouteError } from '@/lib/server/error-helper'
import { assertOrgAccessBySlugOrResponse } from '@/lib/server/dashboard-route-helper'
import { canManageOrg, forbiddenByRole } from '@/lib/server/rbac'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const AddMemberSchema = z.object({
  userId: z.string().min(1),
})

// GET /api/orgs/:orgSlug/projects/:projectId/members
// 프로젝트 멤버 목록과 org 전체 멤버 목록을 반환 (MANAGER+만)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string; projectId: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const { userId } = auth

    const { orgSlug, projectId } = await params

    const access = await assertOrgAccessBySlugOrResponse(orgSlug, userId)
    if (access instanceof NextResponse) return access

    if (!canManageOrg(access.role)) {
      return forbiddenByRole(access.role, 'MANAGER 이상')
    }

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, orgId: true, name: true },
    })

    if (!project || project.orgId !== access.org.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const [projectMembers, orgMembers] = await Promise.all([
      db.projectMember.findMany({
        where: { projectId },
        select: {
          userId: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      db.orgMembership.findMany({
        where: { orgId: access.org.id },
        select: {
          role: true,
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    const memberUserIds = new Set(projectMembers.map((m) => m.userId))

    return NextResponse.json({
      projectId,
      projectName: project.name,
      members: projectMembers.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
        addedAt: m.createdAt.toISOString(),
      })),
      // org 멤버 중 아직 프로젝트 멤버가 아닌 사람들 (추가 가능 후보)
      candidates: orgMembers
        .filter((m) => !memberUserIds.has(m.user.id))
        .map((m) => ({
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
          avatarUrl: m.user.avatarUrl,
          orgRole: m.role,
        })),
    })
  } catch (err) {
    return handleRouteError(err)
  }
}

// POST /api/orgs/:orgSlug/projects/:projectId/members
// 프로젝트에 멤버 추가 (MANAGER+만)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string; projectId: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const { userId } = auth

    const { orgSlug, projectId } = await params

    const access = await assertOrgAccessBySlugOrResponse(orgSlug, userId)
    if (access instanceof NextResponse) return access

    if (!canManageOrg(access.role)) {
      return forbiddenByRole(access.role, 'MANAGER 이상')
    }

    const body = await req.json()
    const { userId: targetUserId } = AddMemberSchema.parse(body)

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, orgId: true },
    })

    if (!project || project.orgId !== access.org.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // 대상 유저가 org 멤버인지 확인
    const orgMembership = await db.orgMembership.findUnique({
      where: { userId_orgId: { userId: targetUserId, orgId: access.org.id } },
      select: { id: true },
    })

    if (!orgMembership) {
      return NextResponse.json(
        { error: 'User is not a member of this organization' },
        { status: 400 }
      )
    }

    // 이미 프로젝트 멤버인 경우 멱등성 처리
    await db.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      create: { projectId, userId: targetUserId },
      update: {},
    })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    return handleRouteError(err)
  }
}
