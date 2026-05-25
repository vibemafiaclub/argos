import chalk from 'chalk'
import ora from 'ora'
import { DEFAULT_API_URL, normalizeApiUrl } from '../lib/config.js'
import { injectAgentHooks, printAgentHookResult, printCodexTrustNotice } from '../lib/inject-agent-hooks.js'
import type { CreateProjectResponse } from '@argos/shared'
import type { CommandFactory, ExternalDeps } from '../deps.js'
import type { Config } from '../lib/config.js'
import type { ProjectConfig } from '../lib/project.js'

interface SetupCommandOptions {
  token?: string
  apiUrl?: string
}

/**
 * 비대화형 초기 설정.
 * 웹 가입 직후 발급된 onboard token을 받아 로그인 → 프로젝트 연결/생성 → hook 설치까지 한 번에.
 * 사용자 입력 일체 없음.
 */
export const makeSetupCommand: CommandFactory<SetupCommandOptions> =
  (deps) => async (options) => {
    const existingConfig = deps.config.read()
    const existingProject = deps.project.find()
    const inheritedApiUrl = normalizeApiUrl(options.apiUrl) ?? existingProject?.apiUrl ?? existingConfig?.apiUrl
    const effectiveApiUrl = inheritedApiUrl ?? DEFAULT_API_URL

    if (!options.token) {
      if (existingConfig && existingProject) {
        console.log(chalk.bold('Argos 초기 설정'))
        console.log()
        await connectExistingProject(deps, existingConfig, existingProject, effectiveApiUrl)
        return
      }

      console.error(chalk.red('✗ --token 인자가 필요합니다.'))
      console.error('예: argos setup --token=argos_onb_XXXX')
      console.error()
      console.error('이미 .argos/project.json 이 있는 저장소에 합류하는 경우에는 repo 루트에서 argos 를 실행하세요.')
      process.exit(1)
    }

    console.log(chalk.bold('Argos 초기 설정'))
    console.log()

    if (existingConfig && existingProject) {
      console.log(chalk.yellow('이미 Argos 프로젝트와 로그인 설정이 있습니다. 프로젝트 생성은 건너뜁니다.'))
      console.log()
      await connectExistingProject(deps, existingConfig, existingProject, effectiveApiUrl)
      return
    }

    // Step 1: onboard token 교환
    const loginSpinner = ora('로그인 중...').start()
    let exchange
    try {
      exchange = await deps.api.exchange(options.token, effectiveApiUrl)
      loginSpinner.succeed(chalk.green(`✓ 로그인 완료 (${exchange.user.email})`))
    } catch (err) {
      loginSpinner.fail(chalk.red('✗ 로그인 실패'))
      console.error(err instanceof Error ? err.message : String(err))
      console.error(chalk.yellow('토큰이 만료되었거나 이미 사용되었을 수 있습니다. 웹에서 새 프롬프트를 발급받으세요.'))
      process.exit(1)
    }

    deps.config.write({
      token: exchange.token,
      userId: exchange.user.id,
      email: exchange.user.email,
      ...(inheritedApiUrl && { apiUrl: inheritedApiUrl }),
    })

    if (existingProject) {
      await connectExistingProject(
        deps,
        {
          token: exchange.token,
          userId: exchange.user.id,
          email: exchange.user.email,
          ...(inheritedApiUrl && { apiUrl: inheritedApiUrl }),
        },
        existingProject,
        effectiveApiUrl
      )
      return
    }

    // Step 2: 프로젝트 생성 (cwd 디렉터리명 기반). org가 없으면 adapter에서 자동 생성.
    const projectName = deps.cwd().split('/').pop() || 'my-project'
    const projectSpinner = ora('프로젝트 생성 중...').start()

    let projectResponse: CreateProjectResponse
    try {
      projectResponse = await deps.api.createProject(projectName, exchange.token, effectiveApiUrl)
      projectSpinner.succeed(chalk.green(`✓ 프로젝트 생성: ${projectResponse.projectName}`))
      console.log(`  조직: ${projectResponse.orgName}`)
    } catch (err) {
      projectSpinner.fail(chalk.red('✗ 프로젝트 생성 실패'))
      console.error(err instanceof Error ? err.message : String(err))
      if (isProjectCreationForbidden(err)) {
        console.error()
        console.error(chalk.yellow('프로젝트 생성은 MANAGER 이상만 할 수 있습니다.'))
        console.error(chalk.yellow('이미 .argos/project.json 이 커밋된 저장소라면 repo 루트에서 argos setup --token=... 을 다시 실행하면 기존 프로젝트에 연결됩니다.'))
        console.error(chalk.yellow('아직 .argos/project.json 이 없다면 관리자에게 프로젝트 생성을 요청하세요.'))
      }
      process.exit(1)
    }

    // Step 3: project config 기록
    deps.project.write({
      projectId: projectResponse.projectId,
      orgId: projectResponse.orgId,
      orgSlug: projectResponse.orgSlug,
      orgName: projectResponse.orgName,
      projectName: projectResponse.projectName,
      ...(inheritedApiUrl && { apiUrl: inheritedApiUrl }),
    })
    console.log(chalk.green('✓ .argos/project.json 작성'))

    // Step 4: hook 설치 (Claude Code + Codex)
    printAgentHookResult(injectAgentHooks(deps, deps.cwd()))
    printCodexTrustNotice()

    console.log()
    console.log(chalk.bold.green('✓ 설정 완료!'))
    console.log()
    console.log('다음 단계:')
    console.log('  git add .argos/project.json .claude/settings.json .codex/hooks.json')
    console.log('  git commit -m "chore: add argos tracking"')
  }

async function connectExistingProject(
  deps: ExternalDeps,
  config: Config,
  project: ProjectConfig,
  effectiveApiUrl: string
): Promise<void> {
  console.log(chalk.green(`✓ 로그인됨: ${config.email}`))
  console.log(`프로젝트: ${project.projectName}`)
  console.log()

  const orgIdentifier = project.orgSlug ?? project.orgId
  const joinSpinner = ora('기존 프로젝트 연결 중...').start()
  try {
    await deps.api.joinOrg(orgIdentifier, config.token, effectiveApiUrl)
    joinSpinner.succeed(chalk.green(`✓ 조직 합류 확인: ${project.orgName}`))
  } catch (err) {
    joinSpinner.fail(chalk.red('✗ 기존 프로젝트 연결 실패'))
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  printAgentHookResult(injectAgentHooks(deps, deps.cwd()))
  printCodexTrustNotice()

  console.log()
  console.log(chalk.bold.green('✓ 설정 완료!'))
  console.log()
  console.log('기존 프로젝트에 연결되었습니다. Claude Code · Codex 를 사용하면 자동으로 기록됩니다.')
}

function isProjectCreationForbidden(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return message.includes('API Error (403)') || message.includes('MANAGER 이상')
}
