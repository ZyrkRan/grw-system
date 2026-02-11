import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id
  const searchParams = request.nextUrl.searchParams

  // Parse account ID
  const accountIdParam = searchParams.get("accountId")
  const accountId = accountIdParam && accountIdParam !== "all" ? parseInt(accountIdParam, 10) : null
  if (accountId !== null && isNaN(accountId)) {
    return NextResponse.json({ success: false, error: "Invalid account ID" }, { status: 400 })
  }

  // Check if using dateFrom/dateTo or month/year params
  const dateFromParam = searchParams.get("dateFrom")
  const dateToParam = searchParams.get("dateTo")

  let selectedMonthStart: Date
  let selectedMonthEnd: Date
  let trendStart: Date
  let months: number

  if (dateFromParam && dateToParam) {
    // Parse date strings in local timezone to avoid UTC offset issues
    const [fromYear, fromMonth, fromDay] = dateFromParam.split("-").map(Number)
    const [toYear, toMonth, toDay] = dateToParam.split("-").map(Number)
    selectedMonthStart = new Date(fromYear, fromMonth - 1, fromDay, 0, 0, 0, 0)
    selectedMonthEnd = new Date(toYear, toMonth - 1, toDay, 23, 59, 59, 999)

    // For trend data, use the same range
    trendStart = new Date(selectedMonthStart)

    // Calculate approximate months for bucketing (used for trend chart initialization)
    const durationMs = selectedMonthEnd.getTime() - selectedMonthStart.getTime()
    const durationDays = durationMs / (1000 * 60 * 60 * 24)
    months = Math.ceil(durationDays / 30) // Approximate months
    if (months < 1) months = 1
  } else {
    // Use existing month/year/months parameters (backward compatibility)
    const now = new Date()
    const month = Math.min(12, Math.max(1, parseInt(searchParams.get("month") || String(now.getMonth() + 1), 10) || 1))
    const year = Math.min(now.getFullYear() + 1, Math.max(2000, parseInt(searchParams.get("year") || String(now.getFullYear()), 10) || now.getFullYear()))
    const monthsRaw = parseInt(searchParams.get("months") || "6", 10)
    months = [3, 6, 12].includes(monthsRaw) ? monthsRaw : 6

    // Calculate the trend range start date
    trendStart = new Date(year, month - 1 - (months - 1), 1)
    selectedMonthStart = new Date(year, month - 1, 1)
    selectedMonthEnd = new Date(year, month, 1)
  }

  const baseWhere = {
    userId,
    ...(accountId ? { accountId } : {}),
  }

  try {
    const [inflowRaw, outflowRaw, trendRaw, summaryAgg, uncategorizedCount] = await Promise.all([
      // 1. Inflow pie chart data
      prisma.bankTransaction.findMany({
        where: {
          ...baseWhere,
          type: "INFLOW",
          date: { gte: selectedMonthStart, lt: selectedMonthEnd },
        },
        select: {
          amount: true,
          categoryId: true,
          category: {
            select: {
              id: true,
              name: true,
              color: true,
              parentId: true,
              parent: { select: { id: true, name: true, color: true } },
            },
          },
        },
      }),

      // 2. Outflow pie chart data
      prisma.bankTransaction.findMany({
        where: {
          ...baseWhere,
          type: "OUTFLOW",
          date: { gte: selectedMonthStart, lt: selectedMonthEnd },
        },
        select: {
          amount: true,
          categoryId: true,
          category: {
            select: {
              id: true,
              name: true,
              color: true,
              parentId: true,
              parent: { select: { id: true, name: true, color: true } },
            },
          },
        },
      }),

      // 2. Trend chart: all outflow transactions in the trend range
      prisma.bankTransaction.findMany({
        where: {
          ...baseWhere,
          date: { gte: trendStart, lt: selectedMonthEnd },
        },
        select: {
          amount: true,
          date: true,
          categoryId: true,
          category: { select: { id: true, name: true, color: true } },
        },
      }),

      // 3. Summary: aggregates for the selected month
      prisma.bankTransaction.aggregate({
        where: {
          ...baseWhere,
          date: { gte: selectedMonthStart, lt: selectedMonthEnd },
        },
        _sum: { amount: true },
        _count: { id: true },
        _avg: { amount: true },
      }),

      // 4. Uncategorized count for the selected month
      prisma.bankTransaction.count({
        where: {
          ...baseWhere,
          date: { gte: selectedMonthStart, lt: selectedMonthEnd },
          categoryId: null,
        },
      }),
    ])

    // --- Build pie data for inflows ---
    const inflowByCat = new Map<
      string,
      { id: number | null; name: string; color: string; value: number; count: number; parentId: number | null; isGroup: boolean }
    >()
    for (const tx of inflowRaw) {
      const key = tx.categoryId ? String(tx.categoryId) : "uncategorized"
      const name = tx.category?.name || "Uncategorized"
      const color = tx.category?.color || "#10b981"
      const id = tx.categoryId
      const parentId = tx.category?.parentId || null
      const existing = inflowByCat.get(key)
      const amt = Number(tx.amount)
      if (existing) {
        existing.value += amt
        existing.count += 1
      } else {
        inflowByCat.set(key, { id, name, color, value: amt, count: 1, parentId, isGroup: false })
      }
    }
    const inflowPieData = Array.from(inflowByCat.values())
      .map((d) => ({ ...d, value: Math.round(d.value * 100) / 100 }))
      .sort((a, b) => b.value - a.value)

    // --- Build pie data for outflows ---
    const outflowByCat = new Map<
      string,
      { id: number | null; name: string; color: string; value: number; count: number; parentId: number | null; isGroup: boolean }
    >()
    for (const tx of outflowRaw) {
      const key = tx.categoryId ? String(tx.categoryId) : "uncategorized"
      const name = tx.category?.name || "Uncategorized"
      const color = tx.category?.color || "#ef4444"
      const id = tx.categoryId
      const parentId = tx.category?.parentId || null
      const existing = outflowByCat.get(key)
      const amt = Number(tx.amount)
      if (existing) {
        existing.value += amt
        existing.count += 1
      } else {
        outflowByCat.set(key, { id, name, color, value: amt, count: 1, parentId, isGroup: false })
      }
    }
    const outflowPieData = Array.from(outflowByCat.values())
      .map((d) => ({ ...d, value: Math.round(d.value * 100) / 100 }))
      .sort((a, b) => b.value - a.value)

    // --- Build trend data ---
    // Determine top 5 categories by total spend across the trend range
    const catTotals = new Map<string, { name: string; color: string; total: number }>()
    for (const tx of trendRaw) {
      const name = tx.category?.name || "Uncategorized"
      const color = tx.category?.color || "#94a3b8"
      const existing = catTotals.get(name)
      const amt = Number(tx.amount)
      if (existing) {
        existing.total += amt
      } else {
        catTotals.set(name, { name, color, total: amt })
      }
    }
    const sortedCats = Array.from(catTotals.values()).sort((a, b) => b.total - a.total)
    const top5 = sortedCats.slice(0, 5)
    const top5Names = new Set(top5.map((c) => c.name))

    const trendColors: Record<string, string> = {}
    for (const c of top5) {
      trendColors[c.name] = c.color
    }
    if (sortedCats.length > 5) {
      trendColors["Other"] = "#94a3b8"
    }

    // Aggregate by month
    const trendByMonth = new Map<string, Record<string, number>>()
    // Initialize all months in range
    const current = new Date(trendStart)
    while (current < selectedMonthEnd) {
      const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`
      trendByMonth.set(key, {})
      current.setMonth(current.getMonth() + 1)
    }

    for (const tx of trendRaw) {
      const d = new Date(tx.date)
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      const catName = tx.category?.name || "Uncategorized"
      const bucket = top5Names.has(catName) ? catName : "Other"
      const monthData = trendByMonth.get(monthKey)
      if (monthData) {
        monthData[bucket] = (monthData[bucket] || 0) + Number(tx.amount)
      }
    }

    const trendCategories = [...top5.map((c) => c.name), ...(sortedCats.length > 5 ? ["Other"] : [])]

    const trendData = Array.from(trendByMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monthKey, data]) => {
        const rounded: Record<string, number | string> = { month: monthKey }
        for (const cat of trendCategories) {
          rounded[cat] = Math.round((data[cat] || 0) * 100) / 100
        }
        return rounded
      })

    // --- Build summary ---
    const totalSpend = summaryAgg._sum.amount ? Number(summaryAgg._sum.amount) : 0
    const totalCount = summaryAgg._count.id
    const averageTransaction = summaryAgg._avg.amount ? Number(summaryAgg._avg.amount) : 0
    const topOutflowCategory = outflowPieData.length > 0 ? outflowPieData[0].name : null
    const topInflowCategory = inflowPieData.length > 0 ? inflowPieData[0].name : null

    const summary = {
      totalSpend: Math.round(totalSpend * 100) / 100,
      totalCount,
      averageTransaction: Math.round(averageTransaction * 100) / 100,
      uncategorizedCount,
      topCategory: topOutflowCategory,
      topInflowCategory,
    }

    return NextResponse.json({
      success: true,
      data: { inflowPieData, outflowPieData, trendData, trendCategories, trendColors, summary },
    })
  } catch (error) {
    console.error("Failed to fetch category analytics:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch analytics" },
      { status: 500 }
    )
  }
}
