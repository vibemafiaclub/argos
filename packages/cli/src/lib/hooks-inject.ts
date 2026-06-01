import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

// 트래킹 대상 에이전트. Claude Code 와 Codex 는 hook 설정 파일 모양이 동일(`{ hooks: { <Event>: [...] } }`)해서
// 동일한 주입 로직을 쓰되, hook command 에 `--agent codex` 를 붙여 `argos hook` 이 transcript 파서를 분기하게 한다.
export type HookAgent = 'claude' | 'codex'

const ARGOS_HOOK_COMMAND = 'argos hook'
const ARGOS_HOOK_COMMAND_CODEX = 'argos hook --agent codex'
// SessionStart에서만 사용. argos CLI가 PATH에 없으면 자동 전역 설치 후 hook 실행.
// 신규 팀원이 저장소를 clone한 직후 에이전트를 열었을 때 설치가 끊김없이 이어지도록 하는 부트스트랩.
// POSIX 셸 기준(command, ||, ;). Windows는 shell 차이로 동작하지 않을 수 있다.
const ARGOS_SESSION_START_COMMAND =
  'command -v argos >/dev/null 2>&1 || npm install -g argos-ai@latest; argos hook'
const ARGOS_SESSION_START_COMMAND_CODEX =
  'command -v argos >/dev/null 2>&1 || npm install -g argos-ai@latest; argos hook --agent codex'

const HOOK_EVENTS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop']

function commandForEvent(event: string, agent: HookAgent): string {
  if (agent === 'codex') {
    return event === 'SessionStart' ? ARGOS_SESSION_START_COMMAND_CODEX : ARGOS_HOOK_COMMAND_CODEX
  }
  return event === 'SessionStart' ? ARGOS_SESSION_START_COMMAND : ARGOS_HOOK_COMMAND
}

// 기존 argos 훅(구버전 `argos hook`, bootstrap, 또는 `--agent codex` 변형)이 있으면 "이미 존재"로 본다.
function isArgosCommand(cmd: string): boolean {
  return cmd.includes('argos hook')
}

interface HookConfig {
  type: string
  command: string
}

interface HookEntry {
  matcher: string
  hooks: HookConfig[]
}

interface SettingsJson {
  hooks?: Record<string, HookEntry[]>
}

/**
 * Inject Argos hooks into an agent's hook config file.
 *  - Claude Code: `.claude/settings.json`  (command: `argos hook`)
 *  - Codex:       `.codex/hooks.json`       (command: `argos hook --agent codex`)
 * 두 파일 모두 `{ hooks: { <Event>: [{ matcher, hooks: [...] }] } }` 구조라 동일 로직을 공유한다.
 * Idempotent - won't duplicate if already present
 * @param settingsPath Path to the hook config file
 * @param agent 'claude'(default) | 'codex'
 * @returns 'injected' if new hooks were added, 'already_present' if hooks were already there
 */
export function injectHooks(
  settingsPath: string,
  agent: HookAgent = 'claude'
): 'injected' | 'already_present' {
  // Ensure directory exists
  const settingsDir = dirname(settingsPath)
  if (!existsSync(settingsDir)) {
    mkdirSync(settingsDir, { recursive: true })
  }

  // Read existing settings or create empty object
  let settings: SettingsJson = {}
  if (existsSync(settingsPath)) {
    try {
      const content = readFileSync(settingsPath, 'utf8')
      settings = JSON.parse(content)
    } catch {
      // If file is corrupted, start fresh
      settings = {}
    }
  }

  settings.hooks = settings.hooks || {}

  let changed = false

  for (const event of HOOK_EVENTS) {
    const hooks: HookEntry[] = settings.hooks[event] || []

    // Check if any argos-related hook already exists for this event
    const alreadyExists = hooks.some((entry) =>
      entry.hooks?.some((hook) => isArgosCommand(hook.command))
    )

    if (!alreadyExists) {
      hooks.push({
        matcher: '',
        hooks: [{ type: 'command', command: commandForEvent(event, agent) }],
      })
      settings.hooks[event] = hooks
      changed = true
    }
  }

  if (changed) {
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8')
    return 'injected'
  }

  return 'already_present'
}
