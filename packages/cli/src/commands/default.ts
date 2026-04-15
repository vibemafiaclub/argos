import { join } from 'path'
import chalk from 'chalk'
import ora from 'ora'
import type { Config } from '../lib/config.js'
import type { ProjectConfig } from '../lib/project.js'
import type { CreateProjectResponse } from '@argos/shared'
import type { ExternalDeps, CommandFactory } from '../deps.js'

interface DefaultCommandOptions {
  apiUrl?: string
}

const DEFAULT_API_URL = 'https://server.argos-ai.xyz'

export const makeDefaultCommand: CommandFactory<DefaultCommandOptions> =
  (deps) => async (options) => {
    const config = deps.config.read()
    const project = deps.project.find()
    const apiUrl = options.apiUrl || DEFAULT_API_URL

    // 4-way branch based on config and project presence
    if (!config && !project) {
      await runFullSetup(deps, apiUrl)
    } else if (!config && project) {
      await runLoginAndJoin(deps, project, apiUrl)
    } else if (config && !project) {
      await runProjectInit(deps, config, apiUrl)
    } else if (config && project) {
      await ensureOrgMembershipAndShowStatus(deps, config, project)
    }
  }

/**
 * Flow 1: Full setup (login + create project + inject hooks)
 */
async function runFullSetup(deps: ExternalDeps, apiUrl: string): Promise<void> {
  console.log(chalk.bold('Argos 초기 설정'))
  console.log()

  // Step 1: Login
  console.log(chalk.dim('→ 로그인'))

  let loginResponse
  try {
    loginResponse = await deps.auth.login(apiUrl)
    console.log(chalk.green(`✓ 로그인 완료 (${loginResponse.user.email})`))
  } catch (err) {
    console.error(chalk.red('✗ 로그인 실패'))
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  // Save config
  deps.config.write({
    token: loginResponse.token,
    apiUrl,
    userId: loginResponse.user.id,
    email: loginResponse.user.email,
  })

  // Step 2: Create project
  console.log()
  console.log(chalk.dim('→ 프로젝트 생성'))

  const currentDirName = deps.cwd().split('/').pop() || 'my-project'
  const projectName = await deps.prompt.input('프로젝트 이름을 입력하세요:', currentDirName)

  let spinner = ora('프로젝트 생성 중...').start()

  let projectResponse: CreateProjectResponse
  try {
    projectResponse = await deps.api.createProject(projectName, loginResponse.token, apiUrl)
    spinner.succeed(chalk.green(`✓ 프로젝트 생성: ${projectResponse.projectName}`))
    console.log(chalk.dim(`  조직: ${projectResponse.orgName}`))
  } catch (err) {
    spinner.fail(chalk.red('✗ 프로젝트 생성 실패'))
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  // Step 3: Write project config
  deps.project.write({
    projectId: projectResponse.projectId,
    orgId: projectResponse.orgId,
    orgName: projectResponse.orgName,
    projectName: projectResponse.projectName,
    apiUrl,
  })
  console.log(chalk.green('✓ .argos/project.json 작성'))

  // Step 4: Inject hooks
  const settingsPath = join(deps.cwd(), '.claude', 'settings.json')
  const hookResult = deps.hooks.inject(settingsPath)
  if (hookResult === 'injected') {
    console.log(chalk.green('✓ Claude Code hooks 설치 완료'))
  } else {
    console.log(chalk.yellow('✓ Claude Code hooks 이미 설치됨'))
  }

  // Success message
  console.log()
  console.log(chalk.bold.green('✓ 설정 완료!'))
  console.log()
  console.log(chalk.dim('다음 단계:'))
  console.log('  git add .argos/project.json .claude/settings.json')
  console.log('  git commit -m "chore: add argos tracking"')
  console.log()
  console.log(chalk.dim('팀원들이 이 저장소를 clone한 뒤 argos를 실행하면 자동으로 팀에 합류됩니다.'))
}

/**
 * Flow 2: Login and join existing org (project.json exists, but not logged in)
 */
async function runLoginAndJoin(deps: ExternalDeps, project: ProjectConfig, apiUrl: string): Promise<void> {
  console.log(chalk.bold('Argos 로그인'))
  console.log(chalk.dim(`프로젝트: ${project.projectName}`))
  console.log()

  let loginResponse
  try {
    loginResponse = await deps.auth.login(project.apiUrl || apiUrl)
    console.log(chalk.green(`✓ 로그인 완료 (${loginResponse.user.email})`))
  } catch (err) {
    console.error(chalk.red('✗ 로그인 실패'))
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  // Save config
  deps.config.write({
    token: loginResponse.token,
    apiUrl: project.apiUrl || apiUrl,
    userId: loginResponse.user.id,
    email: loginResponse.user.email,
  })

  // Join org
  const spinner = ora('조직 합류 중...').start()
  try {
    await deps.api.joinOrg(project.orgId, loginResponse.token, project.apiUrl || apiUrl)
    spinner.succeed(chalk.green(`✓ 조직 합류: ${project.orgName}`))
  } catch (err) {
    spinner.fail(chalk.red('✗ 조직 합류 실패'))
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  console.log()
  console.log(chalk.bold.green('✓ 설정 완료!'))
  console.log()
  console.log('트래킹이 활성화되었습니다. Claude Code를 사용하면 자동으로 기록됩니다.')
}

/**
 * Flow 3: Create project (already logged in, but no project.json)
 */
async function runProjectInit(deps: ExternalDeps, config: Config, apiUrl: string): Promise<void> {
  console.log(chalk.green(`✓ 로그인됨: ${config.email}`))
  console.log(chalk.dim('→ 이 디렉토리는 아직 Argos 프로젝트가 아닙니다.'))
  console.log()

  const currentDirName = deps.cwd().split('/').pop() || 'my-project'
  const projectName = await deps.prompt.input('프로젝트 이름을 입력하세요:', currentDirName)

  const spinner = ora('프로젝트 생성 중...').start()

  let projectResponse: CreateProjectResponse
  try {
    projectResponse = await deps.api.createProject(projectName, config.token, config.apiUrl || apiUrl)
    spinner.succeed(chalk.green(`✓ 프로젝트 생성: ${projectResponse.projectName}`))
    console.log(chalk.dim(`  조직: ${projectResponse.orgName}`))
  } catch (err) {
    spinner.fail(chalk.red('✗ 프로젝트 생성 실패'))
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  // Write project config
  deps.project.write({
    projectId: projectResponse.projectId,
    orgId: projectResponse.orgId,
    orgName: projectResponse.orgName,
    projectName: projectResponse.projectName,
    apiUrl: config.apiUrl || apiUrl,
  })
  console.log(chalk.green('✓ .argos/project.json 작성'))

  // Inject hooks
  const settingsPath = join(deps.cwd(), '.claude', 'settings.json')
  const hookResult = deps.hooks.inject(settingsPath)
  if (hookResult === 'injected') {
    console.log(chalk.green('✓ Claude Code hooks 설치 완료'))
  } else {
    console.log(chalk.yellow('✓ Claude Code hooks 이미 설치됨'))
  }

  console.log()
  console.log(chalk.bold.green('✓ 설정 완료!'))
}

/**
 * Flow 4: Everything is set up - just verify membership and show status
 */
async function ensureOrgMembershipAndShowStatus(
  deps: ExternalDeps,
  config: Config,
  project: ProjectConfig
): Promise<void> {
  // Check if user is already a member
  const spinner = ora('멤버십 확인 중...').start()

  try {
    await deps.api.ensureMembership(project.orgId, config.token, project.apiUrl || config.apiUrl)
    spinner.stop()
  } catch {
    spinner.stop()
    // Ignore error - user might already be a member
  }

  // Show status
  console.log(chalk.bold.green('✓ 모두 준비되어 있습니다.'))
  console.log()
  console.log(chalk.dim('사용자:  ') + config.email)
  console.log(chalk.dim('프로젝트:') + ` ${project.projectName} (${project.projectId})`)
  console.log(chalk.dim('조직:    ') + project.orgName)
  console.log(chalk.dim('API:     ') + (project.apiUrl || config.apiUrl))

  // Check hooks
  const settingsPath = join(deps.cwd(), '.claude', 'settings.json')
  const hookResult = deps.hooks.inject(settingsPath)
  if (hookResult === 'injected') {
    console.log(chalk.dim('Hooks:   ') + chalk.green('✓ .claude/settings.json에 설치됨'))
  } else {
    console.log(chalk.dim('Hooks:   ') + chalk.green('✓ .claude/settings.json에 설치됨'))
  }
}
