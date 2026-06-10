import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Guard: DB-dependent tests must run against localhost only.
// If DATABASE_URL points to a remote host, bail early to prevent writes
// to the shared Supabase instance.
const dbUrl = process.env.DATABASE_URL ?? ''
if (dbUrl && !/(localhost|127\.0\.0\.1)/.test(dbUrl)) {
  console.error(
    '❌ vitest: DATABASE_URL must point to localhost or 127.0.0.1 in tests.\n' +
    '   Got: ' + dbUrl + '\n' +
    '   Start a local Postgres with: docker-compose up -d postgres\n' +
    '   Then set DATABASE_URL=postgresql://argos:argos@localhost:5432/argos',
  )
  process.exit(1)
}

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // .env.local を自動ロードして DATABASE_URL などのローカル環境変数を有効化
    env: (() => {
      try {
        const fs = require('node:fs')
        const envPath = path.resolve(__dirname, '.env.local')
        if (!fs.existsSync(envPath)) return {}
        const content = fs.readFileSync(envPath, 'utf8') as string
        const vars: Record<string, string> = {}
        for (const line of content.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) continue
          const eq = trimmed.indexOf('=')
          if (eq === -1) continue
          const key = trimmed.slice(0, eq).trim()
          let val = trimmed.slice(eq + 1).trim()
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1)
          }
          vars[key] = val
        }
        return vars
      } catch {
        return {}
      }
    })(),
  },
})
