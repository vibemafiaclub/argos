import chalk from 'chalk'
import ora from 'ora'
import { readConfig, deleteConfig } from '../lib/config.js'
import { apiRequest } from '../lib/api-client.js'

/**
 * Logout command - revoke token and delete local config
 */
export async function logoutCommand(): Promise<void> {
  const config = readConfig()

  if (!config) {
    console.log(chalk.yellow('⚠ 로그인 상태가 아닙니다.'))
    return
  }

  const spinner = ora('로그아웃 중...').start()

  try {
    // Try to revoke token on server
    await apiRequest(`${config.apiUrl}/api/auth/logout`, {
      method: 'POST',
      token: config.token,
      baseUrl: '',
    })
  } catch {
    // Ignore API errors - still delete local config
    spinner.warn(chalk.yellow('서버에서 토큰을 취소하는데 실패했지만 로컬 설정은 삭제됩니다.'))
  }

  // Delete local config
  deleteConfig()
  spinner.succeed(chalk.green('✓ 로그아웃 완료'))

  console.log()
  console.log('로컬 인증 정보가 삭제되었습니다.')
  console.log(chalk.dim('다시 로그인하려면 argos를 실행하세요.'))
}
