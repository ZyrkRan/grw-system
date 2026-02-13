import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type RouteContext = { params: Promise<{ id: string; customerId: string }> }

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const { id, customerId: customerIdStr } = await context.params
  const routeId = parseInt(id, 10)
  const customerId = parseInt(customerIdStr, 10)

  if (isNaN(routeId) || isNaN(customerId)) {
    return NextResponse.json({ success: false, error: "Invalid ID" }, { status: 400 })
  }

  try {
    const route = await prisma.route.findFirst({
      where: { id: routeId, userId: session.user.id },
    })

    if (!route) {
      return NextResponse.json({ success: false, error: "Route not found" }, { status: 404 })
    }

    const routeCustomer = await prisma.routeCustomer.findUnique({
      where: { routeId_customerId: { routeId, customerId } },
    })

    if (!routeCustomer) {
      return NextResponse.json(
        { success: false, error: "Customer not found in this route" },
        { status: 404 }
      )
    }

    await prisma.routeCustomer.delete({
      where: { id: routeCustomer.id },
    })

    return NextResponse.json({ success: true, data: null })
  } catch (error) {
    console.error("Failed to remove customer from route:", error)
    return NextResponse.json(
      { success: false, error: "Failed to remove customer from route" },
      { status: 500 }
    )
  }
}
