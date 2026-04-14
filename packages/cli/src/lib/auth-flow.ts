import { exec } from 'child_process'
import { createInterface } from 'readline'
import chalk from 'chalk'
import ora from 'ora'
import type { User, LoginResponse } from '@argos/shared'
import { apiRequest } from './api-client.js'

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' :
    process.platform === 'win32' ? 'start ""' :
    'xdg-open'
  exec(`${cmd} "${url}"`)
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question('', () => {
      rl.close()
      resolve()
    })
  })
}

/**
 * 브라우저 기반 CLI 인증 흐름
 * 1. API에서 state 토큰 발급
 * 2. Enter 입력 시 브라우저 열기
 * 3. 사용자가 웹에서 허용하면 토큰 수신
 */
export async function runLoginFlow(apiUrl: string): Promise<LoginResponse> {
  // Step 1: state 발급
  let state: string, authUrl: string
  try {
    const res = await apiRequest<{ state: string; authUrl: string }>(
      `${apiUrl}/api/auth/cli-request`,
      { method: 'POST', baseUrl: '' }
    )
    state = res.state
    authUrl = res.authUrl
  } catch (err) {
    throw new Error(`인증 요청 실패: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Step 2: Enter 대기
  console.log()
  process.stdout.write(chalk.dim('Enter를 눌러 브라우저에서 로그인하세요... '))
  await waitForEnter()

  // Step 3: 브라우저 열기
  openBrowser(authUrl)
  console.log(chalk.dim(`브라우저 열기: ${authUrl}`))
  console.log()

  // Step 4: 승인 polling
  const spinner = ora('브라우저 로그인 대기 중...').start()

  const token = await new Promise<string>((resolve, reject) => {
    let attempts = 0
    const maxAttempts = 450 // 15분 (2초 간격)

    const interval = setInterval(async () => {
      attempts++
      if (attempts > maxAttempts) {
        clearInterval(interval)
        reject(new Error('로그인 시간이 초과되었습니다.'))
        return
      }

      try {
        const result = await apiRequest<{ pending?: boolean; denied?: boolean; token?: string }>(
          `${apiUrl}/api/auth/cli-poll?state=${state}`,
          { method: 'GET', baseUrl: '' }
        )

        if (result.denied) {
          clearInterval(interval)
          reject(new Error('로그인이 거부되었습니다.'))
        } else if (result.token) {
          clearInterval(interval)
          resolve(result.token)
        }
      } catch {
        // 일시적 오류는 무시하고 계속 polling
      }
    }, 2000)
  })

  spinner.succeed(chalk.green('✓ 로그인 완료'))

  // Step 5: 사용자 정보 조회
  const { user } = await apiRequest<{ user: User }>(`${apiUrl}/api/auth/me`, {
    method: 'GET',
    token,
    baseUrl: '',
  })

  return { token, user }
}
