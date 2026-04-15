import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ projectId: string }>
}) {
  const session = await auth()

  if (!session) {
    redirect('/login')
  }

  const { projectId } = await params

  // Fetch project details
  let projectName = 'Project'
  try {
    const res = await fetch(`${process.env.API_URL}/api/projects/${projectId}`, {
      headers: {
        Authorization: `Bearer ${session.argosToken}`,
      },
    })

    if (res.ok) {
      const data = await res.json()
      projectName = data.name
    }
  } catch {
    // Use default project name
  }

  return (
    <div className="flex flex-col md:flex-row h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header projectName={projectName} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
