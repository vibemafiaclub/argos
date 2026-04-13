import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '@/db'
import { authMiddleware } from '@/middleware/auth'
import { generateUniqueOrgSlug } from '@/lib/slug'

type Variables = {
  userId: string
}

const orgs = new Hono<{ Variables: Variables }>()

// 모든 라우트에 auth 미들웨어 적용
orgs.use('*', authMiddleware)

const CreateOrgSchema = z.object({
  name: z.string().min(1)
})

// POST /api/orgs
orgs.post('/', zValidator('json', CreateOrgSchema), async (c) => {
  const userId = c.get('userId') as string
  const { name } = c.req.valid('json')

  // slug 생성 (중복 방지)
  const slug = await generateUniqueOrgSlug(name)

  // 트랜잭션: Organization 생성 + OrgMembership(OWNER) 생성
  const org = await db.$transaction(async (tx) => {
    const newOrg = await tx.organization.create({
      data: { name, slug }
    })

    await tx.orgMembership.create({
      data: {
        userId,
        orgId: newOrg.id,
        role: 'OWNER'
      }
    })

    return newOrg
  })

  return c.json({
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug
    }
  }, 201)
})

// POST /api/orgs/:orgId/members
orgs.post('/:orgId/members', async (c) => {
  const userId = c.get('userId') as string
  const orgId = c.req.param('orgId')

  // 이미 멤버인지 확인 (멱등성)
  const existingMembership = await db.orgMembership.findUnique({
    where: { userId_orgId: { userId, orgId } }
  })

  if (existingMembership) {
    return c.json({ ok: true })
  }

  // OrgMembership(MEMBER) 생성
  await db.orgMembership.create({
    data: {
      userId,
      orgId,
      role: 'MEMBER'
    }
  })

  return c.json({ ok: true }, 201)
})

// GET /api/orgs
orgs.get('/', async (c) => {
  const userId = c.get('userId') as string

  const memberships = await db.orgMembership.findMany({
    where: { userId },
    include: { organization: true }
  })

  const orgs = memberships.map(m => ({
    id: m.organization.id,
    name: m.organization.name,
    slug: m.organization.slug,
    role: m.role
  }))

  return c.json({ orgs })
})

export default orgs
