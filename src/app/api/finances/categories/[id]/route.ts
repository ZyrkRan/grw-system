import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { updateCategorySchema, formatZodError } from "@/lib/validations/finances"
import { checkRateLimit, rateLimits, rateLimitResponse } from "@/lib/rate-limit"

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  const rl = checkRateLimit(`category-write:${userId}`, rateLimits.write)
  if (!rl.success) return rateLimitResponse(rl.resetAt)

  const { id } = await context.params
  const categoryId = parseInt(id, 10)

  if (isNaN(categoryId)) {
    return NextResponse.json(
      { success: false, error: "Invalid category ID" },
      { status: 400 }
    )
  }

  try {
    // Verify ownership (user-owned or default category)
    const category = await prisma.transactionCategory.findFirst({
      where: {
        id: categoryId,
        OR: [{ userId }, { userId: null, isDefault: true }],
      },
    })

    if (!category) {
      return NextResponse.json(
        { success: false, error: "Category not found" },
        { status: 404 }
      )
    }

    const body = await request.json()
    const parsed = updateCategorySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: formatZodError(parsed.error) },
        { status: 400 }
      )
    }

    const { name, color, parentId, isGroup, position, attachmentPrompt } = parsed.data

    // If name is changing, regenerate slug
    let slug: string | undefined
    if (name !== undefined) {
      slug = name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
    }

    const updated = await prisma.transactionCategory.update({
      where: { id: categoryId },
      data: {
        ...(name !== undefined && { name }),
        ...(slug !== undefined && { slug }),
        ...(color !== undefined && { color }),
        ...(parentId !== undefined && { parentId }),
        ...(isGroup !== undefined && { isGroup }),
        ...(position !== undefined && { position }),
        ...(attachmentPrompt !== undefined && { attachmentPrompt }),
      },
      include: {
        _count: { select: { transactions: true } },
      },
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error("Failed to update category:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update category" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  const rl = checkRateLimit(`category-write:${userId}`, rateLimits.write)
  if (!rl.success) return rateLimitResponse(rl.resetAt)

  const { id } = await context.params
  const categoryId = parseInt(id, 10)

  if (isNaN(categoryId)) {
    return NextResponse.json(
      { success: false, error: "Invalid category ID" },
      { status: 400 }
    )
  }

  try {
    const category = await prisma.transactionCategory.findFirst({
      where: { id: categoryId, userId },
      include: { _count: { select: { transactions: true } } },
    })

    if (!category) {
      return NextResponse.json(
        { success: false, error: "Category not found" },
        { status: 404 }
      )
    }

    if (category._count.transactions > 0) {
      return NextResponse.json(
        { success: false, error: "Cannot delete category with assigned transactions. Reassign transactions first." },
        { status: 400 }
      )
    }

    await prisma.transactionCategory.delete({ where: { id: categoryId } })

    return NextResponse.json({ success: true, data: { deleted: true } })
  } catch (error) {
    console.error("Failed to delete category:", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete category" },
      { status: 500 }
    )
  }
}
