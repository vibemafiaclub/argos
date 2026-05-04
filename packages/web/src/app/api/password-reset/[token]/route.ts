import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { handleRouteError } from '@/lib/server/error-helper'
import {
  getPasswordResetStatus,
  resetPasswordWithToken,
} from '@/lib/server/password-reset'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ResetPasswordSchema = z
  .object({
    password: z.string().min(8),
    passwordConfirmation: z.string().min(8),
  })
  .refine((value) => value.password === value.passwordConfirmation, {
    path: ['passwordConfirmation'],
    message: 'Passwords do not match',
  })

function statusToResponse(status: 'not_found' | 'expired' | 'used') {
  if (status === 'not_found') {
    return NextResponse.json({ error: 'Reset link not found' }, { status: 404 })
  }
  if (status === 'expired') {
    return NextResponse.json({ error: 'Reset link expired' }, { status: 410 })
  }
  return NextResponse.json({ error: 'Reset link already used' }, { status: 410 })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const status = await getPasswordResetStatus(token)
    if (status.status !== 'valid') return statusToResponse(status.status)

    return NextResponse.json({
      user: status.user,
      expiresAt: status.expiresAt,
    })
  } catch (err) {
    return handleRouteError(err)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const input = ResetPasswordSchema.parse(await req.json())
    const result = await resetPasswordWithToken({
      token,
      password: input.password,
    })

    if (result !== 'success') return statusToResponse(result)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleRouteError(err)
  }
}
