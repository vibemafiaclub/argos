import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Providers } from '@/components/providers'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://argos-ai.xyz'
const siteName = 'Argos'
const description =
  '팀이 쓰는 Claude Code를 한 화면에서. 토큰·스킬·에이전트 호출을 팀 단위로 추적하는 관측 대시보드.'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${siteName} — observability for Claude Code teams`,
    template: `%s — ${siteName}`,
  },
  description,
  applicationName: siteName,
  openGraph: {
    type: 'website',
    siteName,
    title: `${siteName} — observability for Claude Code teams`,
    description,
    url: '/',
    locale: 'ko_KR',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${siteName} — observability for Claude Code teams`,
    description,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
