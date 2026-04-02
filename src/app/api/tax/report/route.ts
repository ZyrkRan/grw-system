import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/tax/report?month=YYYY-MM[&format=csv]
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }
  const userId = session.user.id
  const sp = request.nextUrl.searchParams

  const month = sp.get("month")
  const format = sp.get("format") // "csv" or null

  if (!month) {
    return NextResponse.json({ success: false, error: "month is required" }, { status: 400 })
  }

  const [year, mon] = month.split("-").map(Number)
  const start = new Date(year, mon - 1, 1)
  const end = new Date(year, mon, 1)

  const transactions = await prisma.taxTransaction.findMany({
    where: { userId, date: { gte: start, lt: end } },
    include: {
      category: {
        select: {
          id: true,
          name: true,
          color: true,
          parent: { select: { name: true } },
        },
      },
    },
    orderBy: { date: "asc" },
  })

  const txList = transactions.map((tx) => ({
    id: tx.id,
    date: tx.date.toISOString().split("T")[0],
    description: tx.description,
    merchantName: tx.merchantName || "",
    amount: Number(tx.amount),
    type: tx.type,
    categoryId: tx.categoryId,
    categoryName: tx.category?.name || "",
    categoryGroup: tx.category?.parent?.name || "",
    taxType: tx.taxType || "",
    isReviewed: tx.isReviewed,
    notes: tx.notes || "",
  }))

  // Single-pass aggregation
  let totalIncome = 0, serviceIncome = 0, personalIncome = 0
  let businessExpenses = 0, personalExpenses = 0, uncategorizedCount = 0
  const byCategoryMap: Record<string, number> = {}

  for (const t of txList) {
    if (!t.taxType) uncategorizedCount++
    const isBiz = t.taxType === "business" || t.taxType === "service_income"
    if (t.type === "INFLOW") {
      totalIncome += t.amount
      if (isBiz) serviceIncome += t.amount
      else if (t.taxType === "personal") personalIncome += t.amount
    } else {
      if (isBiz) {
        businessExpenses += t.amount
        const key = t.categoryName || "Uncategorized"
        byCategoryMap[key] = (byCategoryMap[key] || 0) + t.amount
      } else if (t.taxType === "personal") {
        personalExpenses += t.amount
      }
    }
  }

  const businessByCategory = Object.entries(byCategoryMap)
    .sort(([, a], [, b]) => b - a)
    .map(([category, total]) => ({ category, total }))

  const net = serviceIncome - businessExpenses

  if (format === "csv") {
    const header = "Date,Description,Merchant,Amount,Type,Category,Group,Tax Type,Notes\n"
    const rows = txList
      .map((t) =>
        [
          t.date,
          `"${t.description.replace(/"/g, '""')}"`,
          `"${t.merchantName.replace(/"/g, '""')}"`,
          t.amount.toFixed(2),
          t.type,
          `"${t.categoryName.replace(/"/g, '""')}"`,
          `"${t.categoryGroup.replace(/"/g, '""')}"`,
          t.taxType,
          `"${t.notes.replace(/"/g, '""')}"`,
        ].join(",")
      )
      .join("\n")

    const csv = header + rows
    const monthLabel = new Date(year, mon - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" })

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="tax-report-${month}.csv"`,
        "X-Month-Label": monthLabel,
      },
    })
  }

  return NextResponse.json({
    success: true,
    data: {
      month,
      summary: {
        totalIncome,
        serviceIncome,
        personalIncome,
        businessExpenses,
        personalExpenses,
        net,
        uncategorizedCount,
        totalTransactions: txList.length,
      },
      businessByCategory,
      transactions: txList,
    },
  })
}
