#!/usr/bin/env node
import { Command } from 'commander'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { realDeps } from './adapters.js'
import { makeDefaultCommand } from './commands/default.js'
import { makeHookCommand } from './commands/hook.js'
import { makeSetupCommand } from './commands/setup.js'
import { makeStatusCommand } from './commands/status.js'
import { makeLogoutCommand } from './commands/logout.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read package.json for version
const pkgPath = join(__dirname, '..', 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))

const program = new Command()
  .name('argos')
  .description('Claude Code observability for AI-native teams')
  .version(pkg.version)
  .option('--api-url <url>', 'API URL override (for self-hosting)')

// Default command (argos without subcommand)
program.action(makeDefaultCommand(realDeps))

// Setup command (called with onboard token from web signup prompt)
program
  .command('setup')
  .description('non-interactive setup or existing project connection using onboard token')
  .option('--token <token>', 'onboard token issued by the Argos web app')
  .option('--api-url <url>', 'API URL override (for self-hosting)')
  .action(makeSetupCommand(realDeps))

// Hook command (internal - called by Claude Code)
program
  .command('hook')
  .description('[internal] process hook event from stdin')
  .option('--agent <agent>', 'source agent: claude (default) or codex')
  .action(makeHookCommand(realDeps))

// Status command
program
  .command('status')
  .description('show current setup status')
  .action(makeStatusCommand(realDeps))

// Logout command
program
  .command('logout')
  .description('log out and remove local credentials')
  .action(makeLogoutCommand(realDeps))

// Parse and execute
program.parseAsync(process.argv).catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
