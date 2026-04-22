import { join } from 'path'
import chalk from 'chalk'
import ora from 'ora'
import { DEFAULT_API_URL, normalizeApiUrl, type Config } from '../lib/config.js'
import type { ProjectConfig } from '../lib/project.js'
import type { CreateProjectResponse } from '@argos/shared'
import type { ExternalDeps, CommandFactory } from '../deps.js'

interface DefaultCommandOptions {
  apiUrl?: string
}

export const makeDefaultCommand: CommandFactory<DefaultCommandOptions> =
  (deps) => async (options) => {
    const config = deps.config.read()
    const project = deps.project.find()
    // customApiUrl is undefined unless the user passed a real self-hosted URL.
    // When undefined, the field is omitted from newly-written configs so they
    // track DEFAULT_API_URL automatically.
    const customApiUrl = normalizeApiUrl(options.apiUrl)

    // 4-way branch based on config and project presence
    if (!config && !project) {
      await runFullSetup(deps, customApiUrl)
    } else if (!config && project) {
      await runLoginAndJoin(deps, project, customApiUrl)
    } else if (config && !project) {
      await runProjectInit(deps, config, customApiUrl)
    } else if (config && project) {
      await ensureOrgMembershipAndShowStatus(deps, config, project)
    }
  }

/**
 * Flow 1: Full setup (login + create project + inject hooks)
 */
async function runFullSetup(deps: ExternalDeps, customApiUrl: string | undefined): Promise<void> {
  console.log(chalk.bold('Argos 초기 설정'))
  console.log()

  const effectiveApiUrl = customApiUrl ?? DEFAULT_API_URL

  // Step 1: Login
  console.log('→ 로그인')

  let loginResponse
  try {
    loginResponse = await deps.auth.login(effectiveApiUrl)
    console.log(chalk.green(`✓ 로그인 완료 (${loginResponse.user.email})`))
  } catch (err) {
    console.error(chalk.red('✗ 로그인 실패'))
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  // Save config — omit apiUrl unless user provided a self-hosted override
  deps.config.write({
    token: loginResponse.token,
    userId: loginResponse.user.id,
    email: loginResponse.user.email,
    ...(customApiUrl && { apiUrl: customApiUrl }),
  })

  // Step 2: Create project
  console.log()
  console.log('→ 프로젝트 생성')

  const projectName = deps.cwd().split('/').pop() || 'my-project'

  const spinner = ora('프로젝트 생성 중...').start()

  let projectResponse: CreateProjectResponse
  try {
    projectResponse = await deps.api.createProject(projectName, loginResponse.token, effectiveApiUrl)
    spinner.succeed(chalk.green(`✓ 프로젝트 생성: ${projectResponse.projectName}`))
    console.log(`  조직: ${projectResponse.orgName}`)
  } catch (err) {
    spinner.fail(chalk.red('✗ 프로젝트 생성 실패'))
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  // Step 3: Write project config
  deps.project.write({
    projectId: projectResponse.projectId,
    orgId: projectResponse.orgId,
    orgSlug: projectResponse.orgSlug,
    orgName: projectResponse.orgName,
    projectName: projectResponse.projectName,
    ...(customApiUrl && { apiUrl: customApiUrl }),
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
  console.log('다음 단계:')
  console.log('  git add .argos/project.json .claude/settings.json')
  console.log('  git commit -m "chore: add argos tracking"')
  console.log()
  console.log('팀원들이 이 저장소를 clone한 뒤 argos를 실행하면 자동으로 팀에 합류됩니다.')
}

/**
 * Flow 2: Login and join existing org (project.json exists, but not logged in)
 */
async function runLoginAndJoin(deps: ExternalDeps, project: ProjectConfig, customApiUrl: string | undefined): Promise<void> {
  console.log(chalk.bold('Argos 로그인'))
  console.log(`프로젝트: ${project.projectName}`)
  console.log()

  const inheritedApiUrl = customApiUrl ?? project.apiUrl
  const effectiveApiUrl = inheritedApiUrl ?? DEFAULT_API_URL

  let loginResponse
  try {
    loginResponse = await deps.auth.login(effectiveApiUrl)
    console.log(chalk.green(`✓ 로그인 완료 (${loginResponse.user.email})`))
  } catch (err) {
    console.error(chalk.red('✗ 로그인 실패'))
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  // Save config — inherit project's override if present, otherwise omit to track default
  deps.config.write({
    token: loginResponse.token,
    userId: loginResponse.user.id,
    email: loginResponse.user.email,
    ...(inheritedApiUrl && { apiUrl: inheritedApiUrl }),
  })

  // Join org
  const spinner = ora('조직 합류 중...').start()
  try {
    await deps.api.joinOrg(project.orgSlug, loginResponse.token, effectiveApiUrl)
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
async function runProjectInit(deps: ExternalDeps, config: Config, customApiUrl: string | undefined): Promise<void> {
  console.log(chalk.green(`✓ 로그인됨: ${config.email}`))
  console.log('→ 이 디렉토리는 아직 Argos 프로젝트가 아닙니다.')
  console.log()

  const inheritedApiUrl = customApiUrl ?? config.apiUrl
  const effectiveApiUrl = inheritedApiUrl ?? DEFAULT_API_URL

  const projectName = deps.cwd().split('/').pop() || 'my-project'

  const spinner = ora('프로젝트 생성 중...').start()

  let projectResponse: CreateProjectResponse
  try {
    projectResponse = await deps.api.createProject(projectName, config.token, effectiveApiUrl)
    spinner.succeed(chalk.green(`✓ 프로젝트 생성: ${projectResponse.projectName}`))
    console.log(`  조직: ${projectResponse.orgName}`)
  } catch (err) {
    spinner.fail(chalk.red('✗ 프로젝트 생성 실패'))
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  // Write project config — inherit user's override if present, otherwise omit
  deps.project.write({
    projectId: projectResponse.projectId,
    orgId: projectResponse.orgId,
    orgSlug: projectResponse.orgSlug,
    orgName: projectResponse.orgName,
    projectName: projectResponse.projectName,
    ...(inheritedApiUrl && { apiUrl: inheritedApiUrl }),
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
    await deps.api.ensureMembership(project.orgSlug, config.token, project.apiUrl ?? config.apiUrl ?? DEFAULT_API_URL)
    spinner.stop()
  } catch {
    spinner.stop()
    // Ignore error - user might already be a member
  }

  // Show status
  console.log(chalk.bold.green('✓ 모두 준비되어 있습니다.'))
  console.log()
  console.log('사용자:  ' + config.email)
  console.log('프로젝트:' + ` ${project.projectName} (${project.projectId})`)
  console.log('조직:    ' + project.orgName)
  console.log('API:     ' + (project.apiUrl ?? config.apiUrl ?? DEFAULT_API_URL))

  // Check hooks
  const settingsPath = join(deps.cwd(), '.claude', 'settings.json')
  const hookResult = deps.hooks.inject(settingsPath)
  if (hookResult === 'injected') {
    console.log('Hooks:   ' + chalk.green('✓ .claude/settings.json에 설치됨'))
  } else {
    console.log('Hooks:   ' + chalk.green('✓ .claude/settings.json에 설치됨'))
  }
}
