import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/server/db'
import { requireAuth } from '@/lib/server/auth-helper'
import { handleRouteError } from '@/lib/server/error-helper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CLAUDE_PLANS = ['FREE', 'PRO', 'MAX', 'TEAM', 'ENTERPRISE'] as const

const UpdateMeSchema = z.object({
  claudePlan: z.enum(CLAUDE_PLANS).nullable().optional(),
})

// GET /api/auth/me
export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const { userId } = auth

    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        claudePlan: user.claudePlan ?? null,
        createdAt: user.createdAt,
      },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}

// PATCH /api/auth/me
export async function PATCH(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const { userId } = auth

    const body = await req.json()
    const data = UpdateMeSchema.parse(body)

    const user = await db.user.update({
      where: { id: userId },
      data: {
        ...(data.claudePlan !== undefined && { claudePlan: data.claudePlan }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        claudePlan: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ user: { ...user, claudePlan: user.claudePlan ?? null } })
  } catch (err) {
    return handleRouteError(err)
  }
}
