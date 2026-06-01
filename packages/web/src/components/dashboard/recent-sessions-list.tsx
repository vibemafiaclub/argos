'use client'

import Link from 'next/link'
import { formatTokens, formatRelativeTime } from '@/lib/format'
import type { SessionItem } from '@argos/shared'

interface RecentSessionsListProps {
  sessions: SessionItem[]
  orgSlug: string
}

export function RecentSessionsList({ sessions, orgSlug }: RecentSessionsListProps) {
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        최근 세션이 없습니다
      </p>
    )
  }

  return (
    <ul className="space-y-1.5">
      {sessions.map(s => {
        const totalTokens = s.inputTokens + s.outputTokens
        return (
          <li key={s.id}>
            <Link
              href={`/dashboard/${orgSlug}/sessions/${s.id}`}
              className="block rounded-md hover:bg-muted/50 transition-colors px-2 py-2"
            >
              <div className="flex items-baseline justify-between gap-3 mb-0.5">
                <span className="text-sm font-medium truncate">
                  {s.title || '(untitled session)'}
                </span>
                <span className="text-[11px] shrink-0 text-muted-foreground tabular-nums">
                  {formatRelativeTime(s.startedAt)}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
                <span className="truncate">{s.userName}</span>
                <span>·</span>
                <span>{formatTokens(totalTokens)} tokens</span>
                <span>·</span>
                <span>{s.eventCount} events</span>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
