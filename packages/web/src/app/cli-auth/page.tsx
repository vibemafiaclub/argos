import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { CliAuthClient } from './client'

interface Props {
  searchParams: Promise<{ state?: string }>
}

export default async function CliAuthPage({ searchParams }: Props) {
  const { state } = await searchParams

  if (!state) {
    redirect('/')
  }

  const session = await auth()
  if (!session) {
    redirect(`/login?callbackUrl=/cli-auth?state=${state}`)
  }

  const argosToken = session.argosToken

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <CliAuthClient
          state={state}
          userName={session.user?.name ?? ''}
          userEmail={session.user?.email ?? ''}
          argosToken={argosToken}
        />
      </div>
    </div>
  )
}
