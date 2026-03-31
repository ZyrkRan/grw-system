import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  Granularity,
  toBucketKey,
  generateBucketKeys,
  formatBucketLabel,
  parseAnalyticsParams,
} from "@/lib/analytics-utils"

function getStartDate(granularity: Granularity): Date {
  const now = new Date()
  switch (granularity) {
    case "daily":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)
    case "weekly":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 84)
    case "monthly":
      return new Date(now.getFullYear() - 1, now.getMonth(), 1)
  }
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  let startDate: Date
  let endDate: Date
  let accountId: number | null
  let granularity: Granularity
  let baseWhere: any

  try {
    const params = await parseAnalyticsParams(request, userId)
    startDate = params.startDate
    endDate = params.endDate
    accountId = params.accountId
    granularity = params.granularity
    baseWhere = params.baseWhere
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid parameters"
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }

  try {
    const [priorInflow, priorOutflow, transactions, accountsWithBalance] = await Promise.all([
      prisma.bankTransaction.aggregate({
        where: { ...baseWhere, type: "INFLOW", date: { lt: startDate } },
        _sum: { amount: true },
      }),
      prisma.bankTransaction.aggregate({
        where: { ...baseWhere, type: "OUTFLOW", date: { lt: startDate } },
        _sum: { amount: true },
      }),
      prisma.bankTransaction.findMany({
        where: { ...baseWhere, date: { gte: startDate, lte: endDate } },
        select: { date: true, amount: true, type: true },
        orderBy: { date: "asc" },
      }),
      prisma.bankAccount.findMany({
        where: { userId, ...(accountId ? { id: accountId } : {}), currentBalance: { not: null } },
        select: { currentBalance: true },
      }),
    ])

    const priorInflowSum = priorInflow._sum.amount ? Number(priorInflow._sum.amount) : 0
    const priorOutflowSum = priorOutflow._sum.amount ? Number(priorOutflow._sum.amount) : 0
    const openingBalance = priorInflowSum - priorOutflowSum

    // Build net change per bucket
    const bucketKeys = generateBucketKeys(startDate, endDate, granularity)
    const netByBucket = new Map<string, number>()
    for (const key of bucketKeys) {
      netByBucket.set(key, 0)
    }

    for (const tx of transactions) {
      const key = toBucketKey(new Date(tx.date), granularity)
      const amt = Number(tx.amount)
      const net = tx.type === "INFLOW" ? amt : -amt
      netByBucket.set(key, (netByBucket.get(key) || 0) + net)
    }

    // Compute cumulative balance
    let running = openingBalance
    let high = openingBalance
    let low = openingBalance
    const points: { date: string; balance: number; label: string }[] = []

    for (const key of bucketKeys) {
      running += netByBucket.get(key) || 0
      const balance = Math.round(running * 100) / 100
      if (balance > high) high = balance
      if (balance < low) low = balance
      points.push({ date: key, balance, label: formatBucketLabel(key, granularity) })
    }

    // Anchor to real bank balances if available
    if (accountsWithBalance.length > 0) {
      const realBalance = accountsWithBalance.reduce(
        (sum, a) => sum + Number(a.currentBalance), 0
      )
      const rawEnd = points.length > 0 ? points[points.length - 1].balance : openingBalance
      const offset = realBalance - rawEnd

      if (offset !== 0) {
        for (const p of points) p.balance = Math.round((p.balance + offset) * 100) / 100
        high = Math.round((high + offset) * 100) / 100
        low = Math.round((low + offset) * 100) / 100
      }
    }

    const startBalance = points.length > 0 ? points[0].balance : Math.round(openingBalance * 100) / 100
    const endBalance = points.length > 0 ? points[points.length - 1].balance : startBalance

    return NextResponse.json({
      success: true,
      data: {
        points,
        summary: {
          startBalance,
          endBalance,
          netChange: Math.round((endBalance - startBalance) * 100) / 100,
          highBalance: Math.round(high * 100) / 100,
          lowBalance: Math.round(low * 100) / 100,
        },
      },
    })
  } catch (error) {
    console.error("Failed to fetch balance analytics:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch analytics" },
      { status: 500 }
    )
  }
}
