import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  createAdminImpersonationToken,
  requireAdmin,
} from '@/lib/server/admin-auth'
import { db } from '@/lib/server/db'
import { handleRouteError } from '@/lib/server/error-helper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CreateImpersonationSchema = z.object({
  userId: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req)
  if (unauthorized) return unauthorized

  try {
    const input = CreateImpersonationSchema.parse(await req.json())
    const user = await db.user.findUnique({
      where: { id: input.userId },
      select: { id: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const token = createAdminImpersonationToken(user.id)
    return NextResponse.json({
      impersonationUrl: `/admin/impersonate?token=${encodeURIComponent(token)}`,
      dashboardUrl: 'https://argos-ai.xyz/dashboard',
    })
  } catch (err) {
    return handleRouteError(err)
  }
}
