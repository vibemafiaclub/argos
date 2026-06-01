/**
 * backfill-cost.ts — Issue #15 follow-up
 *
 * 단가 테이블/정규화 수정 (pricing.ts, cost.ts) 전에 적재된 usage_records 의
 * estimated_cost_usd 를 최신 calculateCost() 로 재계산하여 일치시킨다.
 *
 * 동작:
 *  1. usage_records 전체를 batch(=1000) cursor pagination 으로 순회
 *  2. 각 row 마다 calculateCost() 로 재계산
 *  3. 기존값과 다른 경우만 UPDATE
 *  4. 변경된 row 의 (projectId, UTC date) pair 를 모아 daily_project_stats.computed_at
 *     을 epoch(1970-01-01) 으로 reset → 다음 dashboard 호출 시 lazy rebuild
 *     (daily-rollup.ts:508 의 SKILL_COUNTS_INVALIDATION_AT stale 가드 활용)
 *
 * Dry-run 기본:
 *   pnpm --filter web tsx scripts/backfill-cost.ts            # dry-run
 *   pnpm --filter web tsx scripts/backfill-cost.ts --execute  # 실제 적용
 *
 * 멱등성: 두 번째 실행은 changed=0 이어야 함 (단가 테이블이 안 바뀌었다면).
 */

import { PrismaClient } from '@prisma/client'
import { calculateCost } from '../src/lib/server/cost'

const args = process.argv.slice(2)
const isDryRun = !args.includes('--execute')
const BATCH_SIZE = 1000
const EPSILON = 1e-9 // float 비교 허용오차 (사실상 동일)

const prisma = new PrismaClient()

interface AffectedKey {
  projectId: string
  day: string // YYYY-MM-DD (UTC)
}

async function main() {
  console.log('=== backfill-cost ===')
  console.log(`Mode       : ${isDryRun ? 'DRY-RUN (pass --execute to apply)' : 'EXECUTE'}`)
  console.log(`Batch size : ${BATCH_SIZE}`)
  console.log()

  let cursor: string | undefined
  let scanned = 0
  let changed = 0
  let sumOldCost = 0
  let sumNewCost = 0
  const affectedPairs = new Set<string>() // `${projectId}|${YYYY-MM-DD}`
  const samples: Array<{ id: string; model: string | null; old: number; new: number }> = []

  while (true) {
    const batch = await prisma.usageRecord.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        projectId: true,
        timestamp: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        cacheCreationTokens: true,
        cacheReadTokens: true,
        estimatedCostUsd: true,
      },
    })
    if (batch.length === 0) break
    cursor = batch[batch.length - 1].id

    const updates: Array<{ id: string; newCost: number }> = []
    for (const r of batch) {
      scanned++
      const newCost = calculateCost({
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        cacheCreationTokens: r.cacheCreationTokens,
        cacheReadTokens: r.cacheReadTokens,
        model: r.model ?? undefined,
      })
      const oldCost = r.estimatedCostUsd ?? 0

      if (Math.abs(newCost - oldCost) > EPSILON) {
        changed++
        sumOldCost += oldCost
        sumNewCost += newCost
        updates.push({ id: r.id, newCost })
        const day = r.timestamp.toISOString().slice(0, 10)
        affectedPairs.add(`${r.projectId}|${day}`)
        if (samples.length < 10) {
          samples.push({ id: r.id, model: r.model, old: oldCost, new: newCost })
        }
      }
    }

    if (!isDryRun && updates.length > 0) {
      // 작은 트랜잭션 묶음 (배치별). 충돌 없는 단순 PK UPDATE 라 동시성 위험 낮음.
      await prisma.$transaction(
        updates.map((u) =>
          prisma.usageRecord.update({
            where: { id: u.id },
            data: { estimatedCostUsd: u.newCost },
          }),
        ),
      )
    }

    if (scanned % 10_000 === 0) {
      console.log(`  ... scanned=${scanned} changed=${changed}`)
    }
  }

  console.log()
  console.log(`scanned          : ${scanned}`)
  console.log(`changed          : ${changed}`)
  console.log(`affected (proj,date) pairs : ${affectedPairs.size}`)
  console.log(`sum(old estimated cost USD) : ${sumOldCost.toFixed(4)}`)
  console.log(`sum(new estimated cost USD) : ${sumNewCost.toFixed(4)}`)
  console.log(`delta                       : ${(sumNewCost - sumOldCost).toFixed(4)}`)
  console.log()

  if (samples.length > 0) {
    console.log('Sample diffs (up to 10):')
    for (const s of samples) {
      const diff = (s.new - s.old).toFixed(4)
      console.log(`  id=${s.id}  model=${s.model ?? '(null)'}  old=${s.old.toFixed(4)}  new=${s.new.toFixed(4)}  Δ=${diff}`)
    }
    console.log()
  }

  if (isDryRun) {
    console.log('Re-run with --execute to apply.')
    return
  }

  if (affectedPairs.size === 0) {
    console.log('No changes — daily_project_stats invalidation skipped.')
    return
  }

  // ─── daily_project_stats invalidation ──────────────────────────────────────
  // computed_at = epoch 으로 reset → daily-rollup.ts:508 의 stale 가드
  // (`row.computedAt < SKILL_COUNTS_INVALIDATION_AT`) 가 항상 통과 → lazy rebuild.
  const pairs: AffectedKey[] = Array.from(affectedPairs).map((s) => {
    const [projectId, day] = s.split('|')
    return { projectId, day }
  })

  console.log(`Invalidating ${pairs.length} daily_project_stats rows...`)
  let invalidated = 0
  const PAIR_BATCH = 100
  for (let i = 0; i < pairs.length; i += PAIR_BATCH) {
    const slice = pairs.slice(i, i + PAIR_BATCH)
    const results = await prisma.$transaction(
      slice.map((p) =>
        prisma.dailyProjectStat.updateMany({
          where: { projectId: p.projectId, date: new Date(`${p.day}T00:00:00.000Z`) },
          data: { computedAt: new Date(0) },
        }),
      ),
    )
    invalidated += results.reduce((sum, r) => sum + r.count, 0)
  }
  console.log(`Invalidated ${invalidated} daily_project_stats row(s).`)
  console.log('Next dashboard call will lazily rebuild these days.')
}

main()
  .catch((err) => {
    console.error('[ERROR]', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
