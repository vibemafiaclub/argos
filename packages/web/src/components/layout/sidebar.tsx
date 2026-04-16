'use client'

import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { ProjectSwitcher } from './project-switcher'

const navItems = [
  { label: 'Overview', href: '' },
  { label: 'Users', href: '/users' },
  { label: 'Skills', href: '/skills' },
  { label: 'Agents', href: '/agents' },
  { label: 'Sessions', href: '/sessions' },
]

export function Sidebar() {
  const params = useParams()
  const pathname = usePathname()
  const projectId = params.projectId as string

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/login' })
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
        <nav className="px-3 space-y-1 flex-1">
          {navItems.map((item) => {
            const href = `/dashboard/${projectId}${item.href}`
            const isActive = pathname === href || (item.href !== '' && pathname.startsWith(href))
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
          })}
        </nav>
        <div className="p-3 border-t">
          <button
            onClick={handleLogout}
            className="w-full px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors"
          >
            Log Out
          </button>
        </div>
      </aside>

      {/* Mobile Navigation */}
      <div className="md:hidden sticky top-0 z-10 bg-white border-b">
        <div className="flex items-center gap-3 p-4">
          <h2 className="text-lg font-semibold shrink-0">Argos</h2>
          <div className="flex-1 min-w-0">
            <ProjectSwitcher />
          </div>
          <button
            onClick={handleLogout}
            className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
          >
            Logout
          </button>
        </div>
        <nav className="flex overflow-x-auto px-2 pb-2 gap-1">
          {navItems.map((item) => {
            const href = `/dashboard/${projectId}${item.href}`
            const isActive = pathname === href || (item.href !== '' && pathname.startsWith(href))
            return (
              <Link
                key={item.href}
                href={href}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </>
  )
}
