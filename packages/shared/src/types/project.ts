export interface Organization {
  id: string
  name: string
  slug: string
  createdAt: string
}

export interface Project {
  id: string
  orgId: string
  name: string
  slug: string
  createdAt: string
}

export interface CreateProjectResponse {
  projectId: string
  orgId: string
  orgName: string
  projectName: string
  projectSlug: string
}
