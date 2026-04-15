import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

const ARGOS_HOOK_COMMAND = 'argos hook'
const HOOK_EVENTS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop']

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

    // Check if argos hook already exists
    const alreadyExists = hooks.some((entry) =>
      entry.hooks?.some((hook) => hook.command === ARGOS_HOOK_COMMAND)
    )

    if (!alreadyExists) {
      hooks.push({
        matcher: '',
        hooks: [{ type: 'command', command: ARGOS_HOOK_COMMAND }],
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
