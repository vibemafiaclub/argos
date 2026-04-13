'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { subDays, format, differenceInDays } from 'date-fns'
import { Suspense } from 'react'
import { cn } from '@/lib/utils'

function DateRangePickerContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const currentFrom = searchParams.get('from')
  const currentTo = searchParams.get('to')

  const today = new Date()
  const thirtyDaysAgo = subDays(today, 30)

  const defaultFrom = currentFrom || format(thirtyDaysAgo, 'yyyy-MM-dd')
  const defaultTo = currentTo || format(today, 'yyyy-MM-dd')

  // Determine which preset is active
  const fromDate = new Date(defaultFrom)
  const toDate = new Date(defaultTo)
  const daysDiff = differenceInDays(toDate, fromDate)

  const isToday = format(toDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
  const activePreset = isToday ? (
    daysDiff === 6 ? 7 :
    daysDiff === 29 ? 30 :
    daysDiff === 89 ? 90 : null
  ) : null

  const handlePreset = (days: number) => {
    const to = format(today, 'yyyy-MM-dd')
    const from = format(subDays(today, days), 'yyyy-MM-dd')

    const newParams = new URLSearchParams(searchParams.toString())
    newParams.set('from', from)
    newParams.set('to', to)

    router.push(`?${newParams.toString()}`)
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <span className="text-sm text-gray-600 hidden sm:inline">최근:</span>
      <div className="flex gap-1">
        <button
          onClick={() => handlePreset(7)}
          className={cn(
            "px-3 py-1 text-sm rounded-md border transition-colors",
            activePreset === 7
              ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
              : "bg-white hover:bg-gray-100 border-gray-300"
          )}
        >
          7일
        </button>
        <button
          onClick={() => handlePreset(30)}
          className={cn(
            "px-3 py-1 text-sm rounded-md border transition-colors",
            activePreset === 30
              ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
              : "bg-white hover:bg-gray-100 border-gray-300"
          )}
        >
          30일
        </button>
        <button
          onClick={() => handlePreset(90)}
          className={cn(
            "px-3 py-1 text-sm rounded-md border transition-colors",
            activePreset === 90
              ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
              : "bg-white hover:bg-gray-100 border-gray-300"
          )}
        >
          90일
        </button>
      </div>
      <span className="text-xs sm:text-sm text-gray-500">
        {format(fromDate, 'MMM d')} ~ {format(toDate, 'MMM d')}
      </span>
    </div>
  )
}

export function DateRangePicker() {
  return (
    <Suspense fallback={<div className="h-8 w-64 bg-gray-100 animate-pulse rounded" />}>
      <DateRangePickerContent />
    </Suspense>
  )
}
