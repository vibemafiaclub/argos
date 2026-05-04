import 'server-only'

import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'crypto'

import { db } from './db'

const PASSWORD_RESET_TOKEN_TTL_MS = 24 * 60 * 60 * 1000
const PASSWORD_RESET_TOKEN_PREFIX = 'argos_pwd_'

export type PasswordResetStatus =
  | {
      status: 'valid'
      user: {
        id: string
        email: string
        name: string
      }
      expiresAt: Date
    }
  | { status: 'not_found' | 'expired' | 'used' }

function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createPasswordResetLink(input: {
  userId: string
  origin: string
}): Promise<
  | {
      status: 'created'
      url: string
      path: string
      expiresAt: Date
    }
  | { status: 'user_not_found' }
> {
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true },
  })
  if (!user) return { status: 'user_not_found' }

  const token = PASSWORD_RESET_TOKEN_PREFIX + randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS)
  await db.passwordResetToken.create({
    data: {
      tokenHash: hashResetToken(token),
      userId: user.id,
      expiresAt,
    },
  })

  const path = `/reset-password/${token}`
  return {
    status: 'created',
    url: `${input.origin}${path}`,
    path,
    expiresAt,
  }
}

export async function getPasswordResetStatus(token: string): Promise<PasswordResetStatus> {
  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
    include: {
      user: {
        select: { id: true, email: true, name: true },
      },
    },
  })

  if (!record) return { status: 'not_found' }
  if (record.usedAt) return { status: 'used' }
  if (new Date() > record.expiresAt) return { status: 'expired' }

  return {
    status: 'valid',
    user: record.user,
    expiresAt: record.expiresAt,
  }
}

export async function resetPasswordWithToken(input: {
  token: string
  password: string
}): Promise<'success' | 'not_found' | 'expired' | 'used'> {
  const tokenHash = hashResetToken(input.token)
  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  })

  if (!record) return 'not_found'
  if (record.usedAt) return 'used'
  if (new Date() > record.expiresAt) return 'expired'

  const passwordHash = await bcrypt.hash(input.password, 10)
  const now = new Date()

  const result = await db.$transaction(async (tx) => {
    const consumed = await tx.passwordResetToken.updateMany({
      where: {
        id: record.id,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    })
    if (consumed.count === 0) {
      const latest = await tx.passwordResetToken.findUnique({
        where: { id: record.id },
        select: { expiresAt: true, usedAt: true },
      })
      if (!latest) return 'not_found' as const
      if (latest.usedAt) return 'used' as const
      if (now > latest.expiresAt) return 'expired' as const
      return 'used' as const
    }

    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    })
    await tx.cliToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: now },
    })

    return 'success' as const
  })

  return result
}
