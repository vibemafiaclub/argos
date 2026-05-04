import Link from 'next/link'

import { AdminImpersonateClient } from '@/components/admin/admin-impersonate-client'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export default async function AdminImpersonatePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      {token ? (
        <AdminImpersonateClient
          token={token}
          dashboardUrl="https://argos-ai.xyz/dashboard"
        />
      ) : (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Missing token</CardTitle>
            <CardDescription>Start from the admin customer list.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin" className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
              Back to admin
            </Link>
          </CardContent>
        </Card>
      )}
    </main>
  )
}
