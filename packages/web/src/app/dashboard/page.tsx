import { auth } from '@/auth'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const session = await auth()

  if (!session) {
    redirect('/login')
  }

  // Fetch first project
  try {
    const res = await fetch(`${process.env.API_URL}/api/projects`, {
      headers: {
        Authorization: `Bearer ${session.argosToken}`,
      },
    })

    if (res.ok) {
      const data = await res.json()
      if (data.projects && data.projects.length > 0) {
        redirect(`/dashboard/${data.projects[0].id}`)
      }
    }
  } catch {
    // If API call fails, show empty state
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-semibold">Welcome to Argos</h1>
        <p className="text-muted-foreground">
          No projects found. Create a project using the CLI to get started.
        </p>
      </div>
    </div>
  )
}
