import { format as dateFnsFormat, formatDistanceToNow } from 'date-fns'

export function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`
  }
  return n.toLocaleString()
}

export function formatCost(usd: number): string {
  if (usd >= 1) {
    return `$${usd.toFixed(2)}`
  }
  if (usd >= 0.01) {
    return `$${usd.toFixed(3)}`
  }
  return `$${usd.toFixed(4)}`
}

export function formatDate(s: string): string {
  try {
    const date = new Date(s)
    return dateFnsFormat(date, 'MMM d')
  } catch {
    return s
  }
}

/**
 * Format a timestamp as relative time.
 * - With `baseTimestamp`: offset from base (e.g. "+3m", "+1h 5m").
 * - Without: distance-to-now (e.g. "2 minutes ago").
 */
export function formatRelativeTime(timestamp: string): string
export function formatRelativeTime(timestamp: string, baseTimestamp: string): string
export function formatRelativeTime(timestamp: string, baseTimestamp?: string): string {
  if (baseTimestamp === undefined) {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true })
    } catch {
      return timestamp
    }
  }

  const timestampDate = new Date(timestamp)
  const baseDate = new Date(baseTimestamp)
  const diffMs = timestampDate.getTime() - baseDate.getTime()
  const totalMinutes = Math.floor(diffMs / 60000)

  if (totalMinutes < 60) {
    return `+${totalMinutes}m`
  }

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `+${hours}h ${minutes}m`
}

export function formatDuration(startedAt: string, endedAt?: string | null): string {
  const start = new Date(startedAt).getTime()
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  const diffMs = Math.max(0, end - start)

  if (diffMs < 1000) return '0s'

  const totalSeconds = Math.floor(diffMs / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`

  const totalMinutes = Math.floor(totalSeconds / 60)
  if (totalMinutes < 60) return `${totalMinutes}m`

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}
