import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'crypto'
import { db } from '@/db'
import { signJwt } from '@/lib/jwt'
import { authMiddleware } from '@/middleware/auth'
import { LoginRequestSchema, RegisterRequestSchema } from '@argos/shared'
import { env } from '@/env'

type Variables = {
  userId: string
}

const auth = new Hono<{ Variables: Variables }>()

// POST /api/auth/register
auth.post('/register', zValidator('json', RegisterRequestSchema), async (c) => {
  const { email, password, name } = c.req.valid('json')

  // 이메일 중복 확인
  const existingUser = await db.user.findUnique({ where: { email } })
  if (existingUser) {
    return c.json({ error: 'Email already in use' }, 409)
  }

  // 비밀번호 해싱
  const passwordHash = await bcrypt.hash(password, 10)

  // User 생성
  const user = await db.user.create({
    data: { email, passwordHash, name }
  })

  // JWT 발급
  const token = await signJwt(user.id)

  // tokenHash 계산
  const tokenHash = createHash('sha256').update(token).digest('hex')

  // CliToken 생성
  await db.cliToken.create({
    data: {
      userId: user.id,
      tokenHash
    }
  })

  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt
    }
  }, 201)
})

// POST /api/auth/login
auth.post('/login', zValidator('json', LoginRequestSchema), async (c) => {
  const { email, password } = c.req.valid('json')

  // User 조회
  const user = await db.user.findUnique({ where: { email } })
  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  // 비밀번호 검증
  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  // JWT 발급
  const token = await signJwt(user.id)

  // tokenHash 계산
  const tokenHash = createHash('sha256').update(token).digest('hex')

  // CliToken 생성
  await db.cliToken.create({
    data: {
      userId: user.id,
      tokenHash
    }
  })

  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt
    }
  })
})

// POST /api/auth/logout
auth.post('/logout', authMiddleware, async (c) => {
  const authHeader = c.req.header('Authorization')
  const token = authHeader!.substring(7)
  const tokenHash = createHash('sha256').update(token).digest('hex')

  // CliToken revoke
  await db.cliToken.update({
    where: { tokenHash },
    data: { revokedAt: new Date() }
  })

  return c.json({ ok: true })
})

// POST /api/auth/cli-request — CLI가 브라우저 인증 시작 시 호출
auth.post('/cli-request', async (c) => {
  const state = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15분
  await db.cliAuthRequest.create({ data: { state, expiresAt } })
  const authUrl = `${env.WEB_URL}/cli-auth?state=${state}`
  return c.json({ state, authUrl })
})

// GET /api/auth/cli-poll — CLI가 승인 대기 시 polling
auth.get('/cli-poll', async (c) => {
  const state = c.req.query('state')
  if (!state) return c.json({ error: 'Missing state' }, 400)

  const req = await db.cliAuthRequest.findUnique({ where: { state } })
  if (!req) return c.json({ error: 'Not found' }, 404)
  if (new Date() > req.expiresAt) return c.json({ error: 'Expired' }, 410)
  if (req.denied) return c.json({ denied: true })
  if (!req.approved || !req.token) return c.json({ pending: true })

  return c.json({ token: req.token })
})

// POST /api/auth/cli-callback — 웹에서 사용자가 허용/거부 시 호출
auth.post('/cli-callback', authMiddleware, async (c) => {
  let body: { state: string; denied?: boolean }
  try {
    body = await c.req.json<{ state: string; denied?: boolean }>()
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }
  const { state, denied } = body
  const userId = c.get('userId')

  let req
  try {
    req = await db.cliAuthRequest.findUnique({ where: { state } })
  } catch {
    return c.json({ error: 'Internal server error' }, 500)
  }

  if (!req || new Date() > req.expiresAt) {
    return c.json({ error: 'Invalid or expired request' }, 400)
  }

  if (denied) {
    await db.cliAuthRequest.update({ where: { state }, data: { denied: true } }).catch(() => {})
    return c.json({ ok: true })
  }

  // 새 JWT 발급 및 CliToken 등록
  try {
    const token = await signJwt(userId)
    const tokenHash = createHash('sha256').update(token).digest('hex')
    await db.cliToken.create({ data: { userId, tokenHash } })
    await db.cliAuthRequest.update({ where: { state }, data: { approved: true, token } })
  } catch {
    return c.json({ error: 'Internal server error' }, 500)
  }

  return c.json({ ok: true })
})

// GET /api/auth/me
auth.get('/me', authMiddleware, async (c) => {
  const userId = c.get('userId') as string

  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt
    }
  })
})

export default auth
