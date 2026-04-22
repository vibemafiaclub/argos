'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import { useProjects } from '@/hooks/use-projects'
import { useOrgs } from '@/hooks/use-orgs'
import { CreateProjectModal } from '@/components/org/create-project-modal'
import { DeleteProjectModal } from '@/components/org/delete-project-modal'
import { RenameProjectModal } from '@/components/org/rename-project-modal'

interface ProjectItem {
  id: string
  slug: string
  name: string
  createdAt: string
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

function ProjectCard({
  orgSlug,
  project,
  onRename,
  onDelete,
}: {
  orgSlug: string
  project: ProjectItem
  onRename: (p: ProjectItem) => void
  onDelete: (p: ProjectItem) => void
}) {
  return (
    <Card className="group relative transition-colors hover:bg-card-elevated">
      <Link
        href={`/dashboard/${orgSlug}/overview?projectId=${project.id}`}
        className="absolute inset-0 z-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-label={`${project.name} 프로젝트 열기`}
      />
      <div className="relative z-10 flex items-start justify-between gap-3 px-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-medium text-foreground">
            {project.name}
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            {project.slug}
          </p>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="프로젝트 이름 변경"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onRename(project)
            }}
            className="pointer-events-auto relative text-muted-foreground hover:text-foreground"
          >
            <PencilIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="프로젝트 삭제"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDelete(project)
            }}
            className="pointer-events-auto relative text-muted-foreground hover:text-destructive"
          >
            <Trash2Icon />
          </Button>
        </div>
      </div>
      <div className="relative z-10 px-4 text-xs text-muted-foreground">
        생성일 {formatDate(project.createdAt)}
      </div>
    </Card>
  )
}

function ProjectsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  )
}

export default function OrgHomePage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const { data, isLoading } = useProjects(orgSlug)
  const { data: orgsData } = useOrgs()
  const currentOrg = orgsData?.orgs.find((o) => o.slug === orgSlug)

  const [createOpen, setCreateOpen] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState<ProjectItem | null>(
    null
  )
  const [projectToRename, setProjectToRename] = useState<ProjectItem | null>(
    null
  )

  const projects = data?.projects ?? []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-foreground">
            {currentOrg?.name ?? orgSlug}
          </h1>
          <p className="text-sm text-muted-foreground">Projects</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <PlusIcon />
          Create project
        </Button>
      </div>

      {isLoading ? (
        <ProjectsGridSkeleton />
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl bg-card px-6 py-16 text-center ring-1 ring-foreground/10">
          <div className="space-y-1">
            <h2 className="text-base font-medium text-foreground">
              아직 프로젝트가 없습니다
            </h2>
            <p className="text-sm text-muted-foreground">
              첫 프로젝트를 만들어 Argos 추적을 시작해보세요.
            </p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <PlusIcon />
            Create project
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              orgSlug={orgSlug}
              project={p}
              onRename={setProjectToRename}
              onDelete={setProjectToDelete}
            />
          ))}
        </div>
      )}

      <CreateProjectModal
        orgSlug={orgSlug}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      <DeleteProjectModal
        orgSlug={orgSlug}
        project={projectToDelete}
        onClose={() => setProjectToDelete(null)}
      />
      <RenameProjectModal
        project={projectToRename}
        onClose={() => setProjectToRename(null)}
      />
    </div>
  )
}
