import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireAdmin } from '@/lib/server/admin-auth'
import { handleRouteError } from '@/lib/server/error-helper'
import { createPasswordResetLink } from '@/lib/server/password-reset'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CreatePasswordResetLinkSchema = z.object({
  userId: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req)
  if (unauthorized) return unauthorized

  try {
    const input = CreatePasswordResetLinkSchema.parse(await req.json())
    const result = await createPasswordResetLink({
      userId: input.userId,
      origin: req.nextUrl.origin,
    })

    if (result.status === 'user_not_found') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    return handleRouteError(err)
  }
}
