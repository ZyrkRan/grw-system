/**
 * Phase 1.5 — Forward-migrate TaxTransaction + TaxCategoryRule into
 * BankTransaction + CategorizationRule. NON-DESTRUCTIVE: the source tables
 * are never written to or deleted from. They become a permanent archive.
 *
 * Run:   tsx prisma/migrations/scripts/migrate-tax-transactions.ts
 * Dry:   tsx prisma/migrations/scripts/migrate-tax-transactions.ts --dry-run
 *
 * Matching strategy (per tax row, scoped by userId across all accounts):
 *   hash = YYYY-MM-DD | description.toLowerCase().trim() | amount
 *
 *   1. Hash match on an existing BankTransaction:
 *        - If target is uncategorized (categoryId=null AND taxType=null):
 *          UPDATE with taxTx fields, merge notes, set isReviewed=true
 *        - If target has same categoryId:
 *          no-op (matchedSameCount)
 *        - If target has a different categoryId:
 *          log conflict, leave finances row untouched (matchedConflictCount)
 *   2. No match:
 *        INSERT new BankTransaction on the synthetic "Imported (Historical)"
 *        account, copying all fields verbatim (including exact isReviewed)
 *
 * Idempotent: re-running matches on existing BankTransactions with
 * plaidTransactionId=null on the synthetic account (same hash) and skips.
 *
 * TaxCategoryRule migration:
 *   - Match on (userId, pattern) against CategorizationRule
 *     - Exists: merge (fill null taxType, take MAX applyCount, log categoryId conflicts)
 *     - Missing: insert new CategorizationRule with all fields copied
 */
import "dotenv/config"
import { PrismaClient, Prisma } from "../../../src/generated/prisma"
import { mkdirSync, appendFileSync } from "node:fs"
import { join } from "node:path"

type DecimalInput = Prisma.Decimal | number | string

const prisma = new PrismaClient({ accelerateUrl: process.env.DATABASE_URL })
const DRY_RUN = process.argv.includes("--dry-run")
const BATCH_SIZE = 500

const LOG_DIR = join(process.cwd(), "backups", "migration-logs")
const CONFLICT_LOG = join(LOG_DIR, `migration-conflicts-${Date.now()}.log`)

function logConflict(entry: string) {
  if (DRY_RUN) {
    console.log(`  [conflict] ${entry}`)
    return
  }
  mkdirSync(LOG_DIR, { recursive: true })
  appendFileSync(CONFLICT_LOG, entry + "\n")
}

function hashTx(date: Date, description: string, amount: Prisma.Decimal | unknown): string {
  const dateKey = date.toISOString().slice(0, 10)
  const descKey = description.toLowerCase().trim()
  const amountKey = String(amount)
  return `${dateKey}|${descKey}|${amountKey}`
}

function mergeNotes(existing: string | null, incoming: string | null): string | null {
  if (!existing) return incoming
  if (!incoming) return existing
  if (existing === incoming) return existing
  return `${existing}\n---\n${incoming}`
}

async function getOrCreateLandingAccount(userId: string): Promise<number> {
  const existing = await prisma.bankAccount.findFirst({
    where: { userId, name: "Imported (Historical)" },
    select: { id: true },
  })
  if (existing) return existing.id

  if (DRY_RUN) {
    console.log(`  [dry-run] would create "Imported (Historical)" account for user ${userId}`)
    return -1
  }

  const created = await prisma.bankAccount.create({
    data: {
      userId,
      name: "Imported (Historical)",
      type: "CHECKING",
      currentBalance: 0,
    },
    select: { id: true },
  })
  console.log(`  created "Imported (Historical)" account for user ${userId} → id=${created.id}`)
  return created.id
}

async function migrateUserTransactions(userId: string) {
  const taxRows = await prisma.taxTransaction.findMany({
    where: { userId },
    orderBy: { id: "asc" },
  })

  if (taxRows.length === 0) {
    console.log(`  no TaxTransaction rows for user ${userId}`)
    return
  }

  console.log(`  found ${taxRows.length} TaxTransaction rows to examine`)

  type BankTxRow = {
    id: number
    date: Date
    description: string
    amount: Prisma.Decimal
    categoryId: number | null
    taxType: string | null
    isReviewed: boolean
    notes: string | null
    accountId: number
    plaidTransactionId: string | null
  }

  // Pre-fetch all BankTransaction rows for this user, build a hash index.
  // For multi-hundred-thousand-row tables this could be swapped for
  // per-row findFirst queries, but for normal datasets one scan is fine.
  const existingBankTxns: BankTxRow[] = await prisma.bankTransaction.findMany({
    where: { userId },
    select: {
      id: true,
      date: true,
      description: true,
      amount: true,
      categoryId: true,
      taxType: true,
      isReviewed: true,
      notes: true,
      accountId: true,
      plaidTransactionId: true,
    },
  })

  const hashIndex = new Map<string, BankTxRow[]>()
  for (const bt of existingBankTxns) {
    const h = hashTx(bt.date, bt.description, bt.amount)
    const bucket = hashIndex.get(h)
    if (bucket) bucket.push(bt)
    else hashIndex.set(h, [bt])
  }

  const landingAccountId = await getOrCreateLandingAccount(userId)

  let updatedCount = 0
  let matchedSameCount = 0
  let matchedConflictCount = 0
  let insertedCount = 0
  let alreadyMigratedCount = 0

  const updatesToRun: {
    id: number
    categoryId: number | null
    taxType: string | null
    notes: string | null
  }[] = []
  const insertsToRun: {
    userId: string
    accountId: number
    date: Date
    description: string
    merchantName: string | null
    amount: DecimalInput
    type: "INFLOW" | "OUTFLOW"
    categoryId: number | null
    taxType: string | null
    isReviewed: boolean
    notes: string | null
    statementMonth: number
    statementYear: number
  }[] = []

  for (const tx of taxRows) {
    const h = hashTx(tx.date, tx.description, tx.amount)
    const candidates = hashIndex.get(h) ?? []

    // Idempotency: if a candidate already lives on the synthetic landing
    // account with no plaidTransactionId, this tax row was migrated before.
    const alreadyMigrated = candidates.find(
      (c) => c.accountId === landingAccountId && c.plaidTransactionId === null
    )
    if (alreadyMigrated) {
      alreadyMigratedCount++
      continue
    }

    // Prefer a real (non-landing-account) candidate for overlap detection
    const target = candidates.find((c) => c.accountId !== landingAccountId) ?? candidates[0]

    if (target) {
      const isUncategorized = target.categoryId === null && target.taxType === null
      if (isUncategorized) {
        updatesToRun.push({
          id: target.id,
          categoryId: tx.categoryId,
          taxType: tx.taxType,
          notes: mergeNotes(target.notes, tx.notes),
        })
        updatedCount++
      } else if (target.categoryId === tx.categoryId && target.taxType === tx.taxType) {
        matchedSameCount++
      } else {
        matchedConflictCount++
        logConflict(
          JSON.stringify({
            userId,
            taxTxId: tx.id,
            bankTxId: target.id,
            date: tx.date.toISOString(),
            description: tx.description,
            amount: String(tx.amount),
            existing: { categoryId: target.categoryId, taxType: target.taxType },
            incoming: { categoryId: tx.categoryId, taxType: tx.taxType },
          })
        )
      }
    } else {
      // Unmatched — queue an insert on the landing account
      insertsToRun.push({
        userId: tx.userId,
        accountId: landingAccountId,
        date: tx.date,
        description: tx.description,
        merchantName: tx.merchantName,
        amount: tx.amount,
        type: tx.type === "INFLOW" ? "INFLOW" : "OUTFLOW",
        categoryId: tx.categoryId,
        taxType: tx.taxType,
        isReviewed: tx.isReviewed,
        notes: tx.notes,
        statementMonth: tx.date.getMonth() + 1,
        statementYear: tx.date.getFullYear(),
      })
      insertedCount++
    }
  }

  console.log(`\n  user ${userId} summary:`)
  console.log(`    already migrated:   ${alreadyMigratedCount}`)
  console.log(`    updated (filled):   ${updatedCount}`)
  console.log(`    matched same:       ${matchedSameCount}`)
  console.log(`    matched conflict:   ${matchedConflictCount} (see ${CONFLICT_LOG})`)
  console.log(`    new inserts:        ${insertedCount}`)
  console.log(`    source total:       ${taxRows.length}`)
  const accounted =
    alreadyMigratedCount + updatedCount + matchedSameCount + matchedConflictCount + insertedCount
  if (accounted !== taxRows.length) {
    console.error(`    WARNING: accounted=${accounted} != source=${taxRows.length}`)
  }

  if (DRY_RUN) {
    console.log(`  [dry-run] skipping writes`)
    return
  }

  // Apply updates in batches
  for (let i = 0; i < updatesToRun.length; i += BATCH_SIZE) {
    const chunk = updatesToRun.slice(i, i + BATCH_SIZE)
    await prisma.$transaction(
      chunk.map((u) =>
        prisma.bankTransaction.update({
          where: { id: u.id },
          data: {
            categoryId: u.categoryId,
            taxType: u.taxType,
            isReviewed: true,
            notes: u.notes,
          },
        })
      )
    )
  }

  // Apply inserts in batches (createMany is faster but doesn't return IDs;
  // we don't need IDs here, so use it)
  for (let i = 0; i < insertsToRun.length; i += BATCH_SIZE) {
    const chunk = insertsToRun.slice(i, i + BATCH_SIZE)
    await prisma.bankTransaction.createMany({ data: chunk })
  }
}

async function migrateUserRules(userId: string) {
  const taxRules = await prisma.taxCategoryRule.findMany({ where: { userId } })
  if (taxRules.length === 0) {
    console.log(`  no TaxCategoryRule rows for user ${userId}`)
    return
  }

  type RuleRow = {
    id: number
    pattern: string
    categoryId: number | null
    taxType: string | null
    applyCount: number
  }

  const existing: RuleRow[] = await prisma.categorizationRule.findMany({
    where: { userId },
    select: { id: true, pattern: true, categoryId: true, taxType: true, applyCount: true },
  })
  // Lookup key is (pattern, categoryId, taxType) so rules with the same
  // pattern but different category/taxType semantics are preserved.
  const ruleKey = (pattern: string, categoryId: number | null, taxType: string | null) =>
    `${pattern}|${categoryId ?? "null"}|${taxType ?? ""}`
  const byKey = new Map<string, RuleRow>(
    existing.map((r: RuleRow) => [ruleKey(r.pattern, r.categoryId, r.taxType), r])
  )

  let mergedCount = 0
  let insertedCount = 0
  let conflictCount = 0
  const updates: {
    id: number
    taxType?: string
    applyCount?: number
  }[] = []
  const inserts: {
    userId: string
    pattern: string
    categoryId: number | null
    taxType: string | null
    applyCount: number
  }[] = []

  for (const taxRule of taxRules) {
    const key = ruleKey(taxRule.pattern, taxRule.categoryId, taxRule.taxType)
    const hit = byKey.get(key)
    if (hit) {
      // Exact match — maybe bump applyCount
      if (taxRule.applyCount > hit.applyCount) {
        updates.push({ id: hit.id, applyCount: taxRule.applyCount })
        mergedCount++
      }
    } else {
      inserts.push({
        userId: taxRule.userId,
        pattern: taxRule.pattern,
        categoryId: taxRule.categoryId,
        taxType: taxRule.taxType,
        applyCount: taxRule.applyCount,
      })
      insertedCount++
    }
  }

  console.log(`\n  user ${userId} rule summary:`)
  console.log(`    source rules:          ${taxRules.length}`)
  console.log(`    merged:                ${mergedCount}`)
  console.log(`    inserted:              ${insertedCount}`)
  console.log(`    conflicts:             ${conflictCount}`)
  const ruleAccounted = mergedCount + insertedCount + conflictCount
  const ruleUnchanged = taxRules.length - ruleAccounted
  if (ruleUnchanged > 0) {
    console.log(`    no-op (already match): ${ruleUnchanged}`)
  }

  if (DRY_RUN) {
    console.log(`  [dry-run] skipping writes`)
    return
  }

  for (const u of updates) {
    await prisma.categorizationRule.update({
      where: { id: u.id },
      data: {
        ...(u.taxType !== undefined ? { taxType: u.taxType } : {}),
        ...(u.applyCount !== undefined ? { applyCount: u.applyCount } : {}),
      },
    })
  }

  if (inserts.length > 0) {
    // No skipDuplicates — we already deduped via the (pattern,categoryId,taxType)
    // key, and the schema no longer has @@unique([userId, pattern]). Anything
    // that would still collide is a bug worth surfacing.
    await prisma.categorizationRule.createMany({ data: inserts })
  }
}

async function main() {
  console.log(`=== Phase 1.5 tax-data migration ${DRY_RUN ? "(DRY RUN)" : "(LIVE)"} ===`)
  console.log(`Conflict log: ${CONFLICT_LOG}`)

  // Walk users that actually have TaxTransaction rows
  const taxUsers: { userId: string }[] = await prisma.taxTransaction.findMany({
    distinct: ["userId"],
    select: { userId: true },
  })
  const ruleUsers: { userId: string }[] = await prisma.taxCategoryRule.findMany({
    distinct: ["userId"],
    select: { userId: true },
  })
  const userIds = Array.from(
    new Set([
      ...taxUsers.map((t: { userId: string }) => t.userId),
      ...ruleUsers.map((r: { userId: string }) => r.userId),
    ])
  )

  console.log(`Users with tax data: ${userIds.length}`)

  for (const userId of userIds) {
    console.log(`\n--- user ${userId} ---`)
    await migrateUserTransactions(userId)
    await migrateUserRules(userId)
  }

  console.log(`\n=== Done ===`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
