'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import Link from 'next/link'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type AdminImpersonateClientProps = {
  token: string
  dashboardUrl: string
}

export function AdminImpersonateClient({
  token,
  dashboardUrl,
}: AdminImpersonateClientProps) {
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function impersonate() {
      const result = await signIn('credentials', {
        impersonationToken: token,
        redirect: false,
      })

      if (cancelled) return
      if (result?.error) {
        setError('Unable to sign in as selected user')
        return
      }

      window.location.replace(dashboardUrl)
    }

    impersonate().catch(() => {
      if (!cancelled) setError('Unable to sign in as selected user')
    })

    return () => {
      cancelled = true
    }
  }, [dashboardUrl, token])

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Opening dashboard</CardTitle>
        <CardDescription>Signing in as the selected customer.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <>
            <Alert variant="destructive">
              <AlertTitle>Sign-in failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Link href="/admin" className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
              Back to admin
            </Link>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Redirecting...</p>
        )}
      </CardContent>
    </Card>
  )
}
