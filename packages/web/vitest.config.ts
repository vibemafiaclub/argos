import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', '__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'src/app/api/events/route.ts',
        'src/app/api/orgs/[orgSlug]/members/route.ts',
        'src/app/api/orgs/[orgSlug]/projects/route.ts',
        'src/lib/server/daily-rollup.ts',
      ],
      thresholds: {
        lines: 80,
      },
    },
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
