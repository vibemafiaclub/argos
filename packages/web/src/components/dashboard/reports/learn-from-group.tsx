import { Trophy, Layers, Wand2, MessageSquare } from 'lucide-react'
import { TopUserCard } from './top-user-card'
import type { WeeklyTopUsers } from '@/types/reports'

interface LearnFromGroupProps {
  topUsers: WeeklyTopUsers
}

export function LearnFromGroup({ topUsers }: LearnFromGroupProps) {
  const { learnFrom, eligibleUserCount } = topUsers

  if (eligibleUserCount < 1) {
    return (
      <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-6">
        <div className="flex items-center gap-2 mb-2 text-brand">
          <Trophy className="h-4 w-4" />
          <span className="text-sm font-medium">배울 대상</span>
        </div>
        <p className="text-sm text-muted-foreground">
          랭킹 대상 사용자가 부족합니다 (주간 세션 3+ 필요).
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 text-brand">
        <Trophy className="h-4 w-4" />
        <h3 className="text-sm font-medium">배울 대상</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <TopUserCard
          icon={<Trophy className="h-4 w-4" />}
          label="스킬 활용 최다"
          leader={learnFrom.skillUsage}
          formatValue={(n) => `${n.toLocaleString()}회`}
          description="재사용 자산(스킬)을 가장 많이 호출"
        />
        <TopUserCard
          icon={<Layers className="h-4 w-4" />}
          label="스킬 다양성"
          leader={learnFrom.skillDiversity}
          formatValue={(n) => `${n}종`}
          description="고유 스킬을 가장 넓게 활용"
        />
        <TopUserCard
          icon={<Wand2 className="h-4 w-4" />}
          label="위임 최다"
          leader={learnFrom.delegation}
          formatValue={(n) => `${n.toLocaleString()}회`}
          description="Task/Agent 도구로 서브에이전트 위임"
        />
        <TopUserCard
          icon={<MessageSquare className="h-4 w-4" />}
          label="간결 세션 마스터"
          leader={learnFrom.conciseSession}
          formatValue={(n) => `${n.toFixed(1)}회`}
          description="정상 종료 세션에서 평균 프롬프트 수 최소"
          emptyMessage="유효 세션 부족"
        />
      </div>
    </div>
  )
}
