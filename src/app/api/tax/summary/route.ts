import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

interface MonthRow {
  month: string
  total: bigint
  categorized: bigint
  income: number
  businessExpenses: number
}

// GET /api/tax/summary
// Returns month-by-month progress stats for the sidebar
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const rows = await prisma.$queryRaw<MonthRow[]>`
      SELECT
        TO_CHAR(date, 'YYYY-MM') as month,
        COUNT(*)::bigint as total,
        COUNT(*) FILTER (WHERE "taxType" IS NOT NULL)::bigint as categorized,
        COALESCE(SUM(amount) FILTER (WHERE type = 'INFLOW'), 0)::float as income,
        COALESCE(SUM(amount) FILTER (WHERE type = 'OUTFLOW' AND ("taxType" = 'business' OR "taxType" = 'service_income')), 0)::float as "businessExpenses"
      FROM "TaxTransaction"
      WHERE "userId" = ${userId}
      GROUP BY TO_CHAR(date, 'YYYY-MM')
      ORDER BY month
    `

    const months = rows.map((r) => {
      const total = Number(r.total)
      const categorized = Number(r.categorized)
      return {
        month: r.month,
        total,
        categorized,
        income: r.income,
        businessExpenses: r.businessExpenses,
        progress: total > 0 ? Math.round((categorized / total) * 100) : 0,
      }
    })

    return NextResponse.json({ success: true, data: { months } })
  } catch (error) {
    console.error("Tax summary error:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch summary" }, { status: 500 })
  }
}
