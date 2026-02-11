import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { updateRuleSchema, formatZodError } from "@/lib/validations/finances"
import { checkRateLimit, rateLimits, rateLimitResponse } from "@/lib/rate-limit"

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  const rl = checkRateLimit(`rule-write:${userId}`, rateLimits.write)
  if (!rl.success) return rateLimitResponse(rl.resetAt)

  const { id } = await context.params
  const ruleId = parseInt(id, 10)

  if (isNaN(ruleId)) {
    return NextResponse.json(
      { success: false, error: "Invalid rule ID" },
      { status: 400 }
    )
  }

  try {
    const rule = await prisma.categorizationRule.findFirst({
      where: { id: ruleId, userId },
    })

    if (!rule) {
      return NextResponse.json(
        { success: false, error: "Rule not found" },
        { status: 404 }
      )
    }

    const body = await request.json()
    const parsed = updateRuleSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: formatZodError(parsed.error) },
        { status: 400 }
      )
    }

    const { pattern, categoryId } = parsed.data

    // Verify category if changing
    if (categoryId !== undefined) {
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
    }

    const updated = await prisma.categorizationRule.update({
      where: { id: ruleId },
      data: {
        ...(pattern !== undefined && { pattern }),
        ...(categoryId !== undefined && { categoryId }),
      },
      include: {
        category: {
          select: { id: true, name: true, color: true },
        },
      },
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error("Failed to update categorization rule:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update categorization rule" },
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

  const rl = checkRateLimit(`rule-write:${userId}`, rateLimits.write)
  if (!rl.success) return rateLimitResponse(rl.resetAt)

  const { id } = await context.params
  const ruleId = parseInt(id, 10)

  if (isNaN(ruleId)) {
    return NextResponse.json(
      { success: false, error: "Invalid rule ID" },
      { status: 400 }
    )
  }

  try {
    const rule = await prisma.categorizationRule.findFirst({
      where: { id: ruleId, userId },
    })

    if (!rule) {
      return NextResponse.json(
        { success: false, error: "Rule not found" },
        { status: 404 }
      )
    }

    await prisma.categorizationRule.delete({ where: { id: ruleId } })

    return NextResponse.json({ success: true, data: { deleted: true } })
  } catch (error) {
    console.error("Failed to delete categorization rule:", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete categorization rule" },
      { status: 500 }
    )
  }
}
