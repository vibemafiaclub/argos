#!/usr/bin/env node
import { Command } from 'commander'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { realDeps } from './adapters.js'
import { makeDefaultCommand } from './commands/default.js'
import { makeHookCommand } from './commands/hook.js'
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

// Hook command (internal - called by Claude Code)
program
  .command('hook')
  .description('[internal] process hook event from stdin')
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
