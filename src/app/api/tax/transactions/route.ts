import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/tax/transactions?month=YYYY-MM&status=all|uncategorized|business|personal&direction=all|inflow|outflow&page=1&pageSize=50
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }
  const userId = session.user.id
  const sp = request.nextUrl.searchParams

  const month = sp.get("month") // e.g. "2025-03"
  const status = sp.get("status") || "all"
  const direction = sp.get("direction") || "all"
  const page = Math.max(1, parseInt(sp.get("page") || "1"))
  const pageSize = Math.min(200, parseInt(sp.get("pageSize") || "50"))

  if (!month) {
    return NextResponse.json({ success: false, error: "month is required" }, { status: 400 })
  }

  const [year, mon] = month.split("-").map(Number)
  const start = new Date(year, mon - 1, 1)
  const end = new Date(year, mon, 1)

  const statusWhere =
    status === "uncategorized"
      ? { taxType: null }
      : status === "business"
        ? { taxType: { in: ["business", "service_income"] } }
        : status === "personal"
          ? { taxType: "personal" }
          : {}

  const directionWhere =
    direction === "inflow"
      ? { type: "INFLOW" }
      : direction === "outflow"
        ? { type: "OUTFLOW" }
        : {}

  const filterWhere = { ...statusWhere, ...directionWhere }

  const [transactions, total] = await Promise.all([
    prisma.taxTransaction.findMany({
      where: { userId, date: { gte: start, lt: end }, ...filterWhere },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            color: true,
            parentId: true,
            parent: { select: { id: true, name: true, isSystemGroup: true } },
          },
        },
      },
      orderBy: { date: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.taxTransaction.count({
      where: { userId, date: { gte: start, lt: end }, ...filterWhere },
    }),
  ])

  return NextResponse.json({
    success: true,
    data: {
      transactions: transactions.map((tx) => ({
        ...tx,
        amount: Number(tx.amount),
      })),
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
    },
  })
}
