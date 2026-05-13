import 'server-only'

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
