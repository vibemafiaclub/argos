import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import bcrypt from 'bcryptjs'
import { createHash } from 'crypto'
import { db } from '@/db'
import { signJwt } from '@/lib/jwt'
import { authMiddleware } from '@/middleware/auth'
import { LoginRequestSchema, RegisterRequestSchema } from '@argos/shared'

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
