import { join } from 'path'
import { existsSync } from 'fs'
import chalk from 'chalk'
import { readConfig } from '../lib/config.js'
import { findProjectConfig } from '../lib/project.js'

/**
 * Status command - show current configuration
 */
export async function statusCommand(): Promise<void> {
  const config = readConfig()
  const project = findProjectConfig()

  console.log(chalk.bold('Argos 상태'))
  console.log()

  // Login status
  if (config) {
    console.log(chalk.green('✓ 로그인됨'))
    console.log(chalk.dim('  이메일:  ') + config.email)
    console.log(chalk.dim('  사용자:  ') + config.userId)
    console.log(chalk.dim('  API URL: ') + config.apiUrl)
  } else {
    console.log(chalk.red('✗ 로그인 안 됨'))
    console.log(chalk.dim('  argos를 실행하여 로그인하세요.'))
  }

  console.log()

  // Project status
  if (project) {
    console.log(chalk.green('✓ 프로젝트 설정됨'))
    console.log(chalk.dim('  프로젝트: ') + project.projectName)
    console.log(chalk.dim('  조직:     ') + project.orgName)
    console.log(chalk.dim('  ID:       ') + project.projectId)
    console.log(chalk.dim('  API URL:  ') + project.apiUrl)
  } else {
    console.log(chalk.red('✗ 프로젝트 없음'))
    console.log(chalk.dim('  이 디렉토리는 Argos 프로젝트가 아닙니다.'))
    console.log(chalk.dim('  argos를 실행하여 프로젝트를 생성하세요.'))
  }

  console.log()

  // Hooks status
  const settingsPath = join(process.cwd(), '.claude', 'settings.json')
  if (existsSync(settingsPath)) {
    console.log(chalk.green('✓ Claude Code hooks 설정 파일 존재'))
    console.log(chalk.dim('  경로: ') + settingsPath)
  } else {
    console.log(chalk.yellow('⚠ Claude Code hooks 설정 파일 없음'))
    console.log(chalk.dim('  argos를 실행하여 hooks를 설치하세요.'))
  }
}
