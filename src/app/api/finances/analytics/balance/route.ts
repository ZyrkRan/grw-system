import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Granularity = "daily" | "weekly" | "monthly"

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

function toBucketKey(date: Date, granularity: Granularity): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")

  switch (granularity) {
    case "daily":
      return `${y}-${m}-${d}`
    case "weekly": {
      // Get Monday of the week
      const day = date.getDay()
      const diff = day === 0 ? -6 : 1 - day
      const monday = new Date(y, date.getMonth(), date.getDate() + diff)
      const my = monday.getFullYear()
      const mm = String(monday.getMonth() + 1).padStart(2, "0")
      const md = String(monday.getDate()).padStart(2, "0")
      return `${my}-${mm}-${md}`
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
      // Align to Monday
      const day = current.getDay()
      const diff = day === 0 ? -6 : 1 - day
      current.setDate(current.getDate() + diff)
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

function formatLabel(key: string, granularity: Granularity): string {
  const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

  switch (granularity) {
    case "daily": {
      const [, m, d] = key.split("-")
      return `${SHORT_MONTHS[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`
    }
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

  const userId = session.user!.id!
  const searchParams = request.nextUrl.searchParams

  const granularity = (["daily", "weekly", "monthly"].includes(searchParams.get("granularity") || "")
    ? searchParams.get("granularity")
    : "daily") as Granularity

  const accountIdParam = searchParams.get("accountId")
  const accountId = accountIdParam && accountIdParam !== "all" ? parseInt(accountIdParam, 10) : null
  if (accountId !== null && isNaN(accountId)) {
    return NextResponse.json({ success: false, error: "Invalid account ID" }, { status: 400 })
  }

  // Use dateFrom/dateTo if provided, otherwise use granularity-based calculation
  const dateFromParam = searchParams.get("dateFrom")
  const dateToParam = searchParams.get("dateTo")

  let startDate: Date
  let endDate: Date

  if (dateFromParam && dateToParam) {
    startDate = new Date(dateFromParam)
    endDate = new Date(dateToParam)
    startDate.setHours(0, 0, 0, 0)
    endDate.setHours(23, 59, 59, 999)
  } else {
    startDate = getStartDate(granularity)
    endDate = new Date()
    endDate.setHours(23, 59, 59, 999)
  }

  const baseWhere = {
    userId,
    ...(accountId ? { accountId } : {}),
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
      points.push({ date: key, balance, label: formatLabel(key, granularity) })
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
