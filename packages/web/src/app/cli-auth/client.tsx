'use client'

import { useState } from 'react'

interface Props {
  state: string
  userName: string
  userEmail: string
  argosToken: string
}

export function CliAuthClient({ state, userName, userEmail, argosToken }: Props) {
  const [status, setStatus] = useState<'pending' | 'approved' | 'denied' | 'error'>('pending')
  const [loading, setLoading] = useState(false)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL!

  async function handleAllow() {
    setLoading(true)
    try {
      const res = await fetch(`${apiUrl}/api/auth/cli-callback`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${argosToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ state }),
      })
      if (!res.ok) throw new Error('Failed')
      setStatus('approved')
    } catch {
      setStatus('error')
    } finally {
      setLoading(false)
    }
  }

  async function handleDeny() {
    setLoading(true)
    try {
      await fetch(`${apiUrl}/api/auth/cli-callback`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${argosToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ state, denied: true }),
      })
      setStatus('denied')
    } catch {
      setStatus('error')
    } finally {
      setLoading(false)
    }
  }

  if (status === 'approved') {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="text-5xl">✓</div>
        <h1 className="text-2xl font-bold">로그인 완료</h1>
        <p className="text-muted-foreground">터미널로 돌아가세요. 이 창은 닫아도 됩니다.</p>
      </div>
    )
  }

  if (status === 'denied') {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="text-5xl">✗</div>
        <h1 className="text-2xl font-bold">로그인 거부됨</h1>
        <p className="text-muted-foreground">이 창을 닫아도 됩니다.</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-bold text-destructive">오류 발생</h1>
        <p className="text-muted-foreground">요청이 만료되었거나 유효하지 않습니다.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">CLI 로그인 요청</h1>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">{userName}</span>
          {' '}({userEmail}) 계정으로 CLI 로그인을 허용하시겠습니까?
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleAllow}
          disabled={loading}
          className="px-6 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          허용
        </button>
        <button
          onClick={handleDeny}
          disabled={loading}
          className="px-6 py-2 rounded-md border border-border bg-background text-foreground font-medium hover:bg-muted disabled:opacity-50 transition-colors"
        >
          거부
        </button>
      </div>
    </div>
  )
}
