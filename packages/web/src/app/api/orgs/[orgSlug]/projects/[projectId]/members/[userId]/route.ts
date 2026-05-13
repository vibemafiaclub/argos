import { NextResponse } from 'next/server'
import { db } from '@/lib/server/db'
import { requireAuth } from '@/lib/server/auth-helper'
import { handleRouteError } from '@/lib/server/error-helper'
import { assertOrgAccessBySlugOrResponse } from '@/lib/server/dashboard-route-helper'
import { canManageOrg, forbiddenByRole } from '@/lib/server/rbac'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// DELETE /api/orgs/:orgSlug/projects/:projectId/members/:userId
// 프로젝트에서 멤버 제거 (MANAGER+만)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string; projectId: string; userId: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const { userId: requesterId } = auth

    const { orgSlug, projectId, userId: targetUserId } = await params

    const access = await assertOrgAccessBySlugOrResponse(orgSlug, requesterId)
    if (access instanceof NextResponse) return access

    if (!canManageOrg(access.role)) {
      return forbiddenByRole(access.role, 'MANAGER 이상')
    }

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, orgId: true },
    })

    if (!project || project.orgId !== access.org.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    await db.projectMember.deleteMany({
      where: { projectId, userId: targetUserId },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleRouteError(err)
  }
}
