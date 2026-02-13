import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, context: RouteContext) {
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
    const { items } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Items array is required" },
        { status: 400 }
      )
    }

    const itemIds = items.map((item: { id: number; position: number }) => item.id)
    const ownedCount = await prisma.routeCustomer.count({
      where: {
        id: { in: itemIds },
        routeId,
      },
    })

    if (ownedCount !== itemIds.length) {
      return NextResponse.json(
        { success: false, error: "One or more items not found in this route" },
        { status: 400 }
      )
    }

    await prisma.$transaction(
      items.map((item: { id: number; position: number }) =>
        prisma.routeCustomer.update({
          where: { id: item.id },
          data: { position: item.position },
        })
      )
    )

    return NextResponse.json({ success: true, data: null })
  } catch (error) {
    console.error("Failed to reorder route customers:", error)
    return NextResponse.json(
      { success: false, error: "Failed to reorder route customers" },
      { status: 500 }
    )
  }
}
