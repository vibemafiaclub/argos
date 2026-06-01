import { join } from 'path'
import chalk from 'chalk'
import type { ExternalDeps } from '../deps.js'

type InjectResult = 'injected' | 'already_present'

export interface AgentHookResult {
  claude: InjectResult
  codex: InjectResult
}

/**
 * Claude Code(.claude/settings.json) 와 Codex(.codex/hooks.json) hook 을 모두 주입한다.
 * 두 에이전트 중 무엇을 쓰든 argos 가 추적하도록 기본적으로 둘 다 설치한다(미사용 에이전트의 파일은 무해).
 */
export function injectAgentHooks(deps: ExternalDeps, cwd: string): AgentHookResult {
  return {
    claude: deps.hooks.inject(join(cwd, '.claude', 'settings.json'), 'claude'),
    codex: deps.hooks.inject(join(cwd, '.codex', 'hooks.json'), 'codex'),
  }
}

/** 주입 결과를 사람이 읽는 메시지로 출력한다. */
export function printAgentHookResult(result: AgentHookResult): void {
  const line = (label: string, r: InjectResult) =>
    r === 'injected'
      ? chalk.green(`✓ ${label} hooks 설치 완료`)
      : chalk.yellow(`✓ ${label} hooks 이미 설치됨`)
  console.log(line('Claude Code (.claude/settings.json)', result.claude))
  console.log(line('Codex (.codex/hooks.json)', result.codex))
}

/**
 * Codex 는 신뢰되지 않은 hook 을 실행하지 않는다(대화형 `/hooks` 리뷰로 신뢰 등록 필요).
 * 세팅 직후 사용자가 한 번은 거쳐야 하는 단계이므로 명시적으로 안내한다.
 */
export function printCodexTrustNotice(): void {
  console.log()
  console.log(chalk.bold('Codex 사용자 추가 단계 (1회):'))
  console.log('  Codex 는 보안상 새 hook 을 자동 실행하지 않습니다.')
  console.log('  codex 를 실행한 뒤 ' + chalk.cyan('/hooks') + ' 에서 argos hook 들을 trust 하세요.')
}
