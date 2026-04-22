import 'server-only'

import { NextResponse } from 'next/server'
import type { Organization, OrgRole } from '@prisma/client'
import { db } from './db'
import {
  assertOrgAccess,
  assertOrgAccessBySlug,
  assertProjectAccess,
} from './dashboard'

/**
 * Dashboard 라우트용 공통 헬퍼.
 * assertProjectAccess를 호출하고, 실패 시 NextResponse를 반환한다.
 * 성공 시 { orgId } 반환.
 *
 * 사용 패턴:
 *   const access = await assertProjectAccessOrResponse(projectId, userId)
 *   if (access instanceof NextResponse) return access
 *   const { orgId } = access
 */
export async function assertProjectAccessOrResponse(
  projectId: string,
  userId: string
): Promise<{ orgId: string } | NextResponse> {
  try {
    return await assertProjectAccess(projectId, userId)
  } catch (err) {
    const message = (err as Error).message
    if (message === 'Project not found') {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
}

/**
 * assertOrgAccess를 호출하고, 실패 시 NextResponse를 반환한다.
 */
export async function assertOrgAccessOrResponse(
  orgId: string,
  userId: string
): Promise<{ org: Organization; role: OrgRole } | NextResponse> {
  const result = await assertOrgAccess(orgId, userId)
  if (result.kind === 'not-found') {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  }
  if (result.kind === 'forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return { org: result.org, role: result.role }
}

/**
 * assertOrgAccessBySlug를 호출하고, 실패 시 NextResponse를 반환한다.
 */
export async function assertOrgAccessBySlugOrResponse(
  orgSlug: string,
  userId: string
): Promise<{ org: Organization; role: OrgRole } | NextResponse> {
  const result = await assertOrgAccessBySlug(orgSlug, userId)
  if (result.kind === 'not-found') {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  }
  if (result.kind === 'forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return { org: result.org, role: result.role }
}

/**
 * org-scoped dashboard 라우트용 공통 헬퍼.
 *
 * - projectId 미지정: org 내 모든 project id를 반환
 * - projectId 지정:
 *     - 해당 project가 존재하지 않거나 다른 org 에 속하면 404 NextResponse
 *     - 속하면 [projectId] 만 반환
 */
export async function resolveOrgScopedProjectIds(
  orgId: string,
  projectIdParam: string | null,
): Promise<string[] | NextResponse> {
  if (projectIdParam) {
    const project = await db.project.findUnique({
      where: { id: projectIdParam },
      select: { id: true, orgId: true },
    })
    if (!project || project.orgId !== orgId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    return [project.id]
  }
  const projects = await db.project.findMany({
    where: { orgId },
    select: { id: true },
  })
  return projects.map((p) => p.id)
}
