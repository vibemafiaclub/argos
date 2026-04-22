'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface WeekNavigatorProps {
  currentIsoKey: string  // e.g. "2026-W16"
  label: string          // e.g. "2026-W16 (4/13~4/19)"
  isCurrent: boolean     // 오늘이 포함된 주
}

/** "YYYY-Www" → 직전/다음 주 ISO key 계산 */
function shiftWeek(iso: string, offset: number): string | null {
  const m = iso.match(/^(\d{4})-W(\d{1,2})$/)
  if (!m) return null
  const year = parseInt(m[1], 10)
  const week = parseInt(m[2], 10)

  // 간단한 접근: ISO week를 ms로 환산하지 않고, jan4 기반으로 ±offset 주 이동
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const cur = new Date(jan4.getTime() + (week - 1 + offset) * 7 * 24 * 60 * 60 * 1000)

  // ISO week year + week 재계산
  const tmp = new Date(cur.getTime())
  // ISO week: Thursday가 속한 해가 week year
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7))
  const isoYear = tmp.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const isoWeek = Math.ceil(((tmp.getTime() - yearStart.getTime()) / (24 * 60 * 60 * 1000) + 1) / 7)
  return `${isoYear}-W${String(isoWeek).padStart(2, '0')}`
}

export function WeekNavigator({ currentIsoKey, label, isCurrent }: WeekNavigatorProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const buildHref = (targetIso: string | null) => {
    if (!targetIso) return pathname
    const params = new URLSearchParams(searchParams.toString())
    params.set('week', targetIso)
    return `${pathname}?${params.toString()}`
  }

  const prevIso = shiftWeek(currentIsoKey, -1)
  const nextIso = shiftWeek(currentIsoKey, 1)

  return (
    <div className="flex items-center gap-2">
      <Link
        href={buildHref(prevIso)}
        aria-label="이전 주"
        className={cn(buttonVariants({ variant: 'outline', size: 'icon-sm' }))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Link>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted">
        <span className="text-sm font-medium tabular-nums">{label}</span>
        {isCurrent && (
          <span className="text-xs px-1.5 py-0.5 rounded-sm bg-brand-subtle text-brand font-medium">
            진행 중
          </span>
        )}
      </div>
      <Link
        href={buildHref(nextIso)}
        aria-label="다음 주"
        className={cn(buttonVariants({ variant: 'outline', size: 'icon-sm' }))}
      >
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  )
}
