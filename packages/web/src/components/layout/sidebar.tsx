'use client'

import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'

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
    <aside className="w-64 border-r bg-muted/40 h-screen sticky top-0 flex flex-col">
      <div className="p-6">
        <h2 className="text-lg font-semibold">Argos</h2>
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
  )
}
