import Link from 'next/link'

import { ResetPasswordForm } from '@/components/auth/reset-password-form'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getPasswordResetStatus } from '@/lib/server/password-reset'

export const dynamic = 'force-dynamic'

function InvalidResetLinkCard({ title, description }: { title: string; description: string }) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/login" className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
          Go to sign in
        </Link>
      </CardContent>
    </Card>
  )
}

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const status = await getPasswordResetStatus(token)

  let content
  if (status.status === 'valid') {
    content = <ResetPasswordForm token={token} email={status.user.email} />
  } else if (status.status === 'expired') {
    content = (
      <InvalidResetLinkCard
        title="Reset link expired"
        description="This password reset link is only valid for 24 hours."
      />
    )
  } else if (status.status === 'used') {
    content = (
      <InvalidResetLinkCard
        title="Reset link already used"
        description="This password reset link can only be used once."
      />
    )
  } else {
    content = (
      <InvalidResetLinkCard
        title="Reset link not found"
        description="Check the link or ask an administrator to generate a new one."
      />
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      {content}
    </main>
  )
}
