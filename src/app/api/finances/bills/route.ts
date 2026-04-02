import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createBillSchema, searchParamsToObject, formatZodError } from "@/lib/validations/finances"

// GET /api/finances/bills — List bills with current period payment status
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id
  const searchParams = request.nextUrl.searchParams
  const activeOnly = searchParams.get("active") !== "false"
  const accountIdParam = searchParams.get("accountId")

  // Determine current period start based on today
  const now = new Date()
  const currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1)

  try {
    const bills = await prisma.bill.findMany({
      where: {
        userId,
        ...(activeOnly ? { isActive: true } : {}),
        ...(accountIdParam && accountIdParam !== "all" ? { accountId: Number(accountIdParam) } : {}),
      },
      include: {
        category: { select: { id: true, name: true, color: true } },
        account: { select: { id: true, name: true } },
        payments: {
          where: {
            periodStart: currentPeriodStart,
          },
          include: {
            transaction: {
              select: { id: true, description: true, amount: true, date: true },
            },
          },
        },
      },
      orderBy: { dueDay: "asc" },
    })

    // Enrich with current period status
    const enriched = bills.map((bill) => {
      const currentPayment = bill.payments[0] || null
      const dueDate = new Date(now.getFullYear(), now.getMonth(), bill.dueDay)
      const isOverdue = !currentPayment?.paidAt && dueDate < now && dueDate.getMonth() === now.getMonth()

      return {
        ...bill,
        expectedAmount: Number(bill.expectedAmount),
        currentPayment: currentPayment
          ? {
              ...currentPayment,
              actualAmount: currentPayment.actualAmount ? Number(currentPayment.actualAmount) : null,
            }
          : null,
        dueDate: dueDate.toISOString(),
        isOverdue,
      }
    })

    // Summary stats
    const totalBills = enriched.filter((b) => b.isActive).length
    const paidCount = enriched.filter((b) => b.currentPayment?.status === "paid").length
    const totalExpected = enriched
      .filter((b) => b.isActive)
      .reduce((sum, b) => sum + Number(b.expectedAmount), 0)
    const totalPaid = enriched
      .filter((b) => b.currentPayment?.status === "paid")
      .reduce((sum, b) => sum + (b.currentPayment?.actualAmount ?? Number(b.expectedAmount)), 0)
    const remaining = totalExpected - totalPaid

    return NextResponse.json({
      success: true,
      data: {
        bills: enriched,
        summary: {
          totalBills,
          paidCount,
          totalExpected: Math.round(totalExpected * 100) / 100,
          totalPaid: Math.round(totalPaid * 100) / 100,
          remaining: Math.round(remaining * 100) / 100,
        },
      },
    })
  } catch (error) {
    console.error("Failed to fetch bills:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch bills" }, { status: 500 })
  }
}

// POST /api/finances/bills — Create a new bill
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = createBillSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: formatZodError(parsed.error) },
        { status: 400 }
      )
    }

    const bill = await prisma.bill.create({
      data: {
        userId: session.user.id,
        ...parsed.data,
      },
      include: {
        category: { select: { id: true, name: true, color: true } },
        account: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({
      success: true,
      data: { ...bill, expectedAmount: Number(bill.expectedAmount) },
    })
  } catch (error) {
    console.error("Failed to create bill:", error)
    return NextResponse.json({ success: false, error: "Failed to create bill" }, { status: 500 })
  }
}
