/**
 * API client for making authenticated requests to Argos API
 */

export interface ApiRequestOptions extends RequestInit {
  token?: string
  baseUrl?: string
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions
): Promise<T> {
  const { token, baseUrl, ...fetchOptions } = options

  const url = `${baseUrl || ''}${path}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // Merge existing headers
  if (fetchOptions.headers) {
    const existingHeaders = new Headers(fetchOptions.headers)
    existingHeaders.forEach((value, key) => {
      headers[key] = value
    })
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      signal: fetchOptions.signal || controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      let errorMessage: string

      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.error?.message || errorJson.message || response.statusText
      } catch {
        errorMessage = errorText || response.statusText
      }

      throw new Error(`API Error (${response.status}): ${errorMessage}`)
    }

    return await response.json()
  } catch (err) {
    clearTimeout(timeoutId)
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        throw new Error('API request timed out')
      }
      throw err
    }
    throw new Error('Unknown API error')
  }
}
