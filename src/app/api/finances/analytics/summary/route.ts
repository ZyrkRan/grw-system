import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { resolveCategoryGroupIds } from "@/lib/category-group-filter"

// ---------------------------------------------------------------------------
// Consolidated analytics endpoint — returns stat cards, inflow/outflow chart,
// and category breakdown in a single request.
// ---------------------------------------------------------------------------

type Granularity = "daily" | "weekly" | "monthly"

function calculateGranularity(startDate: Date, endDate: Date): Granularity {
  const durationDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  if (durationDays < 32) return "daily"
  if (durationDays <= 90) return "weekly"
  return "monthly"
}

function toBucketKey(date: Date, granularity: Granularity): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")

  switch (granularity) {
    case "daily":
      return `${y}-${m}-${d}`
    case "weekly": {
      const day = date.getDay()
      const diff = day === 0 ? -6 : 1 - day
      const monday = new Date(y, date.getMonth(), date.getDate() + diff)
      return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`
    }
    case "monthly":
      return `${y}-${m}`
  }
}

function generateBucketKeys(start: Date, end: Date, granularity: Granularity): string[] {
  const keys: string[] = []
  const current = new Date(start)

  switch (granularity) {
    case "daily":
      while (current <= end) {
        keys.push(toBucketKey(current, granularity))
        current.setDate(current.getDate() + 1)
      }
      break
    case "weekly": {
      const day = current.getDay()
      current.setDate(current.getDate() + (day === 0 ? -6 : 1 - day))
      while (current <= end) {
        keys.push(toBucketKey(current, granularity))
        current.setDate(current.getDate() + 7)
      }
      break
    }
    case "monthly":
      current.setDate(1)
      while (current <= end) {
        keys.push(toBucketKey(current, granularity))
        current.setMonth(current.getMonth() + 1)
      }
      break
  }
  return keys
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function formatLabel(key: string, granularity: Granularity): string {
  switch (granularity) {
    case "daily":
    case "weekly": {
      const [, m, d] = key.split("-")
      return `${SHORT_MONTHS[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`
    }
    case "monthly": {
      const [y, m] = key.split("-")
      return `${SHORT_MONTHS[parseInt(m, 10) - 1]} ${y}`
    }
  }
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id
  const searchParams = request.nextUrl.searchParams

  // Parse filters
  const accountIdParam = searchParams.get("accountId")
  const accountId = accountIdParam && accountIdParam !== "all" ? parseInt(accountIdParam, 10) : null
  if (accountId !== null && isNaN(accountId)) {
    return NextResponse.json({ success: false, error: "Invalid account ID" }, { status: 400 })
  }

  const dateFromParam = searchParams.get("dateFrom")
  const dateToParam = searchParams.get("dateTo")

  let startDate: Date
  let endDate: Date

  if (dateFromParam && dateToParam) {
    const [fy, fm, fd] = dateFromParam.split("-").map(Number)
    const [ty, tm, td] = dateToParam.split("-").map(Number)
    startDate = new Date(fy, fm - 1, fd, 0, 0, 0, 0)
    endDate = new Date(ty, tm - 1, td, 23, 59, 59, 999)
  } else {
    const earliest = await prisma.bankTransaction.findFirst({
      where: { userId },
      orderBy: { date: "asc" },
      select: { date: true },
    })
    startDate = earliest ? new Date(earliest.date) : new Date()
    startDate.setHours(0, 0, 0, 0)
    endDate = new Date()
    endDate.setHours(23, 59, 59, 999)
  }

  const categoryGroup = searchParams.get("categoryGroup")
  const categoryGroupIds = await resolveCategoryGroupIds(userId, categoryGroup)
  const granularity = calculateGranularity(startDate, endDate)

  const baseWhere = {
    userId,
    date: { gte: startDate, lte: endDate },
    ...(accountId ? { accountId } : {}),
    ...(categoryGroupIds ? { categoryId: { in: categoryGroupIds } } : {}),
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

      // Bills summary for current month
      prisma.bill.findMany({
        where: { userId, isActive: true },
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
      label: formatLabel(key, granularity),
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
      balancePoints.push({ date: key, balance, label: formatLabel(key, granularity) })
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
