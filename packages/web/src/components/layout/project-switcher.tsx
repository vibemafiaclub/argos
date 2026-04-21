'use client'

import { useParams, useRouter } from 'next/navigation'
import { useProjects } from '@/hooks/use-projects'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

const AVATAR_TONES = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'] as const

function toneFor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length]
}

function ProjectAvatar({
  name,
  id,
  size = 'sm',
}: {
  name: string
  id: string
  size?: 'sm' | 'md'
}) {
  const tone = toneFor(id)
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md font-semibold text-background',
        size === 'sm' ? 'size-6 text-[11px]' : 'size-8 text-xs'
      )}
      style={{ backgroundColor: `var(--color-${tone})` }}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function SwitcherSkeleton() {
  return (
    <div className="flex w-full items-center gap-2.5 rounded-lg bg-card px-2.5 py-2 ring-1 ring-foreground/10">
      <Skeleton className="size-8 rounded-md" />
      <div className="flex flex-1 flex-col gap-1.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-2.5 w-16" />
      </div>
    </div>
  )
}

export function ProjectSwitcher() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.projectId as string
  const { data, isLoading } = useProjects()

  if (isLoading) return <SwitcherSkeleton />

  const projects = data?.projects ?? []
  if (projects.length === 0) return null

  const current = projects.find((p) => p.id === projectId)

  const grouped = projects.reduce<
    Record<string, { orgName: string; items: typeof projects }>
  >((acc, p) => {
    if (!acc[p.orgId]) acc[p.orgId] = { orgName: p.orgName, items: [] }
    acc[p.orgId].items.push(p)
    return acc
  }, {})

  const handleChange = (value: string | null) => {
    if (value && value !== projectId) router.push(`/dashboard/${value}`)
  }

  const orgEntries = Object.entries(grouped)
  const singleOrg = orgEntries.length === 1

  return (
    <Select value={projectId} onValueChange={handleChange}>
      <SelectTrigger
        className="flex !h-auto w-full items-center gap-2.5 rounded-lg border-0 bg-card px-2.5 py-2 text-left ring-1 ring-foreground/10 transition-colors hover:bg-card-elevated dark:bg-card dark:hover:bg-card-elevated"
      >
        {current ? (
          <>
            <ProjectAvatar name={current.name} id={current.id} size="md" />
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="w-full truncate text-sm font-semibold text-foreground">
                {current.name}
              </span>
              {!singleOrg && (
                <span className="w-full truncate text-xs text-muted-foreground">
                  {current.orgName}
                </span>
              )}
            </div>
          </>
        ) : (
          <span className="flex-1 text-sm text-muted-foreground">
            Select project
          </span>
        )}
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} sideOffset={6} className="p-1">
        {orgEntries.map(([orgId, group], idx) => (
          <SelectGroup
            key={orgId}
            className={cn(
              'p-0',
              idx > 0 && 'mt-1 border-t border-border pt-1'
            )}
          >
            {!singleOrg && (
              <SelectLabel className="px-2 pt-1 pb-1 text-[10px] font-medium uppercase tracking-wide">
                {group.orgName}
              </SelectLabel>
            )}
            {group.items.map((p) => (
              <SelectItem
                key={p.id}
                value={p.id}
                className="gap-2.5 rounded-md px-2 py-1.5 pr-8"
              >
                <ProjectAvatar name={p.name} id={p.id} size="sm" />
                <span className="truncate text-sm">{p.name}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
