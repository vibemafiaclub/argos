'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { OrgSwitcher } from './org-switcher'
import { CreateOrgModal } from '@/components/org/create-org-modal'
import { useOrgs } from '@/hooks/use-orgs'

type NavItem = {
  label: string
  href: string
  /** 역할 제한. 지정된 역할만 보임. undefined면 모두에게 보임. */
  viewerSafe?: boolean
}

// viewerSafe: true 인 항목만 VIEWER에게 노출. 나머지(Sessions/Users)는 개인 단위
// 데이터 페이지이므로 VIEWER에게 숨김 (API는 이미 403 차단).
const topNavItems: NavItem[] = [
  { label: 'Home', href: '', viewerSafe: true },
  { label: 'Overview', href: '/overview', viewerSafe: true },
  { label: 'Reports', href: '/reports', viewerSafe: false },
  { label: 'Sessions', href: '/sessions', viewerSafe: false },
  { label: 'Users', href: '/users', viewerSafe: false },
  { label: 'Agents', href: '/agents', viewerSafe: true },
  { label: 'Skills', href: '/skills', viewerSafe: true },
]

const bottomNavItems: NavItem[] = [
  { label: 'Settings', href: '/settings', viewerSafe: true },
]

export function OrgSidebar() {
  const params = useParams()
  const pathname = usePathname()
  const orgSlug = params.orgSlug as string
  const [createOpen, setCreateOpen] = useState(false)
  const { data: orgsData } = useOrgs()
  const currentOrg = orgsData?.orgs.find((o) => o.slug === orgSlug)
  const role = currentOrg?.role ?? ''
  const isViewer = role === 'VIEWER'

  const filterItems = (items: NavItem[]) =>
    items.filter((i) => !isViewer || i.viewerSafe)
  const visibleTop = filterItems(topNavItems)
  const visibleBottom = filterItems(bottomNavItems)
  const mobileNavItems = [...visibleTop, ...visibleBottom]

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/login' })
  }

  const renderLink = (
    item: { label: string; href: string },
    variant: 'desktop' | 'mobile'
  ) => {
    const href = `/dashboard/${orgSlug}${item.href}`
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
        <div className="p-6 flex items-center gap-2">
          <Image
            src="/argos-logo.svg"
            alt="Argos"
            width={28}
            height={28}
            className="rounded-md"
            priority
          />
          <h2 className="text-lg font-semibold">Argos</h2>
        </div>
        <div className="px-3 pb-3">
          <OrgSwitcher onCreateClick={() => setCreateOpen(true)} />
        </div>
        <nav className="px-3 space-y-1 flex-1 flex flex-col">
          <div className="space-y-1">
            {visibleTop.map((item) => renderLink(item, 'desktop'))}
          </div>
          <div className="mt-auto space-y-1">
            {visibleBottom.map((item) => renderLink(item, 'desktop'))}
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
          <div className="flex items-center gap-2 shrink-0">
            <Image
              src="/argos-logo.svg"
              alt="Argos"
              width={24}
              height={24}
              className="rounded-md"
              priority
            />
            <h2 className="text-lg font-semibold">Argos</h2>
          </div>
          <div className="flex-1 min-w-0">
            <OrgSwitcher onCreateClick={() => setCreateOpen(true)} />
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

      <CreateOrgModal open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}
