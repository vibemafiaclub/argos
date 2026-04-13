import { Context, Next } from 'hono'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { db } from '@/db'
import crypto from 'crypto'

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Bearer token is missing' } }, 401)
  }

  const token = authHeader.substring(7)

  try {
    // JWT 검증 (여기서는 skeleton이므로 간단히 구현)
    // 실제 구현에서는 jose를 사용하여 JWT를 검증해야 함
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    // CliToken revocation 체크
    const cliToken = await db.cliToken.findUnique({
      where: { tokenHash },
      include: { user: true }
    })

    if (!cliToken || cliToken.revokedAt) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Token is invalid or revoked' } }, 401)
    }

    // userId를 context에 저장
    c.set('userId', cliToken.userId)

    await next()
  } catch (error) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }, 401)
  }
}
