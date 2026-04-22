'use client'

import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation'
import { useProjects } from '@/hooks/use-projects'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'

const ALL_PROJECTS_VALUE = '__all__'

function FilterSkeleton() {
  return <Skeleton className="h-9 w-40 rounded-lg" />
}

export function ProjectFilter() {
  const params = useParams()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  const orgSlug = params.orgSlug as string | undefined
  const currentProjectId = searchParams.get('projectId')

  const { data, isLoading } = useProjects(orgSlug ?? '')

  if (!orgSlug) return null
  if (isLoading) return <FilterSkeleton />

  const projects = data?.projects ?? []
  const current = currentProjectId
    ? projects.find((p) => p.id === currentProjectId)
    : null
  const label = current ? current.name : 'All projects'

  const handleChange = (value: string | null) => {
    if (!value) return
    const next = new URLSearchParams(searchParams.toString())
    if (value === ALL_PROJECTS_VALUE) {
      next.delete('projectId')
    } else {
      next.set('projectId', value)
    }
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }

  const selectValue = currentProjectId ?? ALL_PROJECTS_VALUE

  return (
    <Select value={selectValue} onValueChange={handleChange}>
      <SelectTrigger className="flex h-9 min-w-40 items-center gap-2 rounded-lg border-0 bg-card px-2.5 text-sm text-foreground ring-1 ring-foreground/10 transition-colors hover:bg-card-elevated dark:bg-card dark:hover:bg-card-elevated">
        <span className="truncate">{label}</span>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} sideOffset={6} className="p-1">
        <SelectGroup className="p-0">
          <SelectItem
            value={ALL_PROJECTS_VALUE}
            className="gap-2.5 rounded-md px-2 py-1.5 pr-8"
          >
            <span className="truncate text-sm">All projects</span>
          </SelectItem>
          {projects.length > 0 && (
            <div className="my-1 h-px bg-border" aria-hidden />
          )}
          {projects.map((p) => (
            <SelectItem
              key={p.id}
              value={p.id}
              className="gap-2.5 rounded-md px-2 py-1.5 pr-8"
            >
              <span className="truncate text-sm">{p.name}</span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
