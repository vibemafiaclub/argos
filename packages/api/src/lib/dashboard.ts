import { db } from '@/db'

interface ProjectAccessResult {
  orgId: string
}

/**
 * 프로젝트의 org 멤버십 확인 (없으면 throw)
 */
export async function assertProjectAccess(
  projectId: string,
  userId: string
): Promise<ProjectAccessResult> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { orgId: true }
  })

  if (!project) {
    throw new Error('Project not found')
  }

  const membership = await db.orgMembership.findUnique({
    where: {
      userId_orgId: {
        userId,
        orgId: project.orgId
      }
    }
  })

  if (!membership) {
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
