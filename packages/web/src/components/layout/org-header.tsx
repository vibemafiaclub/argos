'use client'

import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { ProjectFilter } from './project-filter'

export function OrgHeader({ orgName }: { orgName?: string }) {
  return (
    <header className="border-b bg-background">
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">
            {orgName || 'Dashboard'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <ProjectFilter />
          <Button
            variant="outline"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            Sign out
          </Button>
        </div>
      </div>
    </header>
  )
}
