import {
  startOfISOWeek,
  format,
  getISOWeek,
  getISOWeekYear,
} from 'date-fns'

// weekly-report.ts 에서 추출한 순수 week 유틸.
// weekly-report.ts 는 `import 'server-only'` 라 vitest 에서 직접 import 할 수 없어
// 결정적 로직만 이 모듈로 분리했다 (동작 변경 없음 — week-range.test.ts 가 고정).

export interface WeekRange {
  start: Date  // Monday 00:00 UTC
  end: Date    // Sunday 23:59:59.999 UTC
  isoKey: string
}

function toUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0, 0, 0, 0,
  ))
}

function formatIsoKey(date: Date): string {
  const year = getISOWeekYear(date)
  const week = getISOWeek(date)
  return `${year}-W${String(week).padStart(2, '0')}`
}

export function formatWeekLabel(start: Date, end: Date): string {
  const isoKey = formatIsoKey(start)
  const startLabel = format(start, 'M/d')
  const endLabel = format(end, 'M/d')
  return `${isoKey} (${startLabel}~${endLabel})`
}

/** 날짜가 속한 ISO week의 월요일 00:00 UTC와 일요일 23:59:59.999 UTC */
export function getWeekRangeForDate(date: Date): WeekRange {
  // startOfISOWeek는 local time 기준이므로 UTC midnight으로 정규화
  const monday = toUtcMidnight(startOfISOWeek(date))
  const end = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)
  return {
    start: monday,
    end,
    isoKey: formatIsoKey(monday),
  }
}

/** "2026-W16" → WeekRange. 유효하지 않으면 null */
export function parseWeekParam(iso: string): WeekRange | null {
  const m = iso.match(/^(\d{4})-W(\d{1,2})$/)
  if (!m) return null
  const year = parseInt(m[1], 10)
  const week = parseInt(m[2], 10)
  if (week < 1 || week > 53) return null

  // ISO 8601: week 1 = year-01-04를 포함하는 주
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const weekRepresentative = new Date(jan4.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000)
  return getWeekRangeForDate(weekRepresentative)
}
