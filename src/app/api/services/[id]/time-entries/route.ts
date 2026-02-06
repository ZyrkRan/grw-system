import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
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
    // Verify ownership of parent service log
    const serviceLog = await prisma.serviceLog.findFirst({
      where: {
        id: serviceLogId,
        OR: [
          { userId: session.user.id },
          { customer: { userId: session.user.id } },
        ],
      },
    })

    if (!serviceLog) {
      return NextResponse.json({ success: false, error: "Service log not found" }, { status: 404 })
    }

    const body = await request.json()
    const { date, durationMinutes, description } = body

    if (!date || durationMinutes === undefined) {
      return NextResponse.json(
        { success: false, error: "date and durationMinutes are required" },
        { status: 400 }
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      // Create the time entry
      const timeEntry = await tx.timeEntry.create({
        data: {
          serviceLogId,
          date: new Date(date),
          durationMinutes,
          description: description?.trim() || null,
        },
      })

      // Sum all time entries for this service log and update totalDurationMinutes
      const aggregate = await tx.timeEntry.aggregate({
        where: { serviceLogId },
        _sum: { durationMinutes: true },
      })

      await tx.serviceLog.update({
        where: { id: serviceLogId },
        data: { totalDurationMinutes: aggregate._sum.durationMinutes ?? 0 },
      })

      return timeEntry
    })

    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (error) {
    console.error("Failed to create time entry:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create time entry" },
      { status: 500 }
    )
  }
}
