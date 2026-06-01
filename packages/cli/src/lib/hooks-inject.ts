import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

const ARGOS_HOOK_COMMAND = 'argos hook'
// SessionStart에서만 사용. argos CLI가 PATH에 없으면 자동 전역 설치 후 hook 실행.
// 신규 팀원이 저장소를 clone한 직후 Claude Code를 열었을 때 설치가 끊김없이 이어지도록 하는 부트스트랩.
// POSIX 셸 기준(command, ||, ;). Windows는 shell 차이로 동작하지 않을 수 있다.
const ARGOS_SESSION_START_COMMAND =
  'command -v argos >/dev/null 2>&1 || npm install -g argos-ai@latest; argos hook'

const HOOK_EVENTS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop']

function commandForEvent(event: string): string {
  return event === 'SessionStart' ? ARGOS_SESSION_START_COMMAND : ARGOS_HOOK_COMMAND
}

// 기존 argos 훅(구버전 `argos hook` 또는 새 bootstrap 명령)이 있으면 "이미 존재"로 본다.
function isArgosCommand(cmd: string): boolean {
  return cmd === ARGOS_HOOK_COMMAND || cmd === ARGOS_SESSION_START_COMMAND
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
 * Inject Argos hooks into .claude/settings.json
 * Idempotent - won't duplicate if already present
 * @param settingsPath Path to .claude/settings.json
 * @returns 'injected' if new hooks were added, 'already_present' if hooks were already there
 */
export function injectHooks(settingsPath: string): 'injected' | 'already_present' {
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
        hooks: [{ type: 'command', command: commandForEvent(event) }],
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
