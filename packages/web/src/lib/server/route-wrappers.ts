import 'server-only'

import { NextResponse } from 'next/server'
import type { Organization, OrgRole } from '@prisma/client'
import { requireAuth } from './auth-helper'
import { assertOrgAccessBySlugOrResponse } from './dashboard-route-helper'
import { handleRouteError } from './error-helper'

export type RouteParams = Record<string, string>

export type RouteContext<TParams extends RouteParams = RouteParams> = {
  params: Promise<TParams>
}

export type AuthContext = {
  userId: string
}

export type OrgAuthContext = AuthContext & {
  orgSlug: string
  org: Organization
  role: OrgRole
}

type RouteResult = Response | NextResponse

export type AuthenticatedRouteHandler<
  TContext extends object = object,
  TAuthContext extends AuthContext = AuthContext,
> = (
  req: Request,
  context: TContext,
  auth: TAuthContext,
) => RouteResult | Promise<RouteResult>

export function withAuth<TContext extends object>(
  handler: AuthenticatedRouteHandler<TContext, AuthContext>,
) {
  return async function authenticatedRoute(
    req: Request,
    context: TContext,
  ): Promise<RouteResult> {
    try {
      const auth = await requireAuth(req)
      if (auth instanceof NextResponse) return auth

      return await handler(req, context, auth)
    } catch (err) {
      return handleRouteError(err)
    }
  }
}

export function withOrgAuth<TParams extends RouteParams & { orgSlug: string }>(
  handler: AuthenticatedRouteHandler<RouteContext<TParams>, OrgAuthContext>,
) {
  return async function orgAuthenticatedRoute(
    req: Request,
    context: RouteContext<TParams>,
  ): Promise<RouteResult> {
    try {
      const auth = await requireAuth(req)
      if (auth instanceof NextResponse) return auth

      const params = await context.params
      const access = await assertOrgAccessBySlugOrResponse(params.orgSlug, auth.userId)
      if (access instanceof NextResponse) return access

      return await handler(req, context, {
        userId: auth.userId,
        orgSlug: params.orgSlug,
        org: access.org,
        role: access.role,
      })
    } catch (err) {
      return handleRouteError(err)
    }
  }
}
