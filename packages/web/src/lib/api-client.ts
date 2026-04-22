/**
 * 브라우저(클라이언트 컴포넌트)에서 동일 Next.js 앱의 라우트 핸들러를 호출하는 헬퍼.
 * 라우트가 같은 origin에 있으므로 상대경로 fetch면 충분하다.
 */
export async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(path, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    throw new Error(`API request failed: ${res.status} ${res.statusText}`)
  }

  return res.json()
}

export class ApiError extends Error {
  status: number
  code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export async function apiPost<T>(
  path: string,
  token: string,
  body: unknown
): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    let code: string | undefined
    let message = `API request failed: ${res.status} ${res.statusText}`
    try {
      const data = (await res.json()) as {
        error?: { code?: string; message?: string }
      }
      if (data?.error?.code) code = data.error.code
      if (data?.error?.message) message = data.error.message
    } catch {
      // non-JSON error body — 기본 메시지 유지
    }
    throw new ApiError(res.status, message, code)
  }

  return res.json()
}

export async function apiPatch<T>(
  path: string,
  token: string,
  body: unknown
): Promise<T> {
  const res = await fetch(path, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    let code: string | undefined
    let message = `API request failed: ${res.status} ${res.statusText}`
    try {
      const data = (await res.json()) as {
        error?: { code?: string; message?: string }
      }
      if (data?.error?.code) code = data.error.code
      if (data?.error?.message) message = data.error.message
    } catch {
      // non-JSON error body — 기본 메시지 유지
    }
    throw new ApiError(res.status, message, code)
  }

  return res.json()
}

export async function apiDelete(path: string, token: string): Promise<void> {
  const res = await fetch(path, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    let code: string | undefined
    let message = `API request failed: ${res.status} ${res.statusText}`
    try {
      const data = (await res.json()) as {
        error?: { code?: string; message?: string }
      }
      if (data?.error?.code) code = data.error.code
      if (data?.error?.message) message = data.error.message
    } catch {
      // non-JSON error body — 기본 메시지 유지
    }
    throw new ApiError(res.status, message, code)
  }
}
