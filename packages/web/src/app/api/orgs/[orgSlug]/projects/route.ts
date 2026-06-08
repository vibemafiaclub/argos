import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/server/db'
import { withOrgAuth } from '@/lib/server/route-wrappers'
import { generateUniqueProjectSlug } from '@/lib/server/slug'
import { canManageOrg, forbiddenByRole } from '@/lib/server/rbac'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(100),
})

// GET /api/orgs/:orgSlug/projects
export const GET = withOrgAuth(async (_req, _context, { userId, org, role }) => {
  const isAdmin = role === 'OWNER' || role === 'MANAGER'

  const projects = await db.project.findMany({
    where: {
      orgId: org.id,
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
})

// POST /api/orgs/:orgSlug/projects
export const POST = withOrgAuth(async (req, _context, { org, role }) => {
  // 프로젝트 생성은 Manager+ 권한.
  if (!canManageOrg(role)) {
    return forbiddenByRole(role, 'MANAGER 이상')
  }

  const body = await req.json()
  const { name } = CreateProjectSchema.parse(body)

  const slug = await generateUniqueProjectSlug(name, org.id)

  const project = await db.project.create({
    data: {
      orgId: org.id,
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
    where: { orgId: org.id },
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
})
