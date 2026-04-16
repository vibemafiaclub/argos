import { format as dateFnsFormat } from 'date-fns'

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
 * Format a timestamp as relative time from a base timestamp.
 * Examples: "+0m", "+3m", "+1h 5m"
 */
export function formatRelativeTime(timestamp: string, baseTimestamp: string): string {
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
