import { NextResponse } from 'next/server'
import { UpdateProjectSchema } from '@argos/shared'
import { requireAuth } from '@/lib/server/auth-helper'
import { handleRouteError } from '@/lib/server/error-helper'
import {
  getProjectForUser,
  updateProjectForUser,
} from '@/lib/server/project-actions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/projects/:projectId
export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const { userId } = auth

    const { projectId } = await params

    const result = await getProjectForUser(projectId, userId)

    if (result.kind === 'not_found') {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    if (result.kind === 'forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ project: result.project })
  } catch (err) {
    return handleRouteError(err)
  }
}

// PATCH /api/projects/:projectId
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const { userId } = auth

    const { projectId } = await params
    const body = await req.json()
    const input = UpdateProjectSchema.parse(body)

    const result = await updateProjectForUser(projectId, userId, input)

    if (result.kind === 'not_found') {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Project not found' } },
        { status: 404 }
      )
    }
    if (result.kind === 'forbidden') {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Forbidden' } },
        { status: 403 }
      )
    }
    if (result.kind === 'name_conflict') {
      return NextResponse.json(
        {
          error: {
            code: 'PROJECT_NAME_CONFLICT',
            message: '이미 같은 이름의 프로젝트가 있습니다.',
          },
        },
        { status: 409 }
      )
    }

    return NextResponse.json({ project: result.project })
  } catch (err) {
    return handleRouteError(err)
  }
}
