import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { computeDueDateInfo } from "@/lib/due-date"
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  format,
} from "date-fns"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    )
  }

  const { searchParams } = request.nextUrl
  const monthParam = searchParams.get("month") // YYYY-MM

  let monthDate: Date
  if (monthParam) {
    if (!/^\d{4}-\d{2}$/.test(monthParam)) {
      return NextResponse.json(
        { success: false, error: "Invalid month format. Use YYYY-MM" },
        { status: 400 }
      )
    }
    const [year, month] = monthParam.split("-").map(Number)
    if (month < 1 || month > 12) {
      return NextResponse.json(
        { success: false, error: "Month must be between 01 and 12" },
        { status: 400 }
      )
    }
    monthDate = new Date(year, month - 1, 1)
  } else {
    monthDate = new Date()
  }

  // Calculate the visible range (includes partial weeks at start/end of month)
  const rangeStart = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 0 })
  const rangeEnd = endOfWeek(endOfMonth(monthDate), { weekStartsOn: 0 })

  try {
    const [services, customers, routes] = await Promise.all([
      // Services in the visible date range
      prisma.serviceLog.findMany({
        where: {
          OR: [
            { userId: session.user.id },
            { customer: { userId: session.user.id } },
          ],
          serviceDate: { gte: rangeStart, lte: rangeEnd },
        },
        select: {
          id: true,
          serviceName: true,
          serviceDate: true,
          priceCharged: true,
          status: true,
          paymentStatus: true,
          totalDurationMinutes: true,
          customer: { select: { id: true, name: true } },
          serviceType: { select: { id: true, name: true, icon: true } },
        },
        orderBy: { serviceDate: "asc" },
      }),

      // All customers with a service interval (to compute due dates)
      prisma.customer.findMany({
        where: {
          userId: session.user.id,
          serviceInterval: { not: null },
        },
        select: {
          id: true,
          name: true,
          serviceInterval: true,
          serviceLogs: {
            orderBy: { serviceDate: "desc" },
            take: 1,
            select: { serviceDate: true },
          },
        },
      }),

      // Routes with dates in the visible range
      prisma.route.findMany({
        where: {
          userId: session.user.id,
          date: { gte: rangeStart, lte: rangeEnd },
        },
        select: {
          id: true,
          name: true,
          color: true,
          date: true,
          _count: { select: { customers: true } },
        },
        orderBy: { date: "asc" },
      }),
    ])

    // Build the day map
    const dayMap: Record<
      string,
      {
        services: typeof services
        dueCustomers: Array<{
          id: number
          name: string
          serviceInterval: number
          daysUntilDue: number
          dueStatus: string
        }>
        routes: typeof routes
      }
    > = {}

    function ensureDay(dateKey: string) {
      if (!dayMap[dateKey]) {
        dayMap[dateKey] = { services: [], dueCustomers: [], routes: [] }
      }
    }

    // Bucket services by date
    for (const service of services) {
      const key = format(new Date(service.serviceDate), "yyyy-MM-dd")
      ensureDay(key)
      dayMap[key].services.push(service)
    }

    // Compute due dates and bucket customers
    for (const customer of customers) {
      const lastServiceDate = customer.serviceLogs[0]?.serviceDate
      const dueInfo = computeDueDateInfo(lastServiceDate, customer.serviceInterval)

      if (dueInfo.nextDueDate) {
        const dueDate = new Date(dueInfo.nextDueDate)
        if (dueDate >= rangeStart && dueDate <= rangeEnd) {
          const key = format(dueDate, "yyyy-MM-dd")
          ensureDay(key)
          dayMap[key].dueCustomers.push({
            id: customer.id,
            name: customer.name,
            serviceInterval: customer.serviceInterval!,
            daysUntilDue: dueInfo.daysUntilDue!,
            dueStatus: dueInfo.dueStatus!,
          })
        }
      }
    }

    // Bucket routes by date
    for (const route of routes) {
      if (route.date) {
        const key = format(new Date(route.date), "yyyy-MM-dd")
        ensureDay(key)
        dayMap[key].routes.push(route)
      }
    }

    return NextResponse.json({ success: true, data: dayMap })
  } catch (error) {
    console.error("Failed to fetch calendar data:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch calendar data" },
      { status: 500 }
    )
  }
}
