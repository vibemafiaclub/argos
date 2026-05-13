import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/server/db'
import { requireAuth } from '@/lib/server/auth-helper'
import { handleRouteError } from '@/lib/server/error-helper'
import { assertOrgAccessBySlugOrResponse } from '@/lib/server/dashboard-route-helper'
import { generateUniqueProjectSlug } from '@/lib/server/slug'
import { canManageOrg, forbiddenByRole } from '@/lib/server/rbac'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(100),
})

// GET /api/orgs/:orgSlug/projects
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

    const isAdmin = access.role === 'OWNER' || access.role === 'MANAGER'

    const projects = await db.project.findMany({
      where: {
        orgId: access.org.id,
        // MEMBER/VIEWER는 project_members에 등록된 프로젝트만 조회
        ...(isAdmin ? {} : { members: { some: { userId } } }),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ projects })
  } catch (err) {
    return handleRouteError(err)
  }
}

// POST /api/orgs/:orgSlug/projects
export async function POST(
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

    // 프로젝트 생성은 Manager+ 권한.
    if (!canManageOrg(access.role)) {
      return forbiddenByRole(access.role, 'MANAGER 이상')
    }

    const body = await req.json()
    const { name } = CreateProjectSchema.parse(body)

    const slug = await generateUniqueProjectSlug(name, access.org.id)

    const project = await db.project.create({
      data: {
        orgId: access.org.id,
        name,
        slug,
      },
      select: {
        id: true,
        orgId: true,
        slug: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    // 신규 프로젝트에 모든 org 멤버를 자동으로 추가.
    // 이후 MANAGER가 설정 페이지에서 특정 멤버의 접근을 제거할 수 있음.
    const orgMemberships = await db.orgMembership.findMany({
      where: { orgId: access.org.id },
      select: { userId: true },
    })

    if (orgMemberships.length > 0) {
      await db.projectMember.createMany({
        data: orgMemberships.map((m) => ({
          projectId: project.id,
          userId: m.userId,
        })),
        skipDuplicates: true,
      })
    }

    return NextResponse.json({ project }, { status: 201 })
  } catch (err) {
    return handleRouteError(err)
  }
}
