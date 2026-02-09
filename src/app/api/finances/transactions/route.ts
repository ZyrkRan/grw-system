import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!
  const { searchParams } = request.nextUrl

  const accountId = searchParams.get("accountId")
  const categoryId = searchParams.get("categoryId")
  const type = searchParams.get("type")
  const dateFrom = searchParams.get("dateFrom")
  const dateTo = searchParams.get("dateTo")
  const search = searchParams.get("search")
  const month = searchParams.get("month")
  const year = searchParams.get("year")
  const isPending = searchParams.get("isPending")
  const uncategorized = searchParams.get("uncategorized")

  try {
    // Parse dates with proper time boundaries to avoid timezone issues
    let dateFilter = {}
    if (dateFrom || dateTo) {
      const startDate = dateFrom ? new Date(dateFrom) : null
      const endDate = dateTo ? new Date(dateTo) : null

      if (startDate) startDate.setHours(0, 0, 0, 0)
      if (endDate) endDate.setHours(23, 59, 59, 999)

      dateFilter = {
        date: {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate }),
        },
      }
    }

    const where: Prisma.BankTransactionWhereInput = {
      userId,
      ...(accountId && { accountId: parseInt(accountId, 10) }),
      ...(categoryId && { categoryId: parseInt(categoryId, 10) }),
      ...(type && { type: type as "INFLOW" | "OUTFLOW" }),
      ...dateFilter,
      ...(search && {
        OR: [
          { description: { contains: search, mode: "insensitive" as const } },
          { merchantName: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(month && { statementMonth: parseInt(month, 10) }),
      ...(year && { statementYear: parseInt(year, 10) }),
      ...(isPending !== null && isPending !== undefined && isPending !== "" && {
        isPending: isPending === "true",
      }),
      ...(uncategorized === "true" && { categoryId: null }),
    }

    const transactions = await prisma.bankTransaction.findMany({
      where,
      orderBy: { date: "desc" },
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true } },
        serviceLog: { select: { id: true, serviceName: true } },
      },
    })

    return NextResponse.json({ success: true, data: transactions })
  } catch (error) {
    console.error("Failed to fetch transactions:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch transactions" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  try {
    const body = await request.json()
    const { date, description, amount, type, accountId, notes, categoryId, serviceLogId, merchantName } = body

    if (!date || !description || amount === undefined || !type || !accountId) {
      return NextResponse.json(
        { success: false, error: "date, description, amount, type, and accountId are required" },
        { status: 400 }
      )
    }

    const validTypes = ["INFLOW", "OUTFLOW"]
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { success: false, error: "Type must be INFLOW or OUTFLOW" },
        { status: 400 }
      )
    }

    // Verify account ownership
    const account = await prisma.bankAccount.findFirst({
      where: { id: parseInt(accountId, 10), userId },
    })

    if (!account) {
      return NextResponse.json(
        { success: false, error: "Account not found" },
        { status: 404 }
      )
    }

    const txnDate = new Date(date)
    const statementMonth = txnDate.getMonth() + 1
    const statementYear = txnDate.getFullYear()

    const transaction = await prisma.bankTransaction.create({
      data: {
        date: txnDate,
        description: description.trim(),
        amount: parseFloat(amount),
        type,
        accountId: parseInt(accountId, 10),
        userId,
        statementMonth,
        statementYear,
        notes: notes?.trim() || null,
        categoryId: categoryId ? parseInt(categoryId, 10) : null,
        serviceLogId: serviceLogId ? parseInt(serviceLogId, 10) : null,
        merchantName: merchantName?.trim() || null,
      },
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true } },
      },
    })

    return NextResponse.json({ success: true, data: transaction }, { status: 201 })
  } catch (error) {
    console.error("Failed to create transaction:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create transaction" },
      { status: 500 }
    )
  }
}
