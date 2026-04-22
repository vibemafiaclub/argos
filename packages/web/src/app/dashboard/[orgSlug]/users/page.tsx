'use client'

import { Suspense } from 'react'
import { useParams, useSearchParams, useRouter, usePathname } from 'next/navigation'
import { subDays, format } from 'date-fns'
import { DateRangePicker } from '@/components/dashboard/date-range-picker'
import { useDashboardUsers } from '@/hooks/use-dashboard-users'
import { formatTokens, formatCost } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/ui/pagination'
import { cn } from '@/lib/utils'

const DEFAULT_PAGE_SIZE = 50

function UsersContent({
  orgSlug,
  projectId,
}: {
  orgSlug: string
  projectId: string | undefined
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const today = new Date()
  const sevenDaysAgo = subDays(today, 7)

  const from = searchParams.get('from') || format(sevenDaysAgo, 'yyyy-MM-dd')
  const to = searchParams.get('to') || format(today, 'yyyy-MM-dd')
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const pageSize = Number(searchParams.get('pageSize')) || DEFAULT_PAGE_SIZE

  const { data, isLoading, error, refetch, isPlaceholderData } =
    useDashboardUsers(orgSlug, {
      projectId,
      from,
      to,
      page,
      pageSize,
    })

  const setQuery = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) params.delete(key)
      else params.set(key, value)
    }
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-10 w-96" />
        </div>
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
          <div className="space-y-0">
            <Skeleton className="h-12 w-full" />
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Users</h1>
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              재시도
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const total = data?.total ?? 0
  const items = data?.items ?? []
  const isOverflowPage = items.length === 0 && total > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <h1 className="text-2xl font-semibold">Users</h1>
        <DateRangePicker />
      </div>

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        <div className="relative overflow-x-auto">
          <table
            className={cn(
              'w-full transition-opacity',
              isPlaceholderData && 'opacity-60',
            )}
          >
            <thead className="bg-muted/40 border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="text-left py-3 px-4 font-medium whitespace-nowrap">User</th>
                <th className="text-right py-3 px-4 font-medium whitespace-nowrap">Sessions</th>
                <th className="text-right py-3 px-4 font-medium whitespace-nowrap">Input Tokens</th>
                <th className="text-right py-3 px-4 font-medium whitespace-nowrap">Output Tokens</th>
                <th className="text-right py-3 px-4 font-medium whitespace-nowrap">Cost</th>
                <th className="text-right py-3 px-4 font-medium whitespace-nowrap">Skills</th>
                <th className="text-right py-3 px-4 font-medium whitespace-nowrap">Agents</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {isOverflowPage ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <p className="text-sm text-muted-foreground mb-3">
                      이 페이지엔 데이터가 없습니다.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setQuery({ page: null })}
                    >
                      첫 페이지로
                    </Button>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    No user data yet
                  </td>
                </tr>
              ) : (
                items.map((user) => (
                  <tr key={user.userId} className="border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors">
                    <td className="py-3 px-4">{user.name}</td>
                    <td className="text-right py-3 px-4 tabular-nums">{user.sessionCount}</td>
                    <td className="text-right py-3 px-4 tabular-nums">{formatTokens(user.inputTokens)}</td>
                    <td className="text-right py-3 px-4 tabular-nums">{formatTokens(user.outputTokens)}</td>
                    <td className="text-right py-3 px-4 tabular-nums">{formatCost(user.estimatedCostUsd)}</td>
                    <td className="text-right py-3 px-4 tabular-nums">{user.skillCalls}</td>
                    <td className="text-right py-3 px-4 tabular-nums">{user.agentCalls}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {isPlaceholderData && (
            <div className="pointer-events-none absolute right-3 top-3 h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
          )}
        </div>

        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={(p) =>
            setQuery({ page: p === 1 ? null : String(p) })
          }
          onPageSizeChange={(size) =>
            setQuery({
              pageSize: size === DEFAULT_PAGE_SIZE ? null : String(size),
              page: null,
            })
          }
        />
      </div>
    </div>
  )
}

export default function OrgUsersPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const orgSlug = params.orgSlug as string
  const projectId = searchParams.get('projectId') ?? undefined

  return (
    <Suspense fallback={<Skeleton className="h-screen w-full" />}>
      <UsersContent orgSlug={orgSlug} projectId={projectId} />
    </Suspense>
  )
}
