import { join } from 'path'
import chalk from 'chalk'
import type { CommandFactory } from '../deps.js'
import { DEFAULT_API_URL } from '../lib/config.js'

/**
 * Status command - show current configuration
 */
export const makeStatusCommand: CommandFactory =
  (deps) => async () => {
    const config = deps.config.read()
    const project = deps.project.find()

    console.log(chalk.bold('Argos 상태'))
    console.log()

    // Login status
    if (config) {
      console.log(chalk.green('✓ 로그인됨'))
      console.log('  이메일:  ' + config.email)
      console.log('  사용자:  ' + config.userId)
      console.log('  API URL: ' + (config.apiUrl ?? DEFAULT_API_URL))
    } else {
      console.log(chalk.red('✗ 로그인 안 됨'))
      console.log('  argos를 실행하여 로그인하세요.')
    }

    console.log()

    // Project status
    if (project) {
      console.log(chalk.green('✓ 프로젝트 설정됨'))
      console.log('  프로젝트: ' + project.projectName)
      console.log('  조직:     ' + project.orgName)
      console.log('  ID:       ' + project.projectId)
      console.log('  API URL:  ' + (project.apiUrl ?? config?.apiUrl ?? DEFAULT_API_URL))
    } else {
      console.log(chalk.red('✗ 프로젝트 없음'))
      console.log('  이 디렉토리는 Argos 프로젝트가 아닙니다.')
      console.log('  argos를 실행하여 프로젝트를 생성하세요.')
    }

    console.log()

    // Hooks status
    const settingsPath = join(deps.cwd(), '.claude', 'settings.json')
    if (deps.hooks.fileExists(settingsPath)) {
      console.log(chalk.green('✓ Claude Code hooks 설정 파일 존재'))
      console.log('  경로: ' + settingsPath)
    } else {
      console.log(chalk.yellow('⚠ Claude Code hooks 설정 파일 없음'))
      console.log('  argos를 실행하여 hooks를 설치하세요.')
    }
  }
