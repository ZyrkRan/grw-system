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
  const routeId = parseInt(id, 10)

  if (isNaN(routeId)) {
    return NextResponse.json({ success: false, error: "Invalid route ID" }, { status: 400 })
  }

  try {
    const route = await prisma.route.findFirst({
      where: {
        id: routeId,
        userId: session.user.id,
      },
      include: {
        customers: {
          orderBy: { position: "asc" },
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
        },
      },
    })

    if (!route) {
      return NextResponse.json({ success: false, error: "Route not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: route })
  } catch (error) {
    console.error("Failed to fetch route:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch route" },
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
  const routeId = parseInt(id, 10)

  if (isNaN(routeId)) {
    return NextResponse.json({ success: false, error: "Invalid route ID" }, { status: 400 })
  }

  try {
    const existing = await prisma.route.findFirst({
      where: { id: routeId, userId: session.user.id },
    })

    if (!existing) {
      return NextResponse.json({ success: false, error: "Route not found" }, { status: 404 })
    }

    const body = await request.json()
    const { name, description, color, date } = body

    const route = await prisma.route.update({
      where: { id: routeId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(color !== undefined && { color: color || null }),
        ...(date !== undefined && { date: date ? new Date(date) : null }),
      },
      include: {
        _count: {
          select: { customers: true },
        },
      },
    })

    return NextResponse.json({ success: true, data: route })
  } catch (error) {
    console.error("Failed to update route:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update route" },
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
  const routeId = parseInt(id, 10)

  if (isNaN(routeId)) {
    return NextResponse.json({ success: false, error: "Invalid route ID" }, { status: 400 })
  }

  try {
    const existing = await prisma.route.findFirst({
      where: { id: routeId, userId: session.user.id },
    })

    if (!existing) {
      return NextResponse.json({ success: false, error: "Route not found" }, { status: 404 })
    }

    await prisma.route.delete({ where: { id: routeId } })

    return NextResponse.json({ success: true, data: null })
  } catch (error) {
    console.error("Failed to delete route:", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete route" },
      { status: 500 }
    )
  }
}
