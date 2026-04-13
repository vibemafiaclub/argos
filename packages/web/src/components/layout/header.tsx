'use client'

import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'

export function Header({ projectName }: { projectName?: string }) {
  return (
    <header className="border-b bg-background">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">
            {projectName || 'Dashboard'}
          </h1>
        </div>
        <Button variant="outline" onClick={() => signOut({ callbackUrl: '/login' })}>
          Sign out
        </Button>
      </div>
    </header>
  )
}
