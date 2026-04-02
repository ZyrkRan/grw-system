import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { matchesRule } from "@/lib/tax-utils"

// Increase body size limit for large CSV imports (full year = 1000+ transactions)
export const maxDuration = 60

// Apply TaxCategoryRules to a list of parsed transactions and return enriched rows
function applyRules(
  transactions: { description: string; merchantName?: string | null }[],
  rules: { pattern: string; categoryId: number | null; taxType: string }[]
) {
  const compiled = rules
    .map((r) => {
      try {
        return { pattern: r.pattern, regex: new RegExp(r.pattern, "i"), categoryId: r.categoryId, taxType: r.taxType }
      } catch {
        return null
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  return transactions.map((tx) => {
    const text = `${tx.description} ${tx.merchantName || ""}`.trim()
    for (const rule of compiled) {
      if (matchesRule(text, rule.regex, rule.pattern)) {
        return { categoryId: rule.categoryId, taxType: rule.taxType }
      }
    }
    return { categoryId: null, taxType: null }
  })
}

// POST /api/tax/import
// Body: { transactions: { date, description, merchantName?, amount, type }[] }
// Clears existing TaxTransactions for the user, then imports new ones.
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const body = await request.json()
    const { transactions } = body as {
      transactions: {
        date: string
        description: string
        merchantName?: string
        amount: number
        type: string
      }[]
    }

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json({ success: false, error: "No transactions provided" }, { status: 400 })
    }

    // Load user's tax rules for auto-categorization
    const rules = await prisma.taxCategoryRule.findMany({
      where: { userId },
      select: { pattern: true, categoryId: true, taxType: true },
    })

    const matched = applyRules(transactions, rules)

    // Wipe existing data for this user and re-insert
    await prisma.taxTransaction.deleteMany({ where: { userId } })

    // Increment applyCount for matched rules
    const ruleMatchCounts: Record<string, number> = {}
    matched.forEach((m, i) => {
      if (m.categoryId !== null) {
        const text = `${transactions[i].description} ${transactions[i].merchantName || ""}`.trim()
        for (const rule of rules) {
          try {
            if (new RegExp(rule.pattern, "i").test(text)) {
              ruleMatchCounts[rule.pattern] = (ruleMatchCounts[rule.pattern] || 0) + 1
              break
            }
          } catch { /* skip */ }
        }
      }
    })

    const data = transactions.map((tx, i) => ({
      userId,
      date: new Date(tx.date),
      description: tx.description,
      merchantName: tx.merchantName ?? null,
      amount: tx.amount,
      type: tx.type,
      categoryId: matched[i].categoryId,
      taxType: matched[i].taxType,
      isReviewed: false,
    }))

    // Batch inserts in chunks of 200 to avoid Prisma Accelerate payload limits
    const CHUNK = 200
    for (let i = 0; i < data.length; i += CHUNK) {
      await prisma.taxTransaction.createMany({ data: data.slice(i, i + CHUNK) })
    }

    // Update applyCount on matched rules
    for (const [pattern, count] of Object.entries(ruleMatchCounts)) {
      await prisma.taxCategoryRule.updateMany({
        where: { userId, pattern },
        data: { applyCount: { increment: count } },
      })
    }

    const autoCategorized = matched.filter((m) => m.categoryId !== null).length

    return NextResponse.json({
      success: true,
      data: { imported: transactions.length, autoCategorized },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    console.error("Tax import error:", message, stack)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
