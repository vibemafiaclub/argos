import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/auth-helper'
import { handleRouteError } from '@/lib/server/error-helper'
import { getProjectsForUser } from '@/lib/server/project-actions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/projects
export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const { userId } = auth

    const projects = await getProjectsForUser(userId)
    return NextResponse.json({ projects })
  } catch (err) {
    return handleRouteError(err)
  }
}
