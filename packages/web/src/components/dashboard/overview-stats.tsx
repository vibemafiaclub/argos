'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { formatTokens, formatCost } from '@/lib/format'

interface OverviewStatsProps {
  periodLabel: string
  sessions: number
  turns: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  estimatedCostUsd: number
  rangeSelector?: React.ReactNode
}

interface StatTileProps {
  label: string
  value: string
  valueTone?: 'default' | 'success'
  subtext?: string
}

function StatTile({ label, value, valueTone = 'default', subtext }: StatTileProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-card-elevated ring-1 ring-foreground/5 px-4 py-3 min-w-[130px]">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          'text-2xl font-semibold leading-tight tabular-nums',
          valueTone === 'success' ? 'text-success' : 'text-foreground',
        )}
      >
        {value}
      </span>
      {subtext && (
        <span className="text-[10px] text-muted-foreground">{subtext}</span>
      )}
    </div>
  )
}

export function OverviewStats({
  periodLabel,
  sessions,
  turns,
  inputTokens,
  outputTokens,
  cacheReadTokens,
  cacheCreationTokens,
  estimatedCostUsd,
  rangeSelector,
}: OverviewStatsProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold">Overview</h2>
          <span className="text-xs text-muted-foreground">{periodLabel}</span>
        </div>
        {rangeSelector}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
        <StatTile label="Sessions" value={sessions.toLocaleString()} />
        <StatTile label="Turns" value={turns.toLocaleString()} />
        <StatTile label="Input" value={formatTokens(inputTokens)} />
        <StatTile label="Output" value={formatTokens(outputTokens)} />
        <StatTile label="Cache Read" value={formatTokens(cacheReadTokens)} />
        <StatTile label="Cache Create" value={formatTokens(cacheCreationTokens)} />
        <StatTile
          label="Est. Cost"
          value={formatCost(estimatedCostUsd)}
          valueTone="success"
          subtext="billable (input+output+cache)"
        />
      </div>

      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="mt-4 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className={cn('inline-block transition-transform', expanded && 'rotate-90')}>▸</span>
        <span className="font-medium text-foreground">What do these numbers mean?</span>
        <span>— {expanded ? 'click to collapse' : 'click to expand'}</span>
      </button>

      {expanded && (
        <div className="mt-3 text-xs text-muted-foreground space-y-2 leading-relaxed">
          <p>
            <span className="font-medium text-foreground">Sessions</span> — 팀원들이 시작한 Claude Code 세션 수.
          </p>
          <p>
            <span className="font-medium text-foreground">Turns</span> — Human → Assistant 한 번의 왕복(Stop 이벤트 기준).
          </p>
          <p>
            <span className="font-medium text-foreground">Input / Output</span> — Claude에 보낸 토큰과 Claude가 응답으로 쓴 토큰의 합계.
          </p>
          <p>
            <span className="font-medium text-foreground">Cache Create</span> — 재사용을 위해 저장된 토큰(예: CLAUDE.md).
            한 번 지불하면 이후 읽기는 훨씬 저렴해집니다.
          </p>
          <p>
            <span className="font-medium text-foreground">Cache Read</span> — 캐시에서 재사용된 토큰. 일반 input 대비 약 ~10× 싸므로 이 숫자가 높은 건 좋은 신호입니다.
          </p>
          <p>
            <span className="font-medium text-foreground">Est. Cost</span> — 모델별 공식 단가로 계산한 추정 청구액 (USD).
          </p>
        </div>
      )}
    </div>
  )
}
