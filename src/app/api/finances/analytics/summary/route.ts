import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  toBucketKey,
  generateBucketKeys,
  formatBucketLabel,
  parseAnalyticsParams,
} from "@/lib/analytics-utils"

// ---------------------------------------------------------------------------
// Consolidated analytics endpoint — returns stat cards, inflow/outflow chart,
// and category breakdown in a single request.
//
// `view=sidebar` switches to a lightweight year/month aggregation used by
// the new /finances sidebar (progress % per month, grouped by year, plus
// mismatched + uncategorized-income counts for the flag banner).
// ---------------------------------------------------------------------------

interface MonthStat {
  month: string
  total: number
  categorized: number
  progress: number
  income: number
  businessExpenses: number
}

interface YearGroup {
  year: number
  total: number
  categorized: number
  progress: number
  months: MonthStat[]
}

async function handleSidebarView(
  userId: string,
  accountIdParam: string | null
): Promise<NextResponse> {
  const accountId = accountIdParam ? parseInt(accountIdParam, 10) : null
  const accountFilter = accountId && !isNaN(accountId) ? accountId : null

  // Single pass aggregation: year + month bucket + counts + sums.
  // Uses the new (userId, date) index.
  const rows = await prisma.$queryRaw<
    {
      year: number
      month: string
      total: bigint
      categorized: bigint
      income: number | null
      businessExpenses: number | null
    }[]
  >`
    SELECT
      EXTRACT(YEAR FROM date)::int AS year,
      TO_CHAR(date, 'YYYY-MM') AS month,
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "taxType" IS NOT NULL)::bigint AS categorized,
      COALESCE(SUM(amount) FILTER (WHERE type = 'INFLOW'), 0)::float AS income,
      COALESCE(
        SUM(amount) FILTER (WHERE type = 'OUTFLOW' AND "taxType" = 'business'),
        0
      )::float AS "businessExpenses"
    FROM "BankTransaction"
    WHERE "userId" = ${userId}
      AND (${accountFilter}::int IS NULL OR "accountId" = ${accountFilter}::int)
    GROUP BY EXTRACT(YEAR FROM date), TO_CHAR(date, 'YYYY-MM')
    ORDER BY year DESC, month ASC
  `

  const byYear = new Map<number, YearGroup>()
  for (const r of rows) {
    const total = Number(r.total)
    const categorized = Number(r.categorized)
    const monthStat: MonthStat = {
      month: r.month,
      total,
      categorized,
      progress: total === 0 ? 100 : Math.round((categorized / total) * 100),
      income: r.income ?? 0,
      businessExpenses: r.businessExpenses ?? 0,
    }
    const existing = byYear.get(r.year)
    if (existing) {
      existing.months.push(monthStat)
      existing.total += total
      existing.categorized += categorized
    } else {
      byYear.set(r.year, {
        year: r.year,
        total,
        categorized,
        progress: 0,
        months: [monthStat],
      })
    }
  }
  // Progress per year is computed after the reduce so all months are counted.
  const years: YearGroup[] = Array.from(byYear.values())
    .map((y) => ({
      ...y,
      progress: y.total === 0 ? 100 : Math.round((y.categorized / y.total) * 100),
    }))
    .sort((a, b) => b.year - a.year)

  // Flag counts — small, lighter than re-fetching pages.
  const [mismatchedCount, uncategorizedIncomeCount] = await Promise.all([
    prisma.bankTransaction.count({
      where: {
        userId,
        type: "OUTFLOW",
        taxType: "service_income",
        ...(accountFilter ? { accountId: accountFilter } : {}),
      },
    }),
    prisma.bankTransaction.count({
      where: {
        userId,
        type: "INFLOW",
        taxType: null,
        ...(accountFilter ? { accountId: accountFilter } : {}),
      },
    }),
  ])

  return NextResponse.json({
    success: true,
    data: { years, mismatchedCount, uncategorizedIncomeCount },
  })
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id

  // Route the sidebar view before parseAnalyticsParams — it uses simpler inputs.
  if (request.nextUrl.searchParams.get("view") === "sidebar") {
    try {
      return await handleSidebarView(
        userId,
        request.nextUrl.searchParams.get("accountId")
      )
    } catch (err) {
      console.error("Failed to fetch sidebar summary:", err)
      return NextResponse.json(
        { success: false, error: "Failed to fetch sidebar summary" },
        { status: 500 }
      )
    }
  }

  let startDate: Date
  let endDate: Date
  let accountId: number | null
  let categoryGroupIds: number[] | undefined
  let granularity
  let baseWhere

  try {
    const params = await parseAnalyticsParams(request, userId)
    startDate = params.startDate
    endDate = params.endDate
    accountId = params.accountId
    categoryGroupIds = params.categoryGroupIds
    granularity = params.granularity
    baseWhere = params.baseWhere
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid parameters"
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }

  try {
    // Fetch everything in parallel
    const [
      allTransactions,
      uncategorizedCount,
      priorInflow,
      priorOutflow,
      accountsWithBalance,
      billsSummary,
    ] = await Promise.all([
      // All transactions in range with category info
      prisma.bankTransaction.findMany({
        where: baseWhere,
        select: {
          date: true,
          amount: true,
          type: true,
          categoryId: true,
          category: {
            select: {
              id: true,
              name: true,
              color: true,
              parentId: true,
              isGroup: true,
              parent: { select: { id: true, name: true, color: true } },
            },
          },
        },
        orderBy: { date: "asc" },
      }),

      // Uncategorized count
      prisma.bankTransaction.count({
        where: { ...baseWhere, categoryId: null },
      }),

      // Prior period inflow (for balance calculation)
      prisma.bankTransaction.aggregate({
        where: {
          userId,
          type: "INFLOW",
          date: { lt: startDate },
          ...(accountId ? { accountId } : {}),
          ...(categoryGroupIds ? { categoryId: { in: categoryGroupIds } } : {}),
        },
        _sum: { amount: true },
      }),

      // Prior period outflow
      prisma.bankTransaction.aggregate({
        where: {
          userId,
          type: "OUTFLOW",
          date: { lt: startDate },
          ...(accountId ? { accountId } : {}),
          ...(categoryGroupIds ? { categoryId: { in: categoryGroupIds } } : {}),
        },
        _sum: { amount: true },
      }),

      // Account balances for anchoring
      prisma.bankAccount.findMany({
        where: { userId, ...(accountId ? { id: accountId } : {}), currentBalance: { not: null } },
        select: { currentBalance: true },
      }),

      // Bills summary for current month (filtered by account if selected)
      prisma.bill.findMany({
        where: { userId, isActive: true, ...(accountId ? { accountId } : {}) },
        include: {
          payments: {
            where: {
              periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
        },
      }),
    ])

    // ─── Stat Cards ──────────────────────────────────────────────────
    let totalInflow = 0
    let totalOutflow = 0

    for (const tx of allTransactions) {
      const amt = Number(tx.amount)
      if (tx.type === "INFLOW") totalInflow += amt
      else totalOutflow += amt
    }

    const netChange = totalInflow - totalOutflow

    // Bills stats
    const totalBillsCount = billsSummary.length
    const paidBillsCount = billsSummary.filter((b) => b.payments.some((p) => p.status === "paid")).length
    const totalBillsExpected = billsSummary.reduce((s, b) => s + Number(b.expectedAmount), 0)

    // ─── Inflow/Outflow Chart ────────────────────────────────────────
    const bucketKeys = generateBucketKeys(startDate, endDate, granularity)
    const inflowByBucket = new Map<string, number>()
    const outflowByBucket = new Map<string, number>()
    for (const key of bucketKeys) {
      inflowByBucket.set(key, 0)
      outflowByBucket.set(key, 0)
    }

    for (const tx of allTransactions) {
      const key = toBucketKey(new Date(tx.date), granularity)
      const amt = Number(tx.amount)
      if (tx.type === "INFLOW") {
        inflowByBucket.set(key, (inflowByBucket.get(key) || 0) + amt)
      } else {
        outflowByBucket.set(key, (outflowByBucket.get(key) || 0) + amt)
      }
    }

    const flowPoints = bucketKeys.map((key) => ({
      date: key,
      label: formatBucketLabel(key, granularity),
      inflow: Math.round((inflowByBucket.get(key) || 0) * 100) / 100,
      outflow: Math.round((outflowByBucket.get(key) || 0) * 100) / 100,
    }))

    // ─── Balance Chart ───────────────────────────────────────────────
    const priorInflowSum = priorInflow._sum.amount ? Number(priorInflow._sum.amount) : 0
    const priorOutflowSum = priorOutflow._sum.amount ? Number(priorOutflow._sum.amount) : 0
    const openingBalance = priorInflowSum - priorOutflowSum

    const netByBucket = new Map<string, number>()
    for (const key of bucketKeys) netByBucket.set(key, 0)

    for (const tx of allTransactions) {
      const key = toBucketKey(new Date(tx.date), granularity)
      const amt = Number(tx.amount)
      netByBucket.set(key, (netByBucket.get(key) || 0) + (tx.type === "INFLOW" ? amt : -amt))
    }

    let running = openingBalance
    let high = openingBalance
    let low = openingBalance
    const balancePoints: { date: string; balance: number; label: string }[] = []

    for (const key of bucketKeys) {
      running += netByBucket.get(key) || 0
      const balance = Math.round(running * 100) / 100
      if (balance > high) high = balance
      if (balance < low) low = balance
      balancePoints.push({ date: key, balance, label: formatBucketLabel(key, granularity) })
    }

    // Anchor to real balances
    if (accountsWithBalance.length > 0) {
      const realBalance = accountsWithBalance.reduce((s, a) => s + Number(a.currentBalance), 0)
      const rawEnd = balancePoints.length > 0 ? balancePoints[balancePoints.length - 1].balance : openingBalance
      const offset = realBalance - rawEnd
      if (offset !== 0) {
        for (const p of balancePoints) p.balance = Math.round((p.balance + offset) * 100) / 100
        high = Math.round((high + offset) * 100) / 100
        low = Math.round((low + offset) * 100) / 100
      }
    }

    const startBalance = balancePoints.length > 0 ? balancePoints[0].balance : Math.round(openingBalance * 100) / 100
    const endBalance = balancePoints.length > 0 ? balancePoints[balancePoints.length - 1].balance : startBalance

    // ─── Category Breakdown (top 6 outflow) ──────────────────────────
    const categoryTotals = new Map<string, { id: number | null; name: string; color: string; total: number; count: number }>()

    for (const tx of allTransactions) {
      if (tx.type !== "OUTFLOW") continue
      const amt = Number(tx.amount)
      const catName = tx.category?.name || "Uncategorized"
      const catColor = tx.category?.color || "#94a3b8"
      const catId = tx.categoryId

      const existing = categoryTotals.get(catName)
      if (existing) {
        existing.total += amt
        existing.count += 1
      } else {
        categoryTotals.set(catName, { id: catId, name: catName, color: catColor, total: amt, count: 1 })
      }
    }

    const sortedCategories = Array.from(categoryTotals.values())
      .sort((a, b) => b.total - a.total)
    const topCategories = sortedCategories.slice(0, 6).map((c) => ({
      ...c,
      total: Math.round(c.total * 100) / 100,
    }))

    // ─── Response ────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      data: {
        stats: {
          totalInflow: Math.round(totalInflow * 100) / 100,
          totalOutflow: Math.round(totalOutflow * 100) / 100,
          netChange: Math.round(netChange * 100) / 100,
          uncategorizedCount,
          transactionCount: allTransactions.length,
          currentBalance: endBalance,
        },
        bills: {
          total: totalBillsCount,
          paid: paidBillsCount,
          expectedAmount: Math.round(totalBillsExpected * 100) / 100,
        },
        flowChart: {
          points: flowPoints,
          granularity,
        },
        balanceChart: {
          points: balancePoints,
          summary: {
            startBalance,
            endBalance,
            netChange: Math.round((endBalance - startBalance) * 100) / 100,
            highBalance: Math.round(high * 100) / 100,
            lowBalance: Math.round(low * 100) / 100,
          },
        },
        categoryBreakdown: topCategories,
      },
    })
  } catch (error) {
    console.error("Failed to fetch analytics summary:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch analytics" },
      { status: 500 }
    )
  }
}
