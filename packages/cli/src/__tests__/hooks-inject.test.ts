import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { injectHooks } from '../lib/hooks-inject.js'

const HOOK_EVENTS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop']
const ARGOS_COMMAND = 'argos hook'

function hasArgosHook(entries: any[]): boolean {
  return entries.some((entry: any) =>
    entry.hooks?.some((h: any) => h.command === ARGOS_COMMAND)
  )
}

function argosHookCount(entries: any[]): number {
  return entries.filter((entry: any) =>
    entry.hooks?.some((h: any) => h.command === ARGOS_COMMAND)
  ).length
}

describe('injectHooks', () => {
  let tempDir: string
  let settingsPath: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'argos-test-'))
    settingsPath = join(tempDir, '.claude', 'settings.json')
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('creates settings.json with all 5 hooks when file does not exist', () => {
    const result = injectHooks(settingsPath)

    expect(result).toBe('injected')

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
    for (const event of HOOK_EVENTS) {
      expect(settings.hooks[event], `missing hook for ${event}`).toBeDefined()
      expect(hasArgosHook(settings.hooks[event]), `argos hook not found in ${event}`).toBe(true)
    }
  })

  it('returns already_present on second call without duplicating hooks', () => {
    injectHooks(settingsPath)
    const result = injectHooks(settingsPath)

    expect(result).toBe('already_present')

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
    for (const event of HOOK_EVENTS) {
      expect(argosHookCount(settings.hooks[event]), `duplicate in ${event}`).toBe(1)
    }
  })

  it('is idempotent across 3+ repeated calls', () => {
    for (let i = 0; i < 5; i++) {
      injectHooks(settingsPath)
    }

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
    for (const event of HOOK_EVENTS) {
      expect(argosHookCount(settings.hooks[event])).toBe(1)
    }
  })

  it('preserves existing hooks when injecting', () => {
    mkdirSync(join(tempDir, '.claude'), { recursive: true })
    const existing = {
      hooks: {
        SessionStart: [
          { matcher: 'my-tool', hooks: [{ type: 'command', command: 'my-custom-script' }] },
        ],
      },
    }
    writeFileSync(settingsPath, JSON.stringify(existing), 'utf8')

    injectHooks(settingsPath)

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
    // Original hook is preserved
    expect(settings.hooks.SessionStart).toHaveLength(2)
    expect(settings.hooks.SessionStart[0].hooks[0].command).toBe('my-custom-script')
    // Argos hook is appended
    expect(hasArgosHook(settings.hooks.SessionStart)).toBe(true)
  })

  it('does not re-inject if argos hook is nested inside an existing entry', () => {
    // Simulate a settings.json where the argos hook was already injected
    // in a non-standard position (e.g., bundled with another hook)
    mkdirSync(join(tempDir, '.claude'), { recursive: true })
    const existing = {
      hooks: {
        Stop: [
          {
            matcher: '',
            hooks: [
              { type: 'command', command: 'other-hook' },
              { type: 'command', command: ARGOS_COMMAND },
            ],
          },
        ],
      },
    }
    writeFileSync(settingsPath, JSON.stringify(existing), 'utf8')

    // Partial inject: Stop already has argos hook, others don't
    const result = injectHooks(settingsPath)
    expect(result).toBe('injected') // other 4 events still need injection

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
    // Stop should not have been duplicated
    expect(argosHookCount(settings.hooks.Stop)).toBe(1)
  })

  it('handles corrupted settings.json by starting fresh', () => {
    mkdirSync(join(tempDir, '.claude'), { recursive: true })
    writeFileSync(settingsPath, '{ this is not valid json }', 'utf8')

    const result = injectHooks(settingsPath)
    expect(result).toBe('injected')

    // Output should be valid JSON with all hooks
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
    expect(settings.hooks).toBeDefined()
    for (const event of HOOK_EVENTS) {
      expect(hasArgosHook(settings.hooks[event])).toBe(true)
    }
  })

  it('creates the .claude directory if it does not exist', () => {
    // tempDir has no .claude subdir
    expect(() => injectHooks(settingsPath)).not.toThrow()
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
    expect(settings.hooks).toBeDefined()
  })

  it('writes hooks with correct structure (matcher, type, command)', () => {
    injectHooks(settingsPath)

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
    const stopEntries = settings.hooks.Stop
    const argosEntry = stopEntries.find((e: any) =>
      e.hooks?.some((h: any) => h.command === ARGOS_COMMAND)
    )

    expect(argosEntry.matcher).toBe('')
    expect(argosEntry.hooks[0].type).toBe('command')
    expect(argosEntry.hooks[0].command).toBe(ARGOS_COMMAND)
  })
})
