import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ServiceStatus, PaymentStatus } from "@/generated/prisma"
import { computeDueDateInfo } from "@/lib/due-date"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const customerId = searchParams.get("customerId")
  const serviceTypeId = searchParams.get("serviceTypeId")
  const status = searchParams.get("status")
  const paymentStatus = searchParams.get("paymentStatus")
  const dateFrom = searchParams.get("dateFrom")
  const dateTo = searchParams.get("dateTo")
  const search = searchParams.get("search")

  try {
    const where: Record<string, unknown> = {
      OR: [
        { userId: session.user.id },
        { customer: { userId: session.user.id } },
      ],
    }

    if (customerId) {
      where.customerId = parseInt(customerId, 10)
    }

    if (serviceTypeId) {
      where.serviceTypeId = parseInt(serviceTypeId, 10)
    }

    if (status && Object.values(ServiceStatus).includes(status as ServiceStatus)) {
      where.status = status as ServiceStatus
    }

    if (paymentStatus && Object.values(PaymentStatus).includes(paymentStatus as PaymentStatus)) {
      where.paymentStatus = paymentStatus as PaymentStatus
    }

    if (dateFrom || dateTo) {
      where.serviceDate = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo) }),
      }
    }

    if (search) {
      where.AND = [
        {
          OR: [
            { serviceName: { contains: search, mode: "insensitive" as const } },
            { notes: { contains: search, mode: "insensitive" as const } },
          ],
        },
      ]
    }

    const serviceLogs = await prisma.serviceLog.findMany({
      where,
      orderBy: { serviceDate: "desc" },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            serviceInterval: true,
            serviceLogs: {
              orderBy: { serviceDate: "desc" as const },
              take: 1,
              select: { serviceDate: true },
            },
          },
        },
        serviceType: {
          select: { id: true, name: true, icon: true },
        },
        timeEntries: true,
        _count: {
          select: { timeEntries: true },
        },
      },
    })

    const data = serviceLogs.map((log) => {
      const { serviceLogs: custLogs, serviceInterval, ...custRest } = log.customer
      const dueInfo = computeDueDateInfo(custLogs[0]?.serviceDate, serviceInterval)
      return {
        ...log,
        customer: { ...custRest, ...dueInfo },
      }
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("Failed to fetch service logs:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch service logs" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      customerId,
      serviceName,
      serviceDate,
      priceCharged,
      notes,
      status,
      paymentStatus,
      amountPaid,
      paymentDate,
      serviceTypeId,
      totalDurationMinutes,
      timeEntries,
    } = body

    if (!customerId || !serviceName || !serviceDate || priceCharged === undefined) {
      return NextResponse.json(
        { success: false, error: "customerId, serviceName, serviceDate, and priceCharged are required" },
        { status: 400 }
      )
    }

    // Calculate totalDurationMinutes from timeEntries if provided
    let calculatedDuration = totalDurationMinutes
    if (timeEntries && Array.isArray(timeEntries) && timeEntries.length > 0) {
      calculatedDuration = timeEntries.reduce(
        (sum: number, entry: { durationMinutes: number }) => sum + entry.durationMinutes,
        0
      )
    }

    const serviceLog = await prisma.$transaction(async (tx) => {
      const created = await tx.serviceLog.create({
        data: {
          customerId: parseInt(String(customerId), 10),
          serviceName: serviceName.trim(),
          serviceDate: new Date(serviceDate),
          priceCharged,
          notes: notes?.trim() || null,
          status: status || undefined,
          paymentStatus: paymentStatus || undefined,
          amountPaid: amountPaid ?? 0,
          paymentDate: paymentDate ? new Date(paymentDate) : null,
          serviceTypeId: serviceTypeId ? parseInt(String(serviceTypeId), 10) : null,
          totalDurationMinutes: calculatedDuration ?? null,
          userId: session.user!.id!,
        },
      })

      // Create time entries if provided
      if (timeEntries && Array.isArray(timeEntries) && timeEntries.length > 0) {
        await tx.timeEntry.createMany({
          data: timeEntries.map((entry: { date: string; durationMinutes: number; description?: string }) => ({
            serviceLogId: created.id,
            date: new Date(entry.date),
            durationMinutes: entry.durationMinutes,
            description: entry.description?.trim() || null,
          })),
        })
      }

      // Return with relations
      return tx.serviceLog.findUnique({
        where: { id: created.id },
        include: {
          customer: { select: { id: true, name: true } },
          serviceType: { select: { id: true, name: true, icon: true } },
          timeEntries: true,
        },
      })
    })

    return NextResponse.json({ success: true, data: serviceLog }, { status: 201 })
  } catch (error) {
    console.error("Failed to create service log:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create service log" },
      { status: 500 }
    )
  }
}
