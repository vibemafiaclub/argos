import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { db } from '@/db'
import { authMiddleware } from '@/middleware/auth'
import { CreateProjectSchema } from '@argos/shared'
import { generateUniqueProjectSlug, generateUniqueOrgSlug } from '@/lib/slug'

type Variables = {
  userId: string
}

const projects = new Hono<{ Variables: Variables }>()

// 모든 라우트에 auth 미들웨어 적용
projects.use('*', authMiddleware)

// POST /api/projects
projects.post('/', zValidator('json', CreateProjectSchema), async (c) => {
  const userId = c.get('userId') as string
  const { name, orgId: requestedOrgId } = c.req.valid('json')

  let orgId: string

  if (requestedOrgId) {
    // orgId가 제공된 경우: 해당 org 사용
    orgId = requestedOrgId
  } else {
    // orgId가 없는 경우: 현재 유저의 org 확인
    const memberships = await db.orgMembership.findMany({
      where: { userId }
    })

    if (memberships.length === 1) {
      // org가 1개면 그것 사용
      orgId = memberships[0].orgId
    } else {
      // org가 없으면 자동 생성
      const user = await db.user.findUnique({ where: { id: userId } })
      const orgName = user!.name
      const orgSlug = await generateUniqueOrgSlug(orgName)

      const newOrg = await db.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: { name: orgName, slug: orgSlug }
        })

        await tx.orgMembership.create({
          data: {
            userId,
            orgId: org.id,
            role: 'OWNER'
          }
        })

        return org
      })

      orgId = newOrg.id
    }
  }

  // slug 생성 (org 내에서 unique)
  const slug = await generateUniqueProjectSlug(name, orgId)

  // Project 생성
  const project = await db.project.create({
    data: {
      orgId,
      name,
      slug
    },
    include: { organization: true }
  })

  return c.json({
    projectId: project.id,
    orgId: project.orgId,
    orgName: project.organization.name,
    projectName: project.name,
    projectSlug: project.slug
  }, 201)
})

// GET /api/projects/:projectId
projects.get('/:projectId', async (c) => {
  const userId = c.get('userId') as string
  const projectId = c.req.param('projectId')

  // 프로젝트 조회
  const project = await db.project.findUnique({
    where: { id: projectId }
  })

  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }

  // org 멤버십 확인
  const membership = await db.orgMembership.findUnique({
    where: { userId_orgId: { userId, orgId: project.orgId } }
  })

  if (!membership) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  return c.json({
    project: {
      id: project.id,
      orgId: project.orgId,
      name: project.name,
      slug: project.slug,
      createdAt: project.createdAt
    }
  })
})

// GET /api/projects
projects.get('/', async (c) => {
  const userId = c.get('userId') as string

  // 현재 유저의 org 목록 조회
  const memberships = await db.orgMembership.findMany({
    where: { userId }
  })

  const orgIds = memberships.map(m => m.orgId)

  // 해당 org들의 프로젝트 목록
  const projectList = await db.project.findMany({
    where: { orgId: { in: orgIds } },
    include: { organization: true }
  })

  const projectsData = projectList.map(p => ({
    id: p.id,
    orgId: p.orgId,
    orgName: p.organization.name,
    name: p.name,
    slug: p.slug
  }))

  return c.json({ projects: projectsData })
})

export default projects
