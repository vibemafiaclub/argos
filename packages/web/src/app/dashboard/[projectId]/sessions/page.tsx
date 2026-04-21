'use client'

import { use, Suspense, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { subDays, format } from 'date-fns'
import { Trash2 } from 'lucide-react'
import { DateRangePicker } from '@/components/dashboard/date-range-picker'
import {
  useDashboardSessions,
  useDeleteSession,
  type SessionSort,
} from '@/hooks/use-dashboard-sessions'
import { formatTokens, formatCost, formatDateTimeFull } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/ui/pagination'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import type { SessionItem } from '@argos/shared'

const DEFAULT_PAGE_SIZE = 50

const SORT_OPTIONS: { value: SessionSort; label: string }[] = [
  { value: 'recent', label: 'Most recent' },
  { value: 'cost', label: 'Highest cost' },
]

function SortPicker({
  value,
  onChange,
}: {
  value: SessionSort
  onChange: (next: SessionSort) => void
}) {
  return (
    <div className="inline-flex rounded-lg bg-card ring-1 ring-border p-0.5">
      {SORT_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-3 py-1 text-xs font-medium rounded-md transition-colors',
            value === opt.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function SessionsContent({ projectId }: { projectId: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const today = new Date()
  const sevenDaysAgo = subDays(today, 7)

  const from = searchParams.get('from') || format(sevenDaysAgo, 'yyyy-MM-dd')
  const to = searchParams.get('to') || format(today, 'yyyy-MM-dd')
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const pageSize = Number(searchParams.get('pageSize')) || DEFAULT_PAGE_SIZE
  const sort: SessionSort = searchParams.get('sort') === 'cost' ? 'cost' : 'recent'

  const { data, isLoading, error, refetch, isPlaceholderData } =
    useDashboardSessions(projectId, from, to, page, pageSize, sort)

  const [sessionToDelete, setSessionToDelete] = useState<SessionItem | null>(null)
  const deleteMutation = useDeleteSession(projectId)

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
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-96" />
        </div>
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
          <Skeleton className="h-12 w-full" />
          {[...Array(10)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Sessions</h1>
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

  const handleRowClick = (sessionId: string) => {
    router.push(`/dashboard/${projectId}/sessions/${sessionId}`)
  }

  const total = data?.total ?? 0
  const items = data?.items ?? []

  if (total === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <h1 className="text-2xl font-semibold">Sessions</h1>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <SortPicker
              value={sort}
              onChange={(next) =>
                setQuery({
                  sort: next === 'recent' ? null : next,
                  page: null,
                })
              }
            />
            <DateRangePicker />
          </div>
        </div>

        <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-12 text-center">
          <h2 className="text-lg font-medium mb-2">
            이 기간에 세션이 없습니다
          </h2>
          <p className="text-sm text-muted-foreground">
            날짜 범위를 변경해보세요.
          </p>
        </div>
      </div>
    )
  }

  const isOverflowPage = items.length === 0 && total > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <h1 className="text-2xl font-semibold">Sessions</h1>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <SortPicker
            value={sort}
            onChange={(next) =>
              setQuery({
                sort: next === 'recent' ? null : next,
                page: null,
              })
            }
          />
          <DateRangePicker />
        </div>
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
                <th className="text-left py-3 px-4 font-medium whitespace-nowrap">사용자</th>
                <th className="text-left py-3 px-4 font-medium">제목</th>
                <th className="text-right py-3 px-4 font-medium whitespace-nowrap">입력토큰</th>
                <th className="text-right py-3 px-4 font-medium whitespace-nowrap">출력토큰</th>
                <th className="text-right py-3 px-4 font-medium whitespace-nowrap">비용</th>
                <th className="text-left py-3 px-4 font-medium whitespace-nowrap">시간</th>
                <th className="w-10 py-3 px-2" aria-label="액션" />
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
              ) : (
                items.map((session) => (
                  <tr
                    key={session.id}
                    onClick={() => handleRowClick(session.id)}
                    className="group border-b border-border last:border-b-0 hover:bg-muted/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 whitespace-nowrap">{session.userName}</td>
                    <td className="py-3 px-4 max-w-md">
                      <div className="truncate">
                        {session.title ?? <span className="text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="text-right py-3 px-4 whitespace-nowrap tabular-nums">{formatTokens(session.inputTokens)}</td>
                    <td className="text-right py-3 px-4 whitespace-nowrap tabular-nums">{formatTokens(session.outputTokens)}</td>
                    <td className="text-right py-3 px-4 whitespace-nowrap tabular-nums">{formatCost(session.estimatedCostUsd)}</td>
                    <td className="py-3 px-4 whitespace-nowrap tabular-nums text-muted-foreground">
                      {formatDateTimeFull(session.startedAt)}
                    </td>
                    <td className="py-3 px-2 w-10">
                      <button
                        type="button"
                        aria-label="세션 삭제"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSessionToDelete(session)
                        }}
                        className={cn(
                          'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground',
                          'hover:bg-destructive/10 hover:text-destructive transition-colors',
                          'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100',
                        )}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
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

      <AlertDialog
        open={sessionToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setSessionToDelete(null)
            deleteMutation.reset()
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>세션을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {sessionToDelete?.title
                ? `"${sessionToDelete.title}" 세션과`
                : '이 세션과'}{' '}
              연관된 모든 메시지·사용량·이벤트가 함께 삭제됩니다. 이 작업은
              되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.isError && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>
                삭제에 실패했습니다. 잠시 후 다시 시도해주세요.
              </AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <Button
              variant="outline"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => {
                setSessionToDelete(null)
                deleteMutation.reset()
              }}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (!sessionToDelete) return
                deleteMutation.mutate(sessionToDelete.id, {
                  onSuccess: () => {
                    setSessionToDelete(null)
                  },
                })
              }}
            >
              {deleteMutation.isPending ? '삭제 중…' : '삭제'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function SessionsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = use(params)

  return (
    <Suspense fallback={<Skeleton className="h-screen w-full" />}>
      <SessionsContent projectId={projectId} />
    </Suspense>
  )
}
