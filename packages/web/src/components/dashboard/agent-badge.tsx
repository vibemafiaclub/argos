import { cn } from '@/lib/utils'
import type { AgentSource } from '@argos/shared'

const META: Record<AgentSource, { label: string; dot: string }> = {
  CLAUDE: { label: 'Claude Code', dot: 'bg-orange-500' },
  CODEX: { label: 'Codex', dot: 'bg-emerald-500' },
}

/**
 * 세션 출처(에이전트) 배지. 작은 점 + 라벨의 subtle pill.
 * 목록에서는 Codex 만 표시(Claude 는 기본값이라 생략)하고, 상세 헤더에서는 항상 표시하는 식으로 사용.
 */
export function AgentBadge({ agent, className }: { agent: AgentSource; className?: string }) {
  const meta = META[agent] ?? META.CLAUDE
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}
