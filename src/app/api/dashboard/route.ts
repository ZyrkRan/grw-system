import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    )
  }

  const userId = session.user!.id!

  try {
    const now = new Date()

    // First day of current month
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    // First day of next month
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    // First day of last month
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    // First day of current month (end of last month range)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1)

    // Run all queries in parallel
    const [
      revenueThisMonth,
      revenueLastMonth,
      totalCustomers,
      newCustomersThisMonth,
      servicesThisMonth,
      completedServicesThisMonth,
      pendingPaymentsCount,
      pendingPaymentAgg,
      invoicesByStatus,
      recentActivity,
      monthlyRevenueRaw,
    ] = await Promise.all([
      // Revenue this month
      prisma.serviceLog.aggregate({
        _sum: { priceCharged: true },
        where: {
          userId,
          serviceDate: { gte: thisMonthStart, lt: thisMonthEnd },
        },
      }),

      // Revenue last month
      prisma.serviceLog.aggregate({
        _sum: { priceCharged: true },
        where: {
          userId,
          serviceDate: { gte: lastMonthStart, lt: lastMonthEnd },
        },
      }),

      // Total customers
      prisma.customer.count({
        where: { userId },
      }),

      // New customers this month
      prisma.customer.count({
        where: {
          userId,
          createdAt: { gte: thisMonthStart, lt: thisMonthEnd },
        },
      }),

      // Services this month
      prisma.serviceLog.count({
        where: {
          userId,
          serviceDate: { gte: thisMonthStart, lt: thisMonthEnd },
        },
      }),

      // Completed services this month
      prisma.serviceLog.count({
        where: {
          userId,
          serviceDate: { gte: thisMonthStart, lt: thisMonthEnd },
          status: "COMPLETE",
        },
      }),

      // Pending payments count
      prisma.serviceLog.count({
        where: {
          userId,
          paymentStatus: "UNPAID",
        },
      }),

      // Pending payment amount (sum of priceCharged - amountPaid)
      prisma.serviceLog.aggregate({
        _sum: { priceCharged: true, amountPaid: true },
        where: {
          userId,
          paymentStatus: "UNPAID",
        },
      }),

      // Invoices by status
      prisma.invoice.groupBy({
        by: ["status"],
        _count: { id: true },
        where: { userId },
      }),

      // Recent activity - last 10 service logs with customer name
      prisma.serviceLog.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          customer: {
            select: { name: true },
          },
        },
      }),

      // Monthly revenue for last 6 months
      // We use a raw approach: query service logs for the last 6 months and aggregate in code
      (async () => {
        const sixMonthsAgo = new Date(
          now.getFullYear(),
          now.getMonth() - 5,
          1
        )
        const logs = await prisma.serviceLog.findMany({
          where: {
            userId,
            serviceDate: { gte: sixMonthsAgo, lt: thisMonthEnd },
          },
          select: {
            serviceDate: true,
            priceCharged: true,
          },
        })

        // Aggregate by month
        const monthlyMap = new Map<string, number>()

        // Initialize all 6 months with 0
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
          monthlyMap.set(key, 0)
        }

        // Sum up revenue per month
        for (const log of logs) {
          const d = new Date(log.serviceDate)
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
          const current = monthlyMap.get(key) || 0
          monthlyMap.set(key, current + Number(log.priceCharged))
        }

        return Array.from(monthlyMap.entries()).map(([month, revenue]) => ({
          month,
          revenue,
        }))
      })(),
    ])

    // Calculate pending payment amount
    const pendingPriceCharged = Number(
      pendingPaymentAgg._sum.priceCharged || 0
    )
    const pendingAmountPaid = Number(pendingPaymentAgg._sum.amountPaid || 0)
    const pendingPaymentAmount = pendingPriceCharged - pendingAmountPaid

    // Format invoices by status into an object
    const invoiceStatusMap: Record<string, number> = {
      DRAFT: 0,
      SENT: 0,
      PAID: 0,
      CANCELLED: 0,
    }
    for (const group of invoicesByStatus) {
      invoiceStatusMap[group.status] = group._count.id
    }

    return NextResponse.json({
      success: true,
      data: {
        revenueThisMonth: Number(revenueThisMonth._sum.priceCharged || 0),
        revenueLastMonth: Number(revenueLastMonth._sum.priceCharged || 0),
        totalCustomers,
        newCustomersThisMonth,
        servicesThisMonth,
        completedServicesThisMonth,
        pendingPayments: pendingPaymentsCount,
        pendingPaymentAmount,
        invoicesByStatus: invoiceStatusMap,
        recentActivity: recentActivity.map((log) => ({
          id: log.id,
          serviceName: log.serviceName,
          serviceDate: log.serviceDate,
          status: log.status,
          paymentStatus: log.paymentStatus,
          priceCharged: Number(log.priceCharged),
          customer: { name: log.customer?.name ?? "Unknown" },
          createdAt: log.createdAt,
        })),
        monthlyRevenue: monthlyRevenueRaw,
      },
    })
  } catch (error) {
    console.error("Failed to fetch dashboard data:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch dashboard data" },
      { status: 500 }
    )
  }
}
