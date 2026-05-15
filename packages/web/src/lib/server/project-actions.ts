import 'server-only'

import { Prisma } from '@prisma/client'
import { db } from './db'

export interface ProjectListItem {
  id: string
  orgId: string
  orgName: string
  name: string
  slug: string
}

export interface ProjectDetail {
  id: string
  orgId: string
  name: string
  slug: string
  createdAt: Date
}

/**
 * 특정 유저가 접근 가능한 모든 org의 프로젝트 목록을 반환한다.
 * - OWNER/MANAGER인 org: 해당 org의 모든 프로젝트
 * - MEMBER/VIEWER인 org: project_members에 등록된 프로젝트만
 *
 * GET /api/projects 와 dashboard 서버 컴포넌트에서 공유.
 */
export async function getProjectsForUser(
  userId: string
): Promise<ProjectListItem[]> {
  const orgMemberships = await db.orgMembership.findMany({
    where: { userId },
    select: { orgId: true, role: true },
  })

  const adminOrgIds = orgMemberships
    .filter((m) => m.role === 'OWNER' || m.role === 'MANAGER')
    .map((m) => m.orgId)

  const memberOrgIds = orgMemberships
    .filter((m) => m.role === 'MEMBER' || m.role === 'VIEWER')
    .map((m) => m.orgId)

  const [adminProjects, memberProjects] = await Promise.all([
    adminOrgIds.length > 0
      ? db.project.findMany({
          where: { orgId: { in: adminOrgIds } },
          include: { organization: true },
        })
      : [],
    memberOrgIds.length > 0
      ? db.project.findMany({
          where: {
            orgId: { in: memberOrgIds },
            members: { some: { userId } },
          },
          include: { organization: true },
        })
      : [],
  ])

  return [...adminProjects, ...memberProjects].map((p) => ({
    id: p.id,
    orgId: p.orgId,
    orgName: p.organization.name,
    name: p.name,
    slug: p.slug,
  }))
}

export type GetProjectForUserResult =
  | { kind: 'ok'; project: ProjectDetail }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }

/**
 * 특정 유저가 접근 가능한 프로젝트 1건을 반환한다.
 * - OWNER/MANAGER: org 멤버이면 접근 가능
 * - MEMBER/VIEWER: org 멤버 + project_members 등록 필요
 */
export async function getProjectForUser(
  projectId: string,
  userId: string
): Promise<GetProjectForUserResult> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      orgId: true,
      name: true,
      slug: true,
      createdAt: true,
      members: {
        where: { userId },
        select: { userId: true },
        take: 1,
      },
      organization: {
        select: {
          memberships: {
            where: { userId },
            select: { id: true, role: true },
            take: 1,
          },
        },
      },
    },
  })

  if (!project) {
    return { kind: 'not_found' }
  }

  const orgMembership = project.organization.memberships[0]
  if (!orgMembership) {
    return { kind: 'forbidden' }
  }

  const isAdmin = orgMembership.role === 'OWNER' || orgMembership.role === 'MANAGER'
  if (!isAdmin && project.members.length === 0) {
    return { kind: 'forbidden' }
  }

  return {
    kind: 'ok',
    project: {
      id: project.id,
      orgId: project.orgId,
      name: project.name,
      slug: project.slug,
      createdAt: project.createdAt,
    },
  }
}

export type UpdateProjectForUserResult =
  | { kind: 'ok'; project: ProjectDetail }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'name_conflict' }

export async function updateProjectForUser(
  projectId: string,
  userId: string,
  input: { name: string }
): Promise<UpdateProjectForUserResult> {
  const existing = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      orgId: true,
      members: {
        where: { userId },
        select: { userId: true },
        take: 1,
      },
      organization: {
        select: {
          memberships: {
            where: { userId },
            select: { id: true, role: true },
            take: 1,
          },
        },
      },
    },
  })

  if (!existing) {
    return { kind: 'not_found' }
  }

  const orgMembership = existing.organization.memberships[0]
  if (!orgMembership) {
    return { kind: 'forbidden' }
  }

  const isAdmin = orgMembership.role === 'OWNER' || orgMembership.role === 'MANAGER'
  if (!isAdmin && existing.members.length === 0) {
    return { kind: 'forbidden' }
  }

  const duplicate = await db.project.findFirst({
    where: {
      orgId: existing.orgId,
      name: input.name,
      NOT: { id: projectId },
    },
    select: { id: true },
  })

  if (duplicate) {
    return { kind: 'name_conflict' }
  }

  const updated = await db.project.update({
    where: { id: projectId },
    data: { name: input.name },
    select: {
      id: true,
      orgId: true,
      name: true,
      slug: true,
      createdAt: true,
    },
  })

  return {
    kind: 'ok',
    project: updated,
  }
}

export type TransferProjectForUserResult =
  | { kind: 'ok'; project: ProjectDetail & { orgSlug: string } }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'slug_conflict' }
  | { kind: 'same_org'; project: ProjectDetail & { orgSlug: string } }

export async function transferProjectForUser(
  projectId: string,
  userId: string,
  input: { targetOrgSlug: string }
): Promise<TransferProjectForUserResult> {
  const { targetOrgSlug } = input

  // 1. 출발 project + org membership 조회
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      orgId: true,
      name: true,
      slug: true,
      createdAt: true,
      organization: {
        select: {
          id: true,
          slug: true,
          memberships: {
            where: { userId },
            select: { role: true },
            take: 1,
          },
        },
      },
    },
  })

  if (!project) {
    return { kind: 'not_found' }
  }

  const sourceMembership = project.organization.memberships[0]
  if (sourceMembership?.role !== 'OWNER') {
    return { kind: 'forbidden' }
  }

  // 2. 대상 org 조회
  const targetOrg = await db.organization.findUnique({
    where: { slug: targetOrgSlug },
    select: {
      id: true,
      slug: true,
      memberships: {
        where: { userId },
        select: { role: true },
        take: 1,
      },
    },
  })

  if (!targetOrg) {
    return { kind: 'not_found' }
  }

  const targetMembership = targetOrg.memberships[0]
  if (targetMembership?.role !== 'OWNER') {
    return { kind: 'forbidden' }
  }

  // 3. same_org 조기 반환 (트랜잭션 skip, ProjectMember 보존)
  if (project.orgId === targetOrg.id) {
    return {
      kind: 'same_org',
      project: {
        id: project.id,
        orgId: project.orgId,
        name: project.name,
        slug: project.slug,
        createdAt: project.createdAt,
        orgSlug: project.organization.slug,
      },
    }
  }

  // 4. 트랜잭션: 내부 권한 재검증 + ProjectMember 삭제 + Project.orgId 갱신
  const FORBIDDEN_RACE = Symbol('forbidden_race')
  try {
    const updated = await db.$transaction(async (tx) => {
      const sourceM = await tx.orgMembership.findUnique({
        where: { userId_orgId: { userId, orgId: project.orgId } },
        select: { role: true },
      })
      const targetM = await tx.orgMembership.findUnique({
        where: { userId_orgId: { userId, orgId: targetOrg.id } },
        select: { role: true },
      })
      if (sourceM?.role !== 'OWNER' || targetM?.role !== 'OWNER') {
        // race: 검증 후 강등됨 → forbidden 으로 매핑
        const e = Object.assign(new Error('forbidden_race'), {
          __forbiddenRace: FORBIDDEN_RACE,
        })
        throw e
      }
      await tx.projectMember.deleteMany({ where: { projectId } })
      return tx.project.update({
        where: { id: projectId },
        data: { orgId: targetOrg.id },
        select: { id: true, orgId: true, name: true, slug: true, createdAt: true },
      })
    })
    return { kind: 'ok', project: { ...updated, orgSlug: targetOrg.slug } }
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err as Error & { __forbiddenRace?: symbol }).__forbiddenRace ===
        FORBIDDEN_RACE
    )
      return { kind: 'forbidden' }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      const target = err.meta?.target as string[] | string | undefined
      const targetStr = (
        Array.isArray(target) ? target.join(',') : (target ?? '')
      ).toLowerCase()
      if (
        (targetStr.includes('orgid') || targetStr.includes('org_id')) &&
        targetStr.includes('slug')
      ) {
        return { kind: 'slug_conflict' }
      }
    }
    throw err
  }
}
