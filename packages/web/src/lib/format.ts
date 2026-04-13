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
