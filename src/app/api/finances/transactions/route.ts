import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma"
import {
  transactionQuerySchema,
  createTransactionSchema,
  searchParamsToObject,
  formatZodError,
} from "@/lib/validations/finances"
import { checkRateLimit, rateLimits, rateLimitResponse } from "@/lib/rate-limit"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!
  const raw = searchParamsToObject(request.nextUrl.searchParams)
  const parsed = transactionQuerySchema.safeParse(raw)

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: formatZodError(parsed.error) },
      { status: 400 }
    )
  }

  const {
    accountId, categoryId, type, dateFrom, dateTo,
    search, month, year, isPending, uncategorized,
    page, pageSize,
  } = parsed.data

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
      ...(accountId && { accountId }),
      ...(categoryId && { categoryId }),
      ...(type && { type }),
      ...dateFilter,
      ...(search && {
        OR: [
          { description: { contains: search, mode: "insensitive" as const } },
          { merchantName: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(month && { statementMonth: month }),
      ...(year && { statementYear: year }),
      ...(isPending && { isPending: isPending === "true" }),
      ...(uncategorized === "true" && { categoryId: null }),
    }

    const skip = (page - 1) * pageSize

    const [transactions, total] = await Promise.all([
      prisma.bankTransaction.findMany({
        where,
        orderBy: { date: "desc" },
        skip,
        take: pageSize,
        include: {
          account: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, color: true } },
          serviceLog: { select: { id: true, serviceName: true } },
        },
      }),
      prisma.bankTransaction.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      data: transactions,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
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

  const rl = checkRateLimit(`txn-create:${userId}`, rateLimits.write)
  if (!rl.success) return rateLimitResponse(rl.resetAt)

  try {
    const body = await request.json()
    const parsed = createTransactionSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: formatZodError(parsed.error) },
        { status: 400 }
      )
    }

    const { date, description, amount, type, accountId, notes, categoryId, serviceLogId, merchantName } = parsed.data

    // Verify account ownership
    const account = await prisma.bankAccount.findFirst({
      where: { id: accountId, userId },
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
        description,
        amount,
        type,
        accountId,
        userId,
        statementMonth,
        statementYear,
        notes: notes || null,
        categoryId: categoryId || null,
        serviceLogId: serviceLogId || null,
        merchantName: merchantName || null,
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
