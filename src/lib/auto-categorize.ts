// ---------------------------------------------------------------------------
// Server-side auto-categorization using user-defined rules (regex patterns)
// This runs automatically on Plaid sync and CSV import.
// ---------------------------------------------------------------------------
import { matchesRule } from "@/lib/categorization-rules"

import { prisma } from "@/lib/prisma"

interface CategorizationResult {
  transactionId: number
  categoryId: number | null
  taxType: string | null
  ruleId: number
  ruleName: string
}

/**
 * Auto-categorize transactions using the user's categorization rules.
 * Matches transaction descriptions against regex patterns.
 * Sets categoryId, taxType, and isReviewed=true on matched rows, and
 * increments applyCount on the matched rules.
 */
export async function autoCategorizeTransactions(
  userId: string,
  transactionIds: number[]
): Promise<{ categorized: number; results: CategorizationResult[] }> {
  if (transactionIds.length === 0) return { categorized: 0, results: [] }

  const rules = await prisma.categorizationRule.findMany({
    where: { userId },
    include: { category: { select: { id: true, name: true } } },
  })

  if (rules.length === 0) return { categorized: 0, results: [] }

  const transactions = await prisma.bankTransaction.findMany({
    where: {
      id: { in: transactionIds },
      userId,
      categoryId: null,
    },
    select: { id: true, description: true, merchantName: true },
  })

  if (transactions.length === 0) return { categorized: 0, results: [] }

  const compiledRules = rules
    .map((rule) => {
      try {
        return {
          id: rule.id,
          regex: new RegExp(rule.pattern, "i"),
          categoryId: rule.categoryId,
          taxType: rule.taxType,
          pattern: rule.pattern,
        }
      } catch {
        return null
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  const results: CategorizationResult[] = []

  for (const tx of transactions) {
    const textToMatch = `${tx.description} ${tx.merchantName || ""}`
    for (const rule of compiledRules) {
      if (matchesRule(textToMatch, rule.regex, rule.pattern)) {
        results.push({
          transactionId: tx.id,
          categoryId: rule.categoryId,
          taxType: rule.taxType,
          ruleId: rule.id,
          ruleName: rule.pattern,
        })
        break // first match wins
      }
    }
  }

  if (results.length === 0) return { categorized: 0, results: [] }

  // Group matches by (categoryId, taxType) for batch updates. A null
  // categoryId means "taxType-only rule" — don't touch the existing
  // categoryId when applying.
  const byBucket = new Map<
    string,
    { categoryId: number | null; taxType: string | null; ids: number[] }
  >()
  for (const r of results) {
    const key = `${r.categoryId ?? "null"}|${r.taxType ?? ""}`
    const bucket = byBucket.get(key)
    if (bucket) {
      bucket.ids.push(r.transactionId)
    } else {
      byBucket.set(key, { categoryId: r.categoryId, taxType: r.taxType, ids: [r.transactionId] })
    }
  }

  const ruleCounts = new Map<number, number>()
  for (const r of results) {
    ruleCounts.set(r.ruleId, (ruleCounts.get(r.ruleId) ?? 0) + 1)
  }

  await prisma.$transaction([
    ...Array.from(byBucket.values()).map((b) =>
      prisma.bankTransaction.updateMany({
        where: { id: { in: b.ids } },
        data: {
          // Only set categoryId if the rule defines one; otherwise leave
          // whatever category the row already has.
          ...(b.categoryId !== null ? { categoryId: b.categoryId } : {}),
          taxType: b.taxType,
          isReviewed: true,
        },
      })
    ),
    ...Array.from(ruleCounts.entries()).map(([ruleId, count]) =>
      prisma.categorizationRule.update({
        where: { id: ruleId },
        data: { applyCount: { increment: count } },
      })
    ),
  ])

  return { categorized: results.length, results }
}

/**
 * Auto-match transactions to bills based on bill match patterns.
 * When a new transaction matches a bill's pattern and approximate amount,
 * it creates/updates a BillPayment record.
 */
export async function autoMatchBills(
  userId: string,
  transactionIds: number[]
): Promise<{ matched: number }> {
  if (transactionIds.length === 0) return { matched: 0 }

  // Fetch active bills with match patterns
  const bills = await prisma.bill.findMany({
    where: { userId, isActive: true, matchPattern: { not: null } },
  })

  if (bills.length === 0) return { matched: 0 }

  // Fetch new transactions
  const transactions = await prisma.bankTransaction.findMany({
    where: { id: { in: transactionIds }, userId },
    select: { id: true, description: true, merchantName: true, amount: true, date: true, type: true },
  })

  const compiledBills = bills
    .map((bill) => {
      try {
        return { bill, regex: new RegExp(bill.matchPattern!, "i") }
      } catch {
        return null
      }
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)

  let matched = 0

  for (const tx of transactions) {
    if (tx.type !== "OUTFLOW") continue

    const textToMatch = `${tx.description} ${tx.merchantName || ""}`

    for (const { bill, regex } of compiledBills) {
      if (!regex.test(textToMatch)) continue

      // Check amount is within 20% of expected (bills can vary slightly)
      const txAmount = Number(tx.amount)
      const expectedAmount = Number(bill.expectedAmount)
      const tolerance = expectedAmount * 0.2
      if (Math.abs(txAmount - expectedAmount) > tolerance) continue

      // Determine billing period
      const txDate = new Date(tx.date)
      const periodStart = new Date(txDate.getFullYear(), txDate.getMonth(), 1)

      // Upsert payment — don't overwrite existing paid records
      try {
        await prisma.billPayment.upsert({
          where: {
            billId_periodStart: { billId: bill.id, periodStart },
          },
          create: {
            billId: bill.id,
            periodStart,
            status: "paid",
            actualAmount: txAmount,
            transactionId: tx.id,
            paidAt: txDate,
          },
          update: {
            // Only update if not already paid
          },
        })
        matched++
      } catch {
        // Unique constraint on transactionId — skip if already matched
      }
      break
    }
  }

  return { matched }
}
