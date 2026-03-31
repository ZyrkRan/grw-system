import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  toBucketKey,
  generateBucketKeys,
  formatBucketLabel,
  parseAnalyticsParams,
} from "@/lib/analytics-utils"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  let startDate: Date
  let endDate: Date
  let granularity
  let baseWhere

  try {
    const params = await parseAnalyticsParams(request, userId)
    startDate = params.startDate
    endDate = params.endDate
    granularity = params.granularity
    baseWhere = params.baseWhere
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid parameters"
    return NextResponse.json({ success: false, error: message }, { status: 400 })
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
      label: formatBucketLabel(key, granularity),
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
