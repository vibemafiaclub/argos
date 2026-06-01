import { NextResponse } from 'next/server'
import { TransferProjectSchema } from '@argos/shared'
import type { TransferProjectResponse } from '@argos/shared'
import { requireAuth } from '@/lib/server/auth-helper'
import { handleRouteError } from '@/lib/server/error-helper'
import { transferProjectForUser } from '@/lib/server/project-actions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/projects/:projectId/transfer
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const { userId } = auth

    const { projectId } = await params
    const body = await req.json()
    const input = TransferProjectSchema.parse(body)

    const result = await transferProjectForUser(projectId, userId, input)

    if (result.kind === 'not_found') {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Project or target organization not found' } },
        { status: 404 }
      )
    }
    if (result.kind === 'forbidden') {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'You must be an OWNER of both the source and target organization' } },
        { status: 403 }
      )
    }
    if (result.kind === 'slug_conflict') {
      return NextResponse.json(
        {
          error: {
            code: 'PROJECT_SLUG_CONFLICT',
            message: '대상 org 에 같은 이름(slug)의 프로젝트가 이미 있습니다. 한쪽 이름을 먼저 변경한 뒤 다시 시도하세요.',
          },
        },
        { status: 409 }
      )
    }

    // kind === 'ok' | 'same_org' — both return 200 with the current project state
    const { project } = result
    const response = {
      project: {
        id: project.id,
        orgId: project.orgId,
        orgSlug: project.orgSlug,
        name: project.name,
        slug: project.slug,
        createdAt: project.createdAt instanceof Date
          ? project.createdAt.toISOString()
          : project.createdAt,
      },
    } satisfies TransferProjectResponse

    return NextResponse.json(response)
  } catch (err) {
    return handleRouteError(err)
  }
}
