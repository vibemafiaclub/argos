'use client'

import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { ProjectSwitcher } from './project-switcher'

const topNavItems = [
  { label: 'Overview', href: '' },
  { label: 'Skills', href: '/skills' },
  { label: 'Agents', href: '/agents' },
  { label: 'Sessions', href: '/sessions' },
]

const bottomNavItems = [
  { label: 'Users', href: '/users' },
  { label: 'Settings', href: '/settings' },
]

const mobileNavItems = [...topNavItems, ...bottomNavItems]

export function Sidebar() {
  const params = useParams()
  const pathname = usePathname()
  const projectId = params.projectId as string

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/login' })
  }

  const renderLink = (
    item: { label: string; href: string },
    variant: 'desktop' | 'mobile'
  ) => {
    const href = `/dashboard/${projectId}${item.href}`
    const isActive =
      pathname === href || (item.href !== '' && pathname.startsWith(href))

    if (variant === 'desktop') {
      return (
        <Link
          key={item.href}
          href={href}
          className={cn(
            'block px-3 py-2 rounded-md text-sm font-medium transition-colors',
            isActive
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          {item.label}
        </Link>
      )
    }

    return (
      <Link
        key={item.href}
        href={href}
        className={cn(
          'px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors',
          isActive
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary text-secondary-foreground hover:bg-muted'
        )}
      >
        {item.label}
      </Link>
    )
  }

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 border-r bg-muted/40 h-screen sticky top-0 flex-col">
        <div className="p-6">
          <h2 className="text-lg font-semibold">Argos</h2>
        </div>
        <div className="px-3 pb-3">
          <ProjectSwitcher />
        </div>
        <nav className="px-3 space-y-1 flex-1 flex flex-col">
          <div className="space-y-1">
            {topNavItems.map((item) => renderLink(item, 'desktop'))}
          </div>
          <div className="mt-auto space-y-1">
            {bottomNavItems.map((item) => renderLink(item, 'desktop'))}
          </div>
        </nav>
        <div className="p-3 border-t">
          <button
            onClick={handleLogout}
            className="w-full px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-md transition-colors"
          >
            Log Out
          </button>
        </div>
      </aside>

      {/* Mobile Navigation */}
      <div className="md:hidden sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center gap-3 p-4">
          <h2 className="text-lg font-semibold shrink-0">Argos</h2>
          <div className="flex-1 min-w-0">
            <ProjectSwitcher />
          </div>
          <button
            onClick={handleLogout}
            className="px-3 py-1 text-sm text-destructive hover:bg-destructive/10 rounded-md transition-colors"
          >
            Logout
          </button>
        </div>
        <nav className="flex overflow-x-auto px-2 pb-2 gap-1">
          {mobileNavItems.map((item) => renderLink(item, 'mobile'))}
        </nav>
      </div>
    </>
  )
}
