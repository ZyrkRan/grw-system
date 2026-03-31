import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!
  const { searchParams } = request.nextUrl
  const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1))
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()))

  // Get date range for the month (plus padding for calendar view)
  const startDate = new Date(year, month - 1, 1)
  startDate.setDate(startDate.getDate() - 7) // week before for calendar padding
  const endDate = new Date(year, month, 0)
  endDate.setDate(endDate.getDate() + 7) // week after
  endDate.setHours(23, 59, 59, 999)

  try {
    const [serviceLogs, invoices, customers] = await Promise.all([
      // Service logs in date range
      prisma.serviceLog.findMany({
        where: {
          userId,
          serviceDate: { gte: startDate, lte: endDate },
        },
        select: {
          id: true,
          serviceName: true,
          serviceDate: true,
          status: true,
          priceCharged: true,
          customer: { select: { id: true, name: true } },
        },
        orderBy: { serviceDate: "asc" },
        take: 200,
      }),

      // Invoices with due dates in range
      prisma.invoice.findMany({
        where: {
          userId,
          dueDate: { gte: startDate, lte: endDate },
          status: { in: ["DRAFT", "SENT"] },
        },
        select: {
          id: true,
          invoiceNumber: true,
          dueDate: true,
          status: true,
          total: true,
          customer: { select: { id: true, name: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 200,
      }),

      // Customers with service intervals (for next-due calculation)
      prisma.customer.findMany({
        where: {
          userId,
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
    ])

    // Calculate next service due dates for customers
    const customerDueDates = customers
      .map((customer) => {
        const lastService = customer.serviceLogs[0]
        if (!lastService || !customer.serviceInterval) return null

        const nextDue = new Date(lastService.serviceDate)
        nextDue.setDate(nextDue.getDate() + customer.serviceInterval)

        // Only include if the due date falls within our range
        if (nextDue >= startDate && nextDue <= endDate) {
          return {
            customerId: customer.id,
            customerName: customer.name,
            nextServiceDate: nextDue.toISOString(),
            serviceInterval: customer.serviceInterval,
          }
        }
        return null
      })
      .filter(Boolean)

    return NextResponse.json({
      success: true,
      data: {
        services: serviceLogs.map((s) => ({
          id: s.id,
          type: "service" as const,
          title: s.serviceName,
          date: s.serviceDate.toISOString(),
          status: s.status,
          customerName: s.customer.name,
          customerId: s.customer.id,
          amount: Number(s.priceCharged),
        })),
        invoices: invoices.map((i) => ({
          id: i.id,
          type: "invoice" as const,
          title: `Invoice #${i.invoiceNumber}`,
          date: i.dueDate!.toISOString(),
          status: i.status,
          customerName: i.customer.name,
          customerId: i.customer.id,
          amount: Number(i.total),
        })),
        customerDueDates,
      },
    })
  } catch (error) {
    console.error("Failed to fetch calendar data:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch calendar data" },
      { status: 500 }
    )
  }
}
