import type { Organization, OrgRole } from '@prisma/client'
import { db } from './db'

interface ProjectAccessResult {
  orgId: string
}

export type OrgAccessResult =
  | { kind: 'ok'; org: Organization; role: OrgRole }
  | { kind: 'not-found' }
  | { kind: 'forbidden' }

/**
 * org 멤버십 확인 (orgId 기반)
 */
export async function assertOrgAccess(
  orgId: string,
  userId: string
): Promise<OrgAccessResult> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    include: {
      memberships: {
        where: { userId },
        select: { role: true },
        take: 1,
      },
    },
  })

  if (!org) {
    return { kind: 'not-found' }
  }

  if (org.memberships.length === 0) {
    return { kind: 'forbidden' }
  }

  const { memberships, ...orgWithoutMemberships } = org
  return {
    kind: 'ok',
    org: orgWithoutMemberships as Organization,
    role: memberships[0].role,
  }
}

/**
 * org 멤버십 확인 (slug 기반)
 */
export async function assertOrgAccessBySlug(
  orgSlug: string,
  userId: string
): Promise<OrgAccessResult> {
  const org = await db.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true },
  })

  if (!org) {
    return { kind: 'not-found' }
  }

  return assertOrgAccess(org.id, userId)
}

/**
 * 프로젝트 접근 권한 확인.
 * - OWNER/MANAGER: org 멤버이면 project 무조건 접근 가능.
 * - MEMBER/VIEWER: org 멤버 + project_members에 명시적으로 등록된 경우에만 접근 가능.
 */
export async function assertProjectAccess(
  projectId: string,
  userId: string
): Promise<ProjectAccessResult> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
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

  if (!project) {
    throw new Error('Project not found')
  }

  const orgMembership = project.organization.memberships[0]
  if (!orgMembership) {
    throw new Error('Forbidden')
  }

  // OWNER/MANAGER는 project_members 상관없이 접근 가능
  if (orgMembership.role === 'OWNER' || orgMembership.role === 'MANAGER') {
    return { orgId: project.orgId }
  }

  // MEMBER/VIEWER는 project_members에 등록된 경우에만 접근 가능
  if (project.members.length === 0) {
    throw new Error('Forbidden')
  }

  return { orgId: project.orgId }
}

interface DateRange {
  from: Date
  to: Date
}

/**
 * from/to string → Date 파싱 (기본값: 최근 30일)
 */
export function parseDateRange(from?: string, to?: string): DateRange {
  const now = new Date()
  const defaultFrom = new Date(now)
  defaultFrom.setDate(defaultFrom.getDate() - 30)

  let fromDate: Date
  let toDate: Date

  if (from) {
    fromDate = new Date(from)
    if (isNaN(fromDate.getTime())) {
      fromDate = defaultFrom
    }
  } else {
    fromDate = defaultFrom
  }

  if (to) {
    toDate = new Date(to)
    if (isNaN(toDate.getTime())) {
      toDate = now
    } else {
      // "2026-04-16" → UTC 00:00:00 이므로 해당 날짜의 끝(23:59:59.999)으로 보정
      toDate.setUTCHours(23, 59, 59, 999)
    }
  } else {
    toDate = now
  }

  // from > to 검증
  if (fromDate > toDate) {
    const temp = fromDate
    fromDate = toDate
    toDate = temp
  }

  return { from: fromDate, to: toDate }
}

export interface PaginationParams {
  page: number
  pageSize: number
  skip: number
  take: number
}

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100
const MIN_PAGE_SIZE = 10

/**
 * ?page=&pageSize= 쿼리스트링 파싱 (기본 page=1, pageSize=50, pageSize는 [10,100]으로 clamp)
 */
export function parsePagination(
  pageQuery?: string | null,
  pageSizeQuery?: string | null
): PaginationParams {
  const parsedPage = Number(pageQuery)
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? Math.floor(parsedPage) : 1

  const parsedSize = Number(pageSizeQuery)
  const rawSize = Number.isFinite(parsedSize) && parsedSize > 0 ? Math.floor(parsedSize) : DEFAULT_PAGE_SIZE
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, rawSize))

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  }
}
