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

  try {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    // Date ranges
    const startOfCurrentMonth = new Date(currentYear, currentMonth, 1)
    const endOfCurrentMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999)
    const startOfLastMonth = new Date(currentYear, currentMonth - 1, 1)
    const endOfLastMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999)
    const twelveMonthsAgo = new Date(currentYear - 1, currentMonth, 1)

    const [
      monthlySpending,
      categoryBreakdown,
      recurringCharges,
      creditAccounts,
      currentMonthTotals,
      lastMonthTotals,
      personalBusinessSplit,
    ] = await Promise.all([
      // 1. Monthly spending trend (last 12 months)
      prisma.$queryRaw<{ month: string; total_inflow: number; total_outflow: number }[]>`
        SELECT
          TO_CHAR(date, 'YYYY-MM') as month,
          COALESCE(SUM(CASE WHEN type = 'INFLOW' THEN amount ELSE 0 END), 0)::float as total_inflow,
          COALESCE(SUM(CASE WHEN type = 'OUTFLOW' THEN amount ELSE 0 END), 0)::float as total_outflow
        FROM "BankTransaction"
        WHERE "userId" = ${userId}
          AND date >= ${twelveMonthsAgo}
        GROUP BY TO_CHAR(date, 'YYYY-MM')
        ORDER BY month ASC
      `,

      // 2. Top expense categories (current month + trailing 3 months)
      prisma.$queryRaw<{ category_id: number; category_name: string; category_color: string; total: number; count: number }[]>`
        SELECT
          tc.id as category_id,
          tc.name as category_name,
          tc.color as category_color,
          COALESCE(SUM(bt.amount), 0)::float as total,
          COUNT(bt.id)::int as count
        FROM "BankTransaction" bt
        JOIN "TransactionCategory" tc ON bt."categoryId" = tc.id
        WHERE bt."userId" = ${userId}
          AND bt.type = 'OUTFLOW'
          AND bt.date >= ${new Date(currentYear, currentMonth - 3, 1)}
        GROUP BY tc.id, tc.name, tc.color
        ORDER BY total DESC
        LIMIT 10
      `,

      // 3. Recurring charges detection
      prisma.$queryRaw<{ description: string; avg_amount: number; occurrences: number; merchant: string | null }[]>`
        SELECT
          description,
          AVG(amount)::float as avg_amount,
          COUNT(*)::int as occurrences,
          "merchantName" as merchant
        FROM "BankTransaction"
        WHERE "userId" = ${userId}
          AND type = 'OUTFLOW'
          AND date >= ${new Date(currentYear, currentMonth - 6, 1)}
        GROUP BY description, "merchantName"
        HAVING COUNT(DISTINCT TO_CHAR(date, 'YYYY-MM')) >= 3
        ORDER BY avg_amount DESC
        LIMIT 20
      `,

      // 4. Credit account balances
      prisma.bankAccount.findMany({
        where: { userId, type: "CREDIT", isActive: true },
        select: {
          id: true,
          name: true,
          currentBalance: true,
          transactions: {
            where: { type: "OUTFLOW", date: { gte: new Date(currentYear, currentMonth - 6, 1) } },
            select: { amount: true, date: true },
            orderBy: { date: "desc" },
          },
        },
      }),

      // 5. Current month totals
      prisma.bankTransaction.aggregate({
        where: {
          userId,
          date: { gte: startOfCurrentMonth, lte: endOfCurrentMonth },
          type: "OUTFLOW",
        },
        _sum: { amount: true },
        _count: true,
      }),

      // 6. Last month totals
      prisma.bankTransaction.aggregate({
        where: {
          userId,
          date: { gte: startOfLastMonth, lte: endOfLastMonth },
          type: "OUTFLOW",
        },
        _sum: { amount: true },
        _count: true,
      }),

      // 7. Personal vs Business breakdown (last 3 months)
      prisma.$queryRaw<{ group_name: string; total: number; count: number }[]>`
        SELECT
          parent_cat.name as group_name,
          COALESCE(SUM(bt.amount), 0)::float as total,
          COUNT(bt.id)::int as count
        FROM "BankTransaction" bt
        JOIN "TransactionCategory" tc ON bt."categoryId" = tc.id
        LEFT JOIN "TransactionCategory" parent_cat ON tc."parentId" = parent_cat.id
        LEFT JOIN "TransactionCategory" grandparent_cat ON parent_cat."parentId" = grandparent_cat.id
        WHERE bt."userId" = ${userId}
          AND bt.date >= ${new Date(currentYear, currentMonth - 3, 1)}
          AND (parent_cat."isSystemGroup" = true OR grandparent_cat."isSystemGroup" = true)
        GROUP BY parent_cat.name
        ORDER BY total DESC
      `,
    ])

    // Calculate debt payoff projections for credit accounts
    const debtProjections = creditAccounts.map((account) => {
      const balance = Number(account.currentBalance || 0)
      const payments = account.transactions
      const monthlyPayments = new Map<string, number>()

      for (const txn of payments) {
        const key = `${txn.date.getFullYear()}-${txn.date.getMonth()}`
        monthlyPayments.set(key, (monthlyPayments.get(key) || 0) + Number(txn.amount))
      }

      const avgMonthlyPayment = monthlyPayments.size > 0
        ? Array.from(monthlyPayments.values()).reduce((a, b) => a + b, 0) / monthlyPayments.size
        : 0

      const monthsToPayoff = avgMonthlyPayment > 0 ? Math.ceil(balance / avgMonthlyPayment) : null

      return {
        accountName: account.name,
        balance,
        avgMonthlyPayment: Math.round(avgMonthlyPayment * 100) / 100,
        monthsToPayoff,
        projectedPayoffDate: monthsToPayoff
          ? new Date(currentYear, currentMonth + monthsToPayoff, 1).toISOString()
          : null,
      }
    })

    // Month-over-month change
    const currentSpending = Number(currentMonthTotals._sum.amount || 0)
    const lastSpending = Number(lastMonthTotals._sum.amount || 0)
    const momChange = lastSpending > 0
      ? ((currentSpending - lastSpending) / lastSpending * 100)
      : 0

    return NextResponse.json({
      success: true,
      data: {
        monthlySpending,
        topCategories: categoryBreakdown,
        recurringCharges,
        debtProjections,
        personalBusinessSplit: personalBusinessSplit,
        currentMonthSpending: currentSpending,
        lastMonthSpending: lastSpending,
        monthOverMonthChange: Math.round(momChange * 10) / 10,
        currentMonthTransactionCount: currentMonthTotals._count,
      },
    })
  } catch (error) {
    console.error("Failed to fetch insights:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch insights" },
      { status: 500 }
    )
  }
}
