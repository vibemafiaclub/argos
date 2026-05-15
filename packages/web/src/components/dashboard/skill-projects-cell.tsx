'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import type { SkillProjectEntry, SkillStat } from '@argos/shared'
import { Popover } from '@/components/ui/popover'
import { formatLastUsed } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface SkillProjectsCellProps {
  /** invocations 내림차순 Top 5 project 목록 */
  projects: SkillStat['projects']
  /** Top 5 에 들지 못한 추가 project 수 (≥0) */
  additionalProjectCount: number
  /** URL 에 ?projectId= 가 있을 때 true — 비활성(disabled) 모드 */
  isProjectFiltered: boolean
  /** 부모(page)에서 주입하는 projectId 선택 핸들러 */
  onSelectProject: (projectId: string) => void
}

/**
 * skills 테이블 "Projects" 컬럼 셀.
 *
 * - projects.length === 0 → "—" (팝오버 없음)
 * - isProjectFiltered === true → 단일 project 이름만, 모든 interactive 요소 disabled
 * - 일반 모드 → inline project name buttons (클릭 시 onSelectProject) + 팝오버 트리거
 */
export function SkillProjectsCell({
  projects,
  additionalProjectCount,
  isProjectFiltered,
  onSelectProject,
}: SkillProjectsCellProps) {
  const [open, setOpen] = React.useState(false)

  // projects 없는 경우 — 빈 셀 (팝오버 없음)
  if (projects.length === 0) {
    return <span className="text-muted-foreground">—</span>
  }

  // isProjectFiltered === true — 단일 project, 비-interactive 텍스트만
  if (isProjectFiltered) {
    const project = projects[0]!
    return (
      <span className="text-sm text-muted-foreground">{project.projectName}</span>
    )
  }

  // 일반 모드
  const maxInvocations = projects[0]?.invocations ?? 1

  return (
    <span className="inline-flex items-center gap-1 max-w-[20rem]">
      {/* 1. inline 요약 텍스트 영역 — truncate 가 ellipsis 를 찍도록 block + inline children. */}
      <span className="block truncate min-w-0">
        {projects.map((project: SkillProjectEntry, index: number) => (
          <React.Fragment key={project.projectId}>
            <button
              type="button"
              onClick={() => onSelectProject(project.projectId)}
              aria-label={`Filter skills by project ${project.projectName}`}
              className="text-sm text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm cursor-pointer align-baseline"
            >
              {project.projectName}
            </button>
            {index < projects.length - 1 && (
              <span className="text-muted-foreground select-none">, </span>
            )}
          </React.Fragment>
        ))}
      </span>

      {/* 2. 팝오버 토글 affordance — inline project buttons 와 sibling (nested 아님) */}
      <Popover.Root open={open} onOpenChange={(value) => setOpen(value)} modal={false}>
        <Popover.Trigger
          openOnHover
          delay={300}
          closeDelay={150}
          aria-label="Show project breakdown"
          className={cn(
            'inline-flex items-center shrink-0 rounded-sm text-xs',
            'text-muted-foreground hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            'cursor-pointer',
          )}
        >
          {additionalProjectCount > 0 ? (
            <span className="whitespace-nowrap">(+{additionalProjectCount} more)</span>
          ) : (
            <ChevronDown size={14} aria-hidden="true" />
          )}
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Positioner sideOffset={6} side="bottom" align="start">
            <Popover.Popup className="w-72 p-0">
              <ProjectBreakdownPopup
                projects={projects}
                additionalProjectCount={additionalProjectCount}
                maxInvocations={maxInvocations}
                onSelectProject={(projectId) => {
                  setOpen(false)
                  onSelectProject(projectId)
                }}
              />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </span>
  )
}

// ---------------------------------------------------------------------------
// 팝오버 내부 — Top 5 분포 표 + additionalProjectCount 안내
// ---------------------------------------------------------------------------

interface ProjectBreakdownPopupProps {
  projects: SkillStat['projects']
  additionalProjectCount: number
  maxInvocations: number
  onSelectProject: (projectId: string) => void
}

function ProjectBreakdownPopup({
  projects,
  additionalProjectCount,
  maxInvocations,
  onSelectProject,
}: ProjectBreakdownPopupProps) {
  return (
    <div className="py-2">
      <p className="px-3 pb-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        Top Projects
      </p>
      <ul className="space-y-0.5">
        {projects.map((project: SkillProjectEntry) => {
          const barPct = maxInvocations > 0 ? (project.invocations / maxInvocations) * 100 : 0
          return (
            <li key={project.projectId}>
              <button
                type="button"
                onClick={() => onSelectProject(project.projectId)}
                aria-label={`Filter skills by project ${project.projectName}`}
                className={cn(
                  'w-full px-3 py-1.5 text-left',
                  'hover:bg-accent focus-visible:bg-accent',
                  'focus-visible:outline-none',
                  'cursor-pointer',
                )}
              >
                {/* project name + invocations count */}
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-xs font-medium truncate">{project.projectName}</span>
                  <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                    {project.invocations.toLocaleString()}
                  </span>
                </div>
                {/* invocations 바 */}
                <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/60"
                    style={{ width: `${barPct}%` }}
                  />
                </div>
                {/* last used */}
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Last used {formatLastUsed(project.lastUsedAt)}
                </p>
              </button>
            </li>
          )
        })}
      </ul>

      {additionalProjectCount > 0 && (
        <p className="px-3 pt-1.5 pb-0.5 text-[11px] text-muted-foreground border-t border-border mt-1">
          +{additionalProjectCount} more projects (use Drill-down to see all)
        </p>
      )}
    </div>
  )
}
