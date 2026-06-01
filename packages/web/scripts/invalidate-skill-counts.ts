/**
 * invalidate-skill-counts.ts
 *
 * Oneshot CLI 스크립트: daily_project_stats 테이블에서
 * computedAt < SKILL_COUNTS_INVALIDATION_AT 인 row 의 skill_counts 를 '{}'::jsonb 로,
 * computed_at 을 '1970-01-01T00:00:00Z' 로 reset 한다.
 *
 * 목적: speed-up (correctness 는 daily-rollup.ts 의 lazy 가드가 보장).
 *
 * 실행 runbook (Decision-9):
 *   Step 1. 새 코드(SKILL_COUNTS_INVALIDATION_AT 가드 포함)를 모든 인스턴스에 배포 완료.
 *   Step 2. 30분 안정화 후 1차 실행:
 *           pnpm --filter web tsx scripts/invalidate-skill-counts.ts
 *   Step 3. 10분 후 2차 sweep — 0 rows 이면 race 없음 확인:
 *           pnpm --filter web tsx scripts/invalidate-skill-counts.ts
 *
 * 멱등성: WHERE computed_at < THRESHOLD 방식이므로 두 번째 실행은 0 rows.
 *
 * Dry-run 모드 (기본값):
 *   - --dry-run 플래그 또는 환경변수 DRY_RUN=true → 실제 UPDATE 없이 영향받을 row 수만 표시.
 *   - --execute 플래그를 명시해야 실제 UPDATE 실행.
 *
 * 사용법:
 *   pnpm --filter web tsx scripts/invalidate-skill-counts.ts              # dry-run
 *   pnpm --filter web tsx scripts/invalidate-skill-counts.ts --execute    # 실제 실행
 */

import { PrismaClient, Prisma } from '@prisma/client'
import { SKILL_COUNTS_INVALIDATION_AT } from '../src/lib/server/daily-rollup'

// ─── Argument parsing ──────────────────────────────────────────────────────

const args = process.argv.slice(2)
const isDryRun = !args.includes('--execute') || process.env.DRY_RUN === 'true'

// ─── Prisma client (standalone, not the cached global singleton) ───────────

const prisma = new PrismaClient()

// ─── Types for raw query results ──────────────────────────────────────────

interface AffectedRow {
  project_id: string
  date: Date | string
}

interface CountRow {
  count: bigint | string
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== invalidate-skill-counts ===')
  console.log(`SKILL_COUNTS_INVALIDATION_AT : ${SKILL_COUNTS_INVALIDATION_AT.toISOString()}`)
  console.log(`Mode                         : ${isDryRun ? 'DRY-RUN (pass --execute to apply)' : 'EXECUTE'}`)
  console.log()

  if (isDryRun) {
    // Dry-run: COUNT only — no mutation
    const countResult = await prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*) AS count
      FROM daily_project_stats
      WHERE computed_at < ${SKILL_COUNTS_INVALIDATION_AT}::timestamptz
    `
    const count = Number(countResult[0]?.count ?? 0)

    // Show sample rows (up to 5) for human review
    const sampleRows = await prisma.$queryRaw<AffectedRow[]>`
      SELECT project_id, date
      FROM daily_project_stats
      WHERE computed_at < ${SKILL_COUNTS_INVALIDATION_AT}::timestamptz
      ORDER BY date DESC
      LIMIT 5
    `

    console.log(`[DRY-RUN] Would reset ${count} row(s).`)
    if (sampleRows.length > 0) {
      console.log(`[DRY-RUN] Sample (up to 5, date DESC):`)
      for (const row of sampleRows) {
        const dateStr = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10)
        console.log(`  project_id=${row.project_id}  date=${dateStr}`)
      }
    } else {
      console.log('[DRY-RUN] No rows matched — nothing to reset.')
    }
    console.log()
    console.log('Re-run with --execute to apply.')
  } else {
    // Execute: UPDATE + RETURNING
    const affected = await prisma.$queryRaw<AffectedRow[]>`
      UPDATE daily_project_stats
      SET
        skill_counts = '{}'::jsonb,
        computed_at  = '1970-01-01T00:00:00Z'::timestamptz
      WHERE computed_at < ${SKILL_COUNTS_INVALIDATION_AT}::timestamptz
      RETURNING project_id, date
    `

    const count = affected.length
    console.log(`[EXECUTE] Reset ${count} row(s).`)

    if (count === 0) {
      console.log('[EXECUTE] 0 rows — either already clean or 2nd sweep (race guard passed).')
    } else {
      // Print first and last 5 samples
      const sample = affected
        .sort((a, b) => {
          const da = a.date instanceof Date ? a.date : new Date(String(a.date))
          const db_ = b.date instanceof Date ? b.date : new Date(String(b.date))
          return db_.getTime() - da.getTime()
        })
        .slice(0, 5)

      console.log(`[EXECUTE] Sample (up to 5, date DESC):`)
      for (const row of sample) {
        const dateStr = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10)
        console.log(`  project_id=${row.project_id}  date=${dateStr}`)
      }
    }

    console.log()
    console.log('Run again in 10 min to verify 0 rows (race guard check).')
  }
}

main()
  .catch((err) => {
    console.error('[ERROR]', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
