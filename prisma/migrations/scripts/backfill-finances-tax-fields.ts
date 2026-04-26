/**
 * Phase 1 backfill — populate BankTransaction.taxType / isReviewed and
 * CategorizationRule.taxType from existing category tree membership.
 *
 * Idempotent. Safe to re-run.
 *
 * Run:   tsx prisma/migrations/scripts/backfill-finances-tax-fields.ts
 * Dry:   tsx prisma/migrations/scripts/backfill-finances-tax-fields.ts --dry-run
 *
 * Logic:
 *   - For every categorized row, walk the category.parent chain up to the
 *     nearest isSystemGroup=true ancestor. Its slug ("business" | "personal")
 *     is the row's taxType — unless the category lives under the reserved
 *     "business-income" subgroup, in which case taxType is "service_income".
 *   - isReviewed is set to true for every row that has a categoryId.
 *   - CategorizationRule rows get taxType inferred the same way so legacy
 *     rules work in the new UX immediately.
 */
import "dotenv/config"
import { PrismaClient } from "../../../src/generated/prisma"
import { INCOME_GROUP_SLUGS } from "../../../src/lib/income-categories"

const prisma = new PrismaClient({ accelerateUrl: process.env.DATABASE_URL })
const DRY_RUN = process.argv.includes("--dry-run")

type CatRow = {
  id: number
  slug: string
  parentId: number | null
  isSystemGroup: boolean
}

/**
 * Resolve a category's taxType by walking parents once. Uses a memoizing
 * cache so repeated lookups across thousands of transactions are O(depth).
 * Returns null if the chain never reaches a system group.
 */
function buildResolver(categoriesById: Map<number, CatRow>) {
  const cache = new Map<number, string | null>()

  function resolve(categoryId: number): string | null {
    if (cache.has(categoryId)) return cache.get(categoryId)!

    let current: CatRow | undefined = categoriesById.get(categoryId)
    // Walk up, tracking whether we ever pass through an income subgroup
    let passedThroughBusinessIncome = false
    let passedThroughPersonalIncome = false

    while (current) {
      if (current.slug === INCOME_GROUP_SLUGS.business) passedThroughBusinessIncome = true
      if (current.slug === INCOME_GROUP_SLUGS.personal) passedThroughPersonalIncome = true

      if (current.isSystemGroup) {
        let taxType: string | null
        if (passedThroughBusinessIncome) taxType = "service_income"
        else if (passedThroughPersonalIncome) taxType = "personal"
        else if (current.slug === "business") taxType = "business"
        else if (current.slug === "personal") taxType = "personal"
        else taxType = null
        cache.set(categoryId, taxType)
        return taxType
      }

      current = current.parentId != null ? categoriesById.get(current.parentId) : undefined
    }

    cache.set(categoryId, null)
    return null
  }

  return resolve
}

async function backfillBankTransactions() {
  const categories = await prisma.transactionCategory.findMany({
    select: { id: true, slug: true, parentId: true, isSystemGroup: true },
  })
  const catMap = new Map<number, CatRow>(categories.map((c: CatRow) => [c.id, c]))
  const resolve = buildResolver(catMap)

  const categorizedTxns = await prisma.bankTransaction.findMany({
    where: { categoryId: { not: null } },
    select: { id: true, categoryId: true, taxType: true, isReviewed: true },
  })

  // Group by target taxType for batch updates
  const byTaxType = new Map<string | "__null__", number[]>()
  const orphaned: number[] = []
  let alreadyCorrect = 0

  for (const tx of categorizedTxns) {
    const resolved = resolve(tx.categoryId!)
    if (resolved === null) {
      orphaned.push(tx.id)
      continue
    }
    if (tx.taxType === resolved && tx.isReviewed === true) {
      alreadyCorrect++
      continue
    }
    const bucket = byTaxType.get(resolved) ?? []
    bucket.push(tx.id)
    byTaxType.set(resolved, bucket)
  }

  console.log(`\n[BankTransaction backfill]`)
  console.log(`  total categorized rows: ${categorizedTxns.length}`)
  console.log(`  already correct:        ${alreadyCorrect}`)
  console.log(`  orphaned (no system group ancestor): ${orphaned.length}`)
  for (const [taxType, ids] of byTaxType) {
    console.log(`  → ${taxType}: ${ids.length} rows`)
  }

  if (orphaned.length > 0) {
    console.log(`  orphaned IDs (first 20): ${orphaned.slice(0, 20).join(", ")}`)
  }

  if (DRY_RUN) {
    console.log(`  [dry-run] no writes performed`)
    return
  }

  for (const [taxType, ids] of byTaxType) {
    await prisma.bankTransaction.updateMany({
      where: { id: { in: ids } },
      data: { taxType, isReviewed: true },
    })
  }

  // Catch any row that was already correctly tagged but missing isReviewed
  const { count: reviewedPatched } = await prisma.bankTransaction.updateMany({
    where: { categoryId: { not: null }, isReviewed: false },
    data: { isReviewed: true },
  })
  if (reviewedPatched > 0) {
    console.log(`  patched isReviewed on ${reviewedPatched} additional rows`)
  }
}

async function backfillCategorizationRules() {
  const categories = await prisma.transactionCategory.findMany({
    select: { id: true, slug: true, parentId: true, isSystemGroup: true },
  })
  const catMap = new Map<number, CatRow>(categories.map((c: CatRow) => [c.id, c]))
  const resolve = buildResolver(catMap)

  const rules = await prisma.categorizationRule.findMany({
    select: { id: true, categoryId: true, taxType: true },
  })

  const updates: { id: number; taxType: string }[] = []
  const orphaned: number[] = []
  let alreadyHave = 0

  for (const r of rules) {
    if (r.taxType !== null) {
      alreadyHave++
      continue
    }
    if (r.categoryId === null) {
      // Rule has no categoryId (taxType-only rule); nothing to infer from.
      orphaned.push(r.id)
      continue
    }
    const resolved = resolve(r.categoryId)
    if (resolved === null) {
      orphaned.push(r.id)
      continue
    }
    updates.push({ id: r.id, taxType: resolved })
  }

  console.log(`\n[CategorizationRule backfill]`)
  console.log(`  total rules:     ${rules.length}`)
  console.log(`  already tagged:  ${alreadyHave}`)
  console.log(`  to be inferred:  ${updates.length}`)
  console.log(`  orphaned:        ${orphaned.length}`)

  if (DRY_RUN) {
    console.log(`  [dry-run] no writes performed`)
    return
  }

  // Group by target taxType for batch updateMany
  const byTaxType = new Map<string, number[]>()
  for (const u of updates) {
    const bucket = byTaxType.get(u.taxType) ?? []
    bucket.push(u.id)
    byTaxType.set(u.taxType, bucket)
  }
  for (const [taxType, ids] of byTaxType) {
    await prisma.categorizationRule.updateMany({
      where: { id: { in: ids } },
      data: { taxType },
    })
  }
}

async function main() {
  console.log(`=== Phase 1 backfill ${DRY_RUN ? "(DRY RUN)" : "(LIVE)"} ===`)
  await backfillBankTransactions()
  await backfillCategorizationRules()
  console.log(`\n=== Done ===`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
