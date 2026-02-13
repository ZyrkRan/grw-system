import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { computeDueDateInfo } from "@/lib/due-date"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  const customerId = parseInt(id, 10)

  if (isNaN(customerId)) {
    return NextResponse.json({ success: false, error: "Invalid customer ID" }, { status: 400 })
  }

  try {
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        userId: session.user.id,
      },
      include: {
        serviceLogs: {
          include: {
            serviceType: true,
          },
          orderBy: { serviceDate: "desc" },
        },
        invoices: {
          orderBy: { issueDate: "desc" },
        },
      },
    })

    if (!customer) {
      return NextResponse.json({ success: false, error: "Customer not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: customer })
  } catch (error) {
    console.error("Failed to fetch customer:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch customer" },
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
  const customerId = parseInt(id, 10)

  if (isNaN(customerId)) {
    return NextResponse.json({ success: false, error: "Invalid customer ID" }, { status: 400 })
  }

  try {
    const existing = await prisma.customer.findFirst({
      where: { id: customerId, userId: session.user.id },
    })

    if (!existing) {
      return NextResponse.json({ success: false, error: "Customer not found" }, { status: 404 })
    }

    const body = await request.json()
    const { name, phone, email, address, serviceInterval, isVip } = body

    const customer = await prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(phone !== undefined && { phone: phone.trim() }),
        ...(email !== undefined && { email: email?.trim() || null }),
        ...(address !== undefined && { address: address.trim() }),
        ...(serviceInterval !== undefined && {
          serviceInterval: serviceInterval ? parseInt(serviceInterval, 10) : null,
        }),
        ...(isVip !== undefined && { isVip: isVip === true }),
      },
      include: {
        serviceLogs: {
          orderBy: { serviceDate: "desc" as const },
          take: 1,
          select: { serviceDate: true },
        },
      },
    })

    const { serviceLogs, ...rest } = customer
    const dueInfo = computeDueDateInfo(
      serviceLogs[0]?.serviceDate,
      rest.serviceInterval
    )

    return NextResponse.json({ success: true, data: { ...rest, ...dueInfo } })
  } catch (error) {
    console.error("Failed to update customer:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update customer" },
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
  const customerId = parseInt(id, 10)

  if (isNaN(customerId)) {
    return NextResponse.json({ success: false, error: "Invalid customer ID" }, { status: 400 })
  }

  try {
    const existing = await prisma.customer.findFirst({
      where: { id: customerId, userId: session.user.id },
      include: {
        _count: { select: { serviceLogs: true } },
      },
    })

    if (!existing) {
      return NextResponse.json({ success: false, error: "Customer not found" }, { status: 404 })
    }

    if (existing._count.serviceLogs > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete customer with ${existing._count.serviceLogs} service log(s). Remove service logs first.`,
        },
        { status: 400 }
      )
    }

    await prisma.customer.delete({ where: { id: customerId } })

    return NextResponse.json({ success: true, data: null })
  } catch (error) {
    console.error("Failed to delete customer:", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete customer" },
      { status: 500 }
    )
  }
}
