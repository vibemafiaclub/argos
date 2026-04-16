import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { EmptyState } from '@/components/dashboard/empty-state'

export default async function DashboardPage() {
  const session = await auth()

  if (!session) {
    redirect('/login')
  }

  // Fetch first project
  let redirectTo: string | null = null
  try {
    const res = await fetch(`${process.env.API_URL}/api/projects`, {
      headers: {
        Authorization: `Bearer ${session.argosToken}`,
      },
    })

    if (res.ok) {
      const data = await res.json()
      if (data.projects && data.projects.length > 0) {
        redirectTo = `/dashboard/${data.projects[0].id}`
      }
    }
  } catch {
    // If API call fails, show empty state
  }

  if (redirectTo) {
    redirect(redirectTo)
  }

  return <EmptyState email={session.user?.email ?? ''} />
}
