'use client'

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

type PaginationProps = {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  pageSizeOptions?: number[]
  className?: string
  /** 페이지 수가 1 이하여도 count 라벨은 표시 (기본 true). false면 전체 숨김 */
  alwaysShowLabel?: boolean
}

/**
 * 1 … x-1 [x] x+1 … N 형태로 축약된 페이지 번호를 계산.
 * ellipsis는 -1로 표기.
 */
function getPageList(current: number, totalPages: number): (number | -1)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages: (number | -1)[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(totalPages - 1, current + 1)

  if (start > 2) pages.push(-1)
  for (let p = start; p <= end; p++) pages.push(p)
  if (end < totalPages - 1) pages.push(-1)

  pages.push(totalPages)
  return pages
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className,
  alwaysShowLabel = true,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const startIdx = total === 0 ? 0 : (safePage - 1) * pageSize + 1
  const endIdx = Math.min(safePage * pageSize, total)

  if (totalPages <= 1 && !alwaysShowLabel) return null

  const pageList = getPageList(safePage, totalPages)

  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-t border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="tabular-nums">
        {total === 0 ? (
          <span>결과 없음</span>
        ) : (
          <span>
            총 <span className="text-foreground font-medium">{total.toLocaleString()}</span>개 중{' '}
            <span className="text-foreground font-medium">
              {startIdx.toLocaleString()}–{endIdx.toLocaleString()}
            </span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span className="hidden sm:inline">페이지당</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                if (value) onPageSizeChange(Number(value))
              }}
            >
              <SelectTrigger size="sm" className="min-w-[60px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} className="p-1">
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)} className="px-2 py-1.5">
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onPageChange(safePage - 1)}
              disabled={safePage <= 1}
              aria-label="이전 페이지"
            >
              <ChevronLeftIcon />
            </Button>

            {/* 모바일: 현재 페이지 / 전체만 표시 */}
            <span className="px-2 tabular-nums sm:hidden">
              {safePage} / {totalPages}
            </span>

            {/* 데스크톱: 번호 리스트 */}
            <div className="hidden sm:flex items-center gap-0.5">
              {pageList.map((p, i) =>
                p === -1 ? (
                  <span
                    key={`ellipsis-${i}`}
                    className="px-1 text-muted-foreground select-none"
                  >
                    …
                  </span>
                ) : (
                  <Button
                    key={p}
                    variant={p === safePage ? 'default' : 'ghost'}
                    size="icon-sm"
                    onClick={() => onPageChange(p)}
                    className="tabular-nums"
                    aria-current={p === safePage ? 'page' : undefined}
                  >
                    {p}
                  </Button>
                ),
              )}
            </div>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onPageChange(safePage + 1)}
              disabled={safePage >= totalPages}
              aria-label="다음 페이지"
            >
              <ChevronRightIcon />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
