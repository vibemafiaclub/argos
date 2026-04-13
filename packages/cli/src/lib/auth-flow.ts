import { input, password } from '@inquirer/prompts'
import type { User, LoginResponse } from '@argos/shared'
import { apiRequest } from './api-client.js'

/**
 * Run interactive login flow
 * Prompts for email and password, then calls API login endpoint
 */
export async function runLoginFlow(apiUrl: string): Promise<LoginResponse> {
  const email = await input({
    message: '이메일을 입력하세요:',
    validate: (value: string) => {
      if (!value || !value.includes('@')) {
        return '유효한 이메일을 입력하세요.'
      }
      return true
    },
  })

  const pwd = await password({
    message: '비밀번호를 입력하세요:',
    mask: '•',
  })

  try {
    const response = await apiRequest<LoginResponse>(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email, password: pwd }),
      baseUrl: '',
    })

    return response
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    throw new Error(
      `로그인 실패: ${errorMessage}\n계정이 없다면 argos register를 실행하세요.`
    )
  }
}

/**
 * Run interactive registration flow
 * Prompts for name, email, and password, then calls API register endpoint
 */
export async function runRegisterFlow(apiUrl: string): Promise<LoginResponse> {
  const name = await input({
    message: '이름을 입력하세요:',
    validate: (value: string) => {
      if (!value || value.trim().length === 0) {
        return '이름을 입력하세요.'
      }
      return true
    },
  })

  const email = await input({
    message: '이메일을 입력하세요:',
    validate: (value: string) => {
      if (!value || !value.includes('@')) {
        return '유효한 이메일을 입력하세요.'
      }
      return true
    },
  })

  const pwd = await password({
    message: '비밀번호를 입력하세요 (최소 8자):',
    mask: '•',
    validate: (value: string) => {
      if (!value || value.length < 8) {
        return '비밀번호는 최소 8자 이상이어야 합니다.'
      }
      return true
    },
  })

  try {
    const response = await apiRequest<LoginResponse>(`${apiUrl}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({ name, email, password: pwd }),
      baseUrl: '',
    })

    return response
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    throw new Error(`회원가입 실패: ${errorMessage}`)
  }
}
