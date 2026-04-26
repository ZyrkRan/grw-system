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
import { resolveCategoryGroupIds } from "@/lib/category-group-filter"
import { parseDateQuery, expandToRanges } from "@/lib/parse-date-query"

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
    monthKey, status, direction, categoryFilter,
    page, pageSize,
  } = parsed.data

  // Extra param not in zod schema: categoryGroup filter (business/personal)
  const categoryGroup = request.nextUrl.searchParams.get("categoryGroup")

  try {
    // Parse dates with proper time boundaries to avoid timezone issues
    let dateFilter: Prisma.BankTransactionWhereInput = {}
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
    } else if (monthKey) {
      // Tax-review style: monthKey=YYYY-MM → date window
      const [yr, mo] = monthKey.split("-").map(Number)
      const start = new Date(yr, mo - 1, 1)
      const end = new Date(yr, mo, 1)
      dateFilter = { date: { gte: start, lt: end } }
    }

    // Tax-review status filter (operates on taxType + type)
    const statusWhere: Prisma.BankTransactionWhereInput =
      status === "uncategorized"
        ? { taxType: null }
        : status === "business"
          ? { taxType: { in: ["business", "service_income"] } }
          : status === "personal"
            ? { taxType: "personal" }
            : status === "mismatched"
              ? { type: "OUTFLOW", taxType: "service_income" }
              : {}

    const directionWhere: Prisma.BankTransactionWhereInput =
      direction === "inflow"
        ? { type: "INFLOW" }
        : direction === "outflow"
          ? { type: "OUTFLOW" }
          : {}

    // categoryFilter: "none" = uncategorized, or specific categoryId as string
    const categoryFilterWhere: Prisma.BankTransactionWhereInput =
      categoryFilter === "none"
        ? { categoryId: null }
        : categoryFilter && !isNaN(parseInt(categoryFilter))
          ? { categoryId: parseInt(categoryFilter) }
          : {}

    // If filtering by category group (business/personal), find all category IDs in that group
    const categoryGroupIds = await resolveCategoryGroupIds(userId, categoryGroup)

    // Free-text search with date parsing for cross-month lookups.
    // Amount match requires a positive number; negative fallback covers
    // credit-style accounts where amount is stored negative.
    let searchWhere: Prisma.BankTransactionWhereInput = {}
    if (search) {
      const searchNum = parseFloat(search)
      const dateMatch = parseDateQuery(search)
      const dateOrClauses: Prisma.BankTransactionWhereInput[] = dateMatch
        ? expandToRanges(dateMatch).map((r) => ({ date: { gte: r.gte, lt: r.lt } }))
        : []
      searchWhere = {
        OR: [
          { description: { contains: search, mode: "insensitive" as const } },
          { merchantName: { contains: search, mode: "insensitive" as const } },
          ...(!isNaN(searchNum)
            ? [
                { amount: searchNum } as Prisma.BankTransactionWhereInput,
                { amount: -searchNum } as Prisma.BankTransactionWhereInput,
              ]
            : []),
          ...dateOrClauses,
        ],
      }
    }

    const where: Prisma.BankTransactionWhereInput = {
      userId,
      ...(accountId && { accountId }),
      ...(categoryId && { categoryId }),
      ...(categoryGroupIds && { categoryId: { in: categoryGroupIds } }),
      ...(type && { type }),
      ...dateFilter,
      ...searchWhere,
      ...(month && { statementMonth: month }),
      ...(year && { statementYear: year }),
      ...(isPending && { isPending: isPending === "true" }),
      ...(uncategorized === "true" && { categoryId: null }),
      ...statusWhere,
      ...directionWhere,
      ...categoryFilterWhere,
    }

    const skip = (page - 1) * pageSize

    // Tax-review tables sort ascending within a month; free-text search
    // falls back to descending (most recent first).
    const orderBy: Prisma.BankTransactionOrderByWithRelationInput =
      monthKey && !search ? { date: "asc" } : { date: "desc" }

    const [transactions, total] = await Promise.all([
      prisma.bankTransaction.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: {
          account: { select: { id: true, name: true } },
          category: {
            select: {
              id: true,
              name: true,
              color: true,
              attachmentPrompt: true,
              parentId: true,
              parent: { select: { id: true, name: true, isSystemGroup: true } },
            },
          },
          serviceLog: {
            select: { id: true, serviceType: { select: { name: true } } },
          },
          _count: { select: { attachments: true } },
        },
      }),
      prisma.bankTransaction.count({ where }),
    ])

    const enriched = transactions.map((t) => {
      if (!t.serviceLog) return t
      const { serviceType, ...slRest } = t.serviceLog
      return {
        ...t,
        serviceLog: {
          ...slRest,
          serviceName: serviceType?.name ?? "Service",
        },
      }
    })

    return NextResponse.json({
      success: true,
      data: enriched,
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
