import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Granularity = "daily" | "weekly" | "monthly"

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

function calculateGranularity(startDate: Date, endDate: Date): Granularity {
  const durationMs = endDate.getTime() - startDate.getTime()
  const durationDays = durationMs / (1000 * 60 * 60 * 24)

  if (durationDays < 7) {
    return "daily"
  } else if (durationDays <= 90) {
    return "weekly"
  } else {
    return "monthly"
  }
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!
  const searchParams = request.nextUrl.searchParams

  // Parse required date parameters
  const dateFromParam = searchParams.get("dateFrom")
  const dateToParam = searchParams.get("dateTo")

  if (!dateFromParam || !dateToParam) {
    return NextResponse.json(
      { success: false, error: "dateFrom and dateTo are required" },
      { status: 400 }
    )
  }

  const startDate = new Date(dateFromParam)
  const endDate = new Date(dateToParam)

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json({ success: false, error: "Invalid date format" }, { status: 400 })
  }

  if (endDate < startDate) {
    return NextResponse.json(
      { success: false, error: "dateTo must be after dateFrom" },
      { status: 400 }
    )
  }

  // Set time boundaries
  startDate.setHours(0, 0, 0, 0)
  endDate.setHours(23, 59, 59, 999)

  // Parse optional account ID
  const accountIdParam = searchParams.get("accountId")
  const accountId = accountIdParam && accountIdParam !== "all" ? parseInt(accountIdParam, 10) : null
  if (accountId !== null && isNaN(accountId)) {
    return NextResponse.json({ success: false, error: "Invalid account ID" }, { status: 400 })
  }

  // Calculate or use provided granularity
  const granularityParam = searchParams.get("granularity")
  const granularity: Granularity =
    granularityParam && ["daily", "weekly", "monthly"].includes(granularityParam)
      ? (granularityParam as Granularity)
      : calculateGranularity(startDate, endDate)

  const baseWhere = {
    userId,
    date: { gte: startDate, lte: endDate },
    ...(accountId ? { accountId } : {}),
  }

  try {
    // Fetch all transactions in the date range
    const transactions = await prisma.bankTransaction.findMany({
      where: baseWhere,
      select: { date: true, amount: true, type: true },
      orderBy: { date: "asc" },
    })

    // Generate bucket keys
    const bucketKeys = generateBucketKeys(startDate, endDate, granularity)

    // Initialize buckets
    const inflowByBucket = new Map<string, number>()
    const outflowByBucket = new Map<string, number>()
    for (const key of bucketKeys) {
      inflowByBucket.set(key, 0)
      outflowByBucket.set(key, 0)
    }

    // Aggregate transactions into buckets
    let totalInflow = 0
    let totalOutflow = 0

    for (const tx of transactions) {
      const key = toBucketKey(new Date(tx.date), granularity)
      const amt = Number(tx.amount)

      if (tx.type === "INFLOW") {
        inflowByBucket.set(key, (inflowByBucket.get(key) || 0) + amt)
        totalInflow += amt
      } else {
        outflowByBucket.set(key, (outflowByBucket.get(key) || 0) + amt)
        totalOutflow += amt
      }
    }

    // Build points array
    const points = bucketKeys.map((key) => ({
      date: key,
      label: formatLabel(key, granularity),
      inflow: Math.round((inflowByBucket.get(key) || 0) * 100) / 100,
      outflow: Math.round((outflowByBucket.get(key) || 0) * 100) / 100,
    }))

    const netChange = totalInflow - totalOutflow

    return NextResponse.json({
      success: true,
      data: {
        points,
        summary: {
          totalInflow: Math.round(totalInflow * 100) / 100,
          totalOutflow: Math.round(totalOutflow * 100) / 100,
          netChange: Math.round(netChange * 100) / 100,
        },
        granularity,
      },
    })
  } catch (error) {
    console.error("Failed to fetch inflow/outflow analytics:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch analytics" },
      { status: 500 }
    )
  }
}
