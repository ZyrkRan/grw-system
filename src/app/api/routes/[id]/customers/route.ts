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
  const routeId = parseInt(id, 10)

  if (isNaN(routeId)) {
    return NextResponse.json({ success: false, error: "Invalid route ID" }, { status: 400 })
  }

  try {
    const route = await prisma.route.findFirst({
      where: { id: routeId, userId: session.user.id },
    })

    if (!route) {
      return NextResponse.json({ success: false, error: "Route not found" }, { status: 404 })
    }

    const body = await request.json()
    const { customerId } = body

    if (!customerId) {
      return NextResponse.json(
        { success: false, error: "Customer ID is required" },
        { status: 400 }
      )
    }

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, userId: session.user.id },
    })

    if (!customer) {
      return NextResponse.json(
        { success: false, error: "Customer not found" },
        { status: 404 }
      )
    }

    const existing = await prisma.routeCustomer.findUnique({
      where: { routeId_customerId: { routeId, customerId } },
    })

    if (existing) {
      return NextResponse.json(
        { success: false, error: "Customer is already in this route" },
        { status: 400 }
      )
    }

    const maxPosition = await prisma.routeCustomer.aggregate({
      where: { routeId },
      _max: { position: true },
    })

    const nextPosition = (maxPosition._max.position ?? -1) + 1

    const routeCustomer = await prisma.routeCustomer.create({
      data: {
        routeId,
        customerId,
        position: nextPosition,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            address: true,
            email: true,
            isVip: true,
          },
        },
      },
    })

    return NextResponse.json({ success: true, data: routeCustomer }, { status: 201 })
  } catch (error) {
    console.error("Failed to add customer to route:", error)
    return NextResponse.json(
      { success: false, error: "Failed to add customer to route" },
      { status: 500 }
    )
  }
}
