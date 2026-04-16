'use client'

import { useParams, useRouter } from 'next/navigation'
import { useProjects } from '@/hooks/use-projects'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function ProjectSwitcher() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.projectId as string
  const { data } = useProjects()

  const projects = data?.projects ?? []

  // Group projects by org
  const grouped = projects.reduce<Record<string, { orgName: string; items: typeof projects }>>((acc, p) => {
    if (!acc[p.orgId]) {
      acc[p.orgId] = { orgName: p.orgName, items: [] }
    }
    acc[p.orgId].items.push(p)
    return acc
  }, {})

  const handleChange = (value: string | null) => {
    if (value && value !== projectId) {
      router.push(`/dashboard/${value}`)
    }
  }

  if (projects.length === 0) return null

  const orgEntries = Object.entries(grouped)
  const singleOrg = orgEntries.length === 1

  return (
    <Select value={projectId} onValueChange={handleChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select project" />
      </SelectTrigger>
      <SelectContent>
        {singleOrg ? (
          orgEntries[0][1].items.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))
        ) : (
          orgEntries.map(([orgId, group]) => (
            <SelectGroup key={orgId}>
              <SelectLabel>{group.orgName}</SelectLabel>
              {group.items.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ))
        )}
      </SelectContent>
    </Select>
  )
}
