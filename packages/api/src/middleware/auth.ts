import { Context, Next } from 'hono'
import { createHash } from 'crypto'
import { db } from '@/db'
import { verifyJwt } from '@/lib/jwt'

type Variables = {
  userId: string
}

export async function authMiddleware(c: Context<{ Variables: Variables }>, next: Next) {
  const authHeader = c.req.header('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const token = authHeader.substring(7)

  // 1. JWT 검증
  const payload = await verifyJwt(token)
  if (!payload) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  // 2. tokenHash 계산 (SHA-256)
  const tokenHash = createHash('sha256').update(token).digest('hex')

  // 3. DB에서 CliToken 조회
  let cliToken
  try {
    cliToken = await db.cliToken.findUnique({ where: { tokenHash } })
  } catch {
    return c.json({ error: 'Internal server error' }, 500)
  }

  // 4. revocation 체크
  if (!cliToken || cliToken.revokedAt) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  // 5. lastUsedAt 업데이트 (fire-and-forget)
  db.cliToken.update({
    where: { tokenHash },
    data: { lastUsedAt: new Date() }
  }).catch(() => {}) // 에러 무시

  // 6. userId를 context에 저장
  c.set('userId', payload.sub)

  await next()
}
