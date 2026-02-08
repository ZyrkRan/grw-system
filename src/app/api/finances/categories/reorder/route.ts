import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

interface ReorderItem {
  id: number
  position: number
  parentId: number | null
}

export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  try {
    const body = await request.json()
    const { items } = body as { items: ReorderItem[] }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Items array is required" },
        { status: 400 }
      )
    }

    const itemIds = items.map((item) => item.id)

    // Verify all items belong to the user or are default categories
    const ownedCount = await prisma.transactionCategory.count({
      where: {
        id: { in: itemIds },
        OR: [{ userId }, { userId: null, isDefault: true }],
      },
    })

    if (ownedCount !== itemIds.length) {
      return NextResponse.json(
        { success: false, error: "One or more categories not found or not owned by user" },
        { status: 400 }
      )
    }

    // Validate parentId references — must be isGroup: true
    const parentIds = [...new Set(items.filter((i) => i.parentId !== null).map((i) => i.parentId!))]
    if (parentIds.length > 0) {
      const validGroups = await prisma.transactionCategory.count({
        where: {
          id: { in: parentIds },
          isGroup: true,
          OR: [{ userId }, { userId: null, isDefault: true }],
        },
      })
      if (validGroups !== parentIds.length) {
        return NextResponse.json(
          { success: false, error: "Invalid parent: parentId must reference a group category" },
          { status: 400 }
        )
      }
    }

    // Validate groups cannot be nested inside other groups
    const groupIds = items.filter((i) => i.parentId !== null).map((i) => i.id)
    if (groupIds.length > 0) {
      const nestedGroups = await prisma.transactionCategory.count({
        where: {
          id: { in: groupIds },
          isGroup: true,
        },
      })
      if (nestedGroups > 0) {
        return NextResponse.json(
          { success: false, error: "Groups cannot be nested inside other groups" },
          { status: 400 }
        )
      }
    }

    // Update all positions and parentIds in a transaction
    await prisma.$transaction(
      items.map((item) =>
        prisma.transactionCategory.update({
          where: { id: item.id },
          data: { position: item.position, parentId: item.parentId },
        })
      )
    )

    return NextResponse.json({ success: true, data: null })
  } catch (error) {
    console.error("Failed to reorder categories:", error)
    return NextResponse.json(
      { success: false, error: "Failed to reorder categories" },
      { status: 500 }
    )
  }
}
