import { NextResponse } from 'next/server'
import { z } from 'zod'

import {
  ADMIN_SESSION_COOKIE,
  adminCookieOptions,
  createAdminSessionCookieValue,
  verifyAdminCredentials,
} from '@/lib/server/admin-auth'
import { handleRouteError } from '@/lib/server/error-helper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const AdminLoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

export async function POST(req: Request) {
  try {
    const input = AdminLoginSchema.parse(await req.json())
    if (!(await verifyAdminCredentials(input))) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
    }

    const res = NextResponse.json({ ok: true })
    res.cookies.set(
      ADMIN_SESSION_COOKIE,
      createAdminSessionCookieValue(),
      adminCookieOptions()
    )
    return res
  } catch (err) {
    return handleRouteError(err)
  }
}
