import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  const serviceLogId = parseInt(id, 10)

  if (isNaN(serviceLogId)) {
    return NextResponse.json({ success: false, error: "Invalid service log ID" }, { status: 400 })
  }

  try {
    const serviceLog = await prisma.serviceLog.findFirst({
      where: {
        id: serviceLogId,
        OR: [
          { userId: session.user.id },
          { customer: { userId: session.user.id } },
        ],
      },
      include: {
        customer: true,
        serviceType: true,
        timeEntries: {
          orderBy: { date: "asc" },
        },
      },
    })

    if (!serviceLog) {
      return NextResponse.json({ success: false, error: "Service log not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: serviceLog })
  } catch (error) {
    console.error("Failed to fetch service log:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch service log" },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  const serviceLogId = parseInt(id, 10)

  if (isNaN(serviceLogId)) {
    return NextResponse.json({ success: false, error: "Invalid service log ID" }, { status: 400 })
  }

  try {
    const existing = await prisma.serviceLog.findFirst({
      where: {
        id: serviceLogId,
        OR: [
          { userId: session.user.id },
          { customer: { userId: session.user.id } },
        ],
      },
    })

    if (!existing) {
      return NextResponse.json({ success: false, error: "Service log not found" }, { status: 404 })
    }

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

    const serviceLog = await prisma.$transaction(async (tx) => {
      // If timeEntries provided, replace them all
      let calculatedDuration = totalDurationMinutes
      if (timeEntries !== undefined && Array.isArray(timeEntries)) {
        // Delete existing time entries
        await tx.timeEntry.deleteMany({
          where: { serviceLogId },
        })

        // Create new time entries
        if (timeEntries.length > 0) {
          await tx.timeEntry.createMany({
            data: timeEntries.map((entry: { date: string; durationMinutes: number; description?: string }) => ({
              serviceLogId,
              date: new Date(entry.date),
              durationMinutes: entry.durationMinutes,
              description: entry.description?.trim() || null,
            })),
          })

          // Recalculate totalDurationMinutes
          calculatedDuration = timeEntries.reduce(
            (sum: number, entry: { durationMinutes: number }) => sum + entry.durationMinutes,
            0
          )
        } else {
          calculatedDuration = 0
        }
      }

      const updated = await tx.serviceLog.update({
        where: { id: serviceLogId },
        data: {
          ...(customerId !== undefined && { customerId: parseInt(String(customerId), 10) }),
          ...(serviceName !== undefined && { serviceName: serviceName.trim() }),
          ...(serviceDate !== undefined && { serviceDate: new Date(serviceDate) }),
          ...(priceCharged !== undefined && { priceCharged }),
          ...(notes !== undefined && { notes: notes?.trim() || null }),
          ...(status !== undefined && { status }),
          ...(paymentStatus !== undefined && { paymentStatus }),
          ...(amountPaid !== undefined && { amountPaid }),
          ...(paymentDate !== undefined && { paymentDate: paymentDate ? new Date(paymentDate) : null }),
          ...(serviceTypeId !== undefined && {
            serviceTypeId: serviceTypeId ? parseInt(String(serviceTypeId), 10) : null,
          }),
          ...(calculatedDuration !== undefined && { totalDurationMinutes: calculatedDuration }),
        },
        include: {
          customer: { select: { id: true, name: true } },
          serviceType: { select: { id: true, name: true, color: true } },
          timeEntries: {
            orderBy: { date: "asc" },
          },
        },
      })

      return updated
    })

    return NextResponse.json({ success: true, data: serviceLog })
  } catch (error) {
    console.error("Failed to update service log:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update service log" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  const serviceLogId = parseInt(id, 10)

  if (isNaN(serviceLogId)) {
    return NextResponse.json({ success: false, error: "Invalid service log ID" }, { status: 400 })
  }

  try {
    const existing = await prisma.serviceLog.findFirst({
      where: {
        id: serviceLogId,
        OR: [
          { userId: session.user.id },
          { customer: { userId: session.user.id } },
        ],
      },
      include: {
        _count: { select: { invoiceItems: true } },
      },
    })

    if (!existing) {
      return NextResponse.json({ success: false, error: "Service log not found" }, { status: 404 })
    }

    if (existing._count.invoiceItems > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete service log with ${existing._count.invoiceItems} linked invoice item(s). Remove invoice items first.`,
        },
        { status: 400 }
      )
    }

    await prisma.$transaction(async (tx) => {
      // Delete time entries first
      await tx.timeEntry.deleteMany({
        where: { serviceLogId },
      })
      // Then delete the service log
      await tx.serviceLog.delete({
        where: { id: serviceLogId },
      })
    })

    return NextResponse.json({ success: true, data: null })
  } catch (error) {
    console.error("Failed to delete service log:", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete service log" },
      { status: 500 }
    )
  }
}
