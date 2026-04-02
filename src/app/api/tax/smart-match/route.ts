import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { normalizeForGrouping, matchesRule } from "@/lib/tax-utils"

// POST /api/tax/smart-match
// Builds patterns from categorized transaction history + saved rules,
// matches against uncategorized transactions for a given month.
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const { month } = await request.json()
    if (!month) {
      return NextResponse.json({ success: false, error: "month is required" }, { status: 400 })
    }

    const [year, mon] = month.split("-").map(Number)
    const start = new Date(year, mon - 1, 1)
    const end = new Date(year, mon, 1)

    // 1. Fetch uncategorized transactions for the target month
    const uncategorized = await prisma.taxTransaction.findMany({
      where: { userId, date: { gte: start, lt: end }, taxType: null },
      select: { id: true, date: true, description: true, merchantName: true, amount: true, type: true },
      orderBy: { date: "asc" },
    })

    if (uncategorized.length === 0) {
      return NextResponse.json({
        success: true,
        data: { groups: [], unmatchedCount: 0 },
      })
    }

    // 2. Fetch saved rules (highest priority)
    const rules = await prisma.taxCategoryRule.findMany({
      where: { userId },
      include: { category: { select: { id: true, name: true, color: true } } },
    })

    // 3. Fetch ALL categorized transactions (all time) to learn patterns
    const categorized = await prisma.taxTransaction.findMany({
      where: { userId, taxType: { not: null } },
      select: {
        description: true,
        merchantName: true,
        categoryId: true,
        taxType: true,
        category: { select: { id: true, name: true, color: true } },
      },
    })

    console.log(`[smart-match] uncategorized: ${uncategorized.length}, rules: ${rules.length}, categorized history: ${categorized.length}`)
    if (categorized.length > 0) {
      console.log(`[smart-match] sample categorized:`, categorized.slice(0, 3).map(t => t.description))
    }
    if (uncategorized.length > 0) {
      console.log(`[smart-match] sample uncategorized:`, uncategorized.slice(0, 3).map(t => t.description))
    }

    // 4. Build history pattern map: normalized description → most frequent category
    const historyMap = new Map<string, {
      categoryId: number | null
      taxType: string
      category: { id: number; name: string; color: string } | null
      count: number
    }>()

    for (const tx of categorized) {
      const norm = normalizeForGrouping(tx.description)
      if (!norm) continue

      const existing = historyMap.get(norm)
      if (!existing || tx.categoryId !== null) {
        // Prefer entries with a specific category over null
        const prev = existing?.count ?? 0
        historyMap.set(norm, {
          categoryId: tx.categoryId,
          taxType: tx.taxType!,
          category: tx.category,
          count: prev + 1,
        })
      } else {
        existing.count++
      }
    }

    console.log(`[smart-match] historyMap size: ${historyMap.size}`)
    if (historyMap.size > 0) {
      const sampleKeys = Array.from(historyMap.keys()).slice(0, 5)
      console.log(`[smart-match] sample history patterns:`, sampleKeys)
    }
    // Also test normalizing one uncategorized tx
    if (uncategorized.length > 0) {
      const testNorm = normalizeForGrouping(uncategorized[0].description)
      console.log(`[smart-match] test normalize: "${uncategorized[0].description}" → "${testNorm}" → match: ${historyMap.has(testNorm)}`)
    }

    // 5. Compile saved rules into regex
    const compiledRules = rules
      .map((r) => {
        try {
          return { ...r, regex: new RegExp(r.pattern, "i") }
        } catch {
          return null
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    // 6. Match uncategorized transactions against rules first, then history
    type MatchGroup = {
      pattern: string
      categoryId: number | null
      taxType: string
      category: { id: number; name: string; color: string } | null
      matchSource: "rule" | "history"
      ruleId?: number
      transactions: typeof uncategorized
    }

    const groupMap = new Map<string, MatchGroup>()
    const unmatched: typeof uncategorized = []

    for (const tx of uncategorized) {
      const text = `${tx.description} ${tx.merchantName || ""}`.trim()
      let matched = false

      // Try saved rules first
      for (const rule of compiledRules) {
        if (matchesRule(text, rule.regex, rule.pattern)) {
          const key = `rule:${rule.id}`
          const group = groupMap.get(key)
          if (group) {
            group.transactions.push(tx)
          } else {
            groupMap.set(key, {
              pattern: rule.pattern,
              categoryId: rule.categoryId,
              taxType: rule.taxType,
              category: rule.category,
              matchSource: "rule",
              ruleId: rule.id,
              transactions: [tx],
            })
          }
          matched = true
          break
        }
      }

      if (matched) continue

      // Try history patterns
      const norm = normalizeForGrouping(tx.description)
      if (norm && historyMap.has(norm)) {
        const hist = historyMap.get(norm)!
        const key = `history:${norm}`
        const group = groupMap.get(key)
        if (group) {
          group.transactions.push(tx)
        } else {
          groupMap.set(key, {
            pattern: norm,
            categoryId: hist.categoryId,
            taxType: hist.taxType,
            category: hist.category,
            matchSource: "history",
            transactions: [tx],
          })
        }
        continue
      }

      unmatched.push(tx)
    }

    // 7. Convert to sorted array (most transactions first)
    const groups = Array.from(groupMap.values())
      .sort((a, b) => b.transactions.length - a.transactions.length)
      .map((g) => ({
        ...g,
        transactions: g.transactions.map((tx) => ({
          ...tx,
          date: tx.date.toISOString().split("T")[0],
          amount: Number(tx.amount),
        })),
      }))

    return NextResponse.json({
      success: true,
      data: {
        groups,
        unmatchedCount: unmatched.length,
        _debug: {
          uncategorizedCount: uncategorized.length,
          rulesCount: rules.length,
          categorizedHistoryCount: categorized.length,
          historyPatterns: historyMap.size,
          compiledRules: compiledRules.length,
          sampleHistoryKeys: Array.from(historyMap.keys()).slice(0, 5),
          sampleUncatNormalized: uncategorized.slice(0, 3).map(t => normalizeForGrouping(t.description)),
        },
      },
    })
  } catch (error) {
    console.error("Smart match error:", error)
    return NextResponse.json({ success: false, error: "Failed to compute matches" }, { status: 500 })
  }
}
