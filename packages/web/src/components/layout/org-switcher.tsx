'use client'

import { useParams, useRouter } from 'next/navigation'
import { PlusIcon } from 'lucide-react'
import { useOrgs } from '@/hooks/use-orgs'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

const AVATAR_TONES = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'] as const

function toneFor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length]
}

function OrgAvatar({
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

const CREATE_ORG_VALUE = '__create_org__'

export function OrgSwitcher({
  onCreateClick,
}: {
  onCreateClick?: () => void
}) {
  const params = useParams()
  const router = useRouter()
  const orgSlug = params.orgSlug as string | undefined
  const { data, isLoading } = useOrgs()

  if (isLoading) return <SwitcherSkeleton />

  const orgs = data?.orgs ?? []
  const current = orgs.find((o) => o.slug === orgSlug)

  const handleChange = (value: string | null) => {
    if (!value) return
    if (value === CREATE_ORG_VALUE) {
      onCreateClick?.()
      return
    }
    if (value !== orgSlug) router.push(`/dashboard/${value}`)
  }

  return (
    <Select value={orgSlug ?? ''} onValueChange={handleChange}>
      <SelectTrigger className="flex !h-auto w-full items-center gap-2.5 rounded-lg border-0 bg-card px-2.5 py-2 text-left ring-1 ring-foreground/10 transition-colors hover:bg-card-elevated dark:bg-card dark:hover:bg-card-elevated">
        {current ? (
          <>
            <OrgAvatar name={current.name} id={current.id} size="md" />
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="w-full truncate text-sm font-semibold text-foreground">
                {current.name}
              </span>
              <span className="w-full truncate text-xs text-muted-foreground">
                {current.role.toLowerCase()}
              </span>
            </div>
          </>
        ) : (
          <span className="flex-1 text-sm text-muted-foreground">
            Select organization
          </span>
        )}
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} sideOffset={6} className="p-1">
        <SelectGroup className="p-0">
          {orgs.map((o) => (
            <SelectItem
              key={o.id}
              value={o.slug}
              className="gap-2.5 rounded-md px-2 py-1.5 pr-8"
            >
              <OrgAvatar name={o.name} id={o.id} size="sm" />
              <span className="truncate text-sm">{o.name}</span>
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup
          className={cn(
            'p-0',
            orgs.length > 0 && 'mt-1 border-t border-border pt-1'
          )}
        >
          <SelectItem
            value={CREATE_ORG_VALUE}
            className="gap-2.5 rounded-md px-2 py-1.5 pr-8 text-muted-foreground"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <PlusIcon className="size-3.5" />
            </span>
            <span className="truncate text-sm">Create organization</span>
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
