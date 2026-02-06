import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { items } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Items array is required" },
        { status: 400 }
      )
    }

    // Verify all items belong to the user
    const itemIds = items.map((item: { id: number; position: number }) => item.id)
    const ownedCount = await prisma.serviceType.count({
      where: {
        id: { in: itemIds },
        userId: session.user.id,
      },
    })

    if (ownedCount !== itemIds.length) {
      return NextResponse.json(
        { success: false, error: "One or more service types not found or not owned by user" },
        { status: 400 }
      )
    }

    // Update all positions in a transaction
    await prisma.$transaction(
      items.map((item: { id: number; position: number }) =>
        prisma.serviceType.update({
          where: { id: item.id },
          data: { position: item.position },
        })
      )
    )

    return NextResponse.json({ success: true, data: null })
  } catch (error) {
    console.error("Failed to reorder service types:", error)
    return NextResponse.json(
      { success: false, error: "Failed to reorder service types" },
      { status: 500 }
    )
  }
}
