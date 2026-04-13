'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { subDays, format } from 'date-fns'
import { Suspense } from 'react'

function DateRangePickerContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const currentFrom = searchParams.get('from')
  const currentTo = searchParams.get('to')

  const today = new Date()
  const thirtyDaysAgo = subDays(today, 30)

  const defaultFrom = currentFrom || format(thirtyDaysAgo, 'yyyy-MM-dd')
  const defaultTo = currentTo || format(today, 'yyyy-MM-dd')

  const handlePreset = (days: number) => {
    const to = format(today, 'yyyy-MM-dd')
    const from = format(subDays(today, days), 'yyyy-MM-dd')

    const newParams = new URLSearchParams(searchParams.toString())
    newParams.set('from', from)
    newParams.set('to', to)

    router.push(`?${newParams.toString()}`)
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-600">Date Range:</span>
      <div className="flex gap-1">
        <button
          onClick={() => handlePreset(7)}
          className="px-3 py-1 text-sm rounded-md hover:bg-gray-100 border"
        >
          7 days
        </button>
        <button
          onClick={() => handlePreset(30)}
          className="px-3 py-1 text-sm rounded-md hover:bg-gray-100 border"
        >
          30 days
        </button>
        <button
          onClick={() => handlePreset(90)}
          className="px-3 py-1 text-sm rounded-md hover:bg-gray-100 border"
        >
          90 days
        </button>
      </div>
      <span className="text-sm text-gray-500">
        {defaultFrom} to {defaultTo}
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
