import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  try {
    // Include user-owned categories and default categories (userId is null)
    const categories = await prisma.transactionCategory.findMany({
      where: {
        parentId: null,
        OR: [
          { userId },
          { userId: null, isDefault: true },
        ],
      },
      orderBy: { position: "asc" },
      include: {
        _count: {
          select: { transactions: true },
        },
        children: {
          orderBy: { position: "asc" },
          include: {
            _count: { select: { transactions: true } },
          },
        },
      },
    })

    return NextResponse.json({ success: true, data: categories })
  } catch (error) {
    console.error("Failed to fetch categories:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch categories" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  try {
    const body = await request.json()
    const { name, color, parentId, isGroup, position } = body

    if (!name || !color) {
      return NextResponse.json(
        { success: false, error: "Name and color are required" },
        { status: 400 }
      )
    }

    // Auto-generate slug from name
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")

    const category = await prisma.transactionCategory.create({
      data: {
        name: name.trim(),
        slug,
        color: color.trim(),
        userId,
        parentId: parentId ? parseInt(parentId, 10) : null,
        isGroup: isGroup || false,
        position: position ?? 0,
      },
      include: {
        _count: { select: { transactions: true } },
      },
    })

    return NextResponse.json({ success: true, data: category }, { status: 201 })
  } catch (error) {
    console.error("Failed to create category:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create category" },
      { status: 500 }
    )
  }
}
