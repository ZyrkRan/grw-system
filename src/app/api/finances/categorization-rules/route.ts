import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createRuleSchema, formatZodError } from "@/lib/validations/finances"
import { checkRateLimit, rateLimits, rateLimitResponse } from "@/lib/rate-limit"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  try {
    const rules = await prisma.categorizationRule.findMany({
      where: { userId },
      orderBy: { pattern: "asc" },
      include: {
        category: {
          select: { id: true, name: true, color: true },
        },
      },
    })

    return NextResponse.json({ success: true, data: rules })
  } catch (error) {
    console.error("Failed to fetch categorization rules:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch categorization rules" },
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

  const rl = checkRateLimit(`rule-create:${userId}`, rateLimits.write)
  if (!rl.success) return rateLimitResponse(rl.resetAt)

  try {
    const body = await request.json()
    const parsed = createRuleSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: formatZodError(parsed.error) },
        { status: 400 }
      )
    }

    const { pattern, categoryId, applyToExisting } = parsed.data

    // Verify category belongs to user or is a default category
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

    const rule = await prisma.categorizationRule.create({
      data: {
        pattern,
        categoryId,
        userId,
      },
      include: {
        category: {
          select: { id: true, name: true, color: true },
        },
      },
    })

    // Optionally apply the rule to existing uncategorized transactions
    let appliedCount = 0
    if (applyToExisting) {
      const uncategorized = await prisma.bankTransaction.findMany({
        where: { userId, categoryId: null },
      })

      const regex = new RegExp(pattern, "i")
      const matchingIds: number[] = []

      for (const txn of uncategorized) {
        if (
          regex.test(txn.description) ||
          (txn.merchantName && regex.test(txn.merchantName))
        ) {
          matchingIds.push(txn.id)
        }
      }

      if (matchingIds.length > 0) {
        const result = await prisma.bankTransaction.updateMany({
          where: { id: { in: matchingIds } },
          data: { categoryId },
        })
        appliedCount = result.count
      }
    }

    return NextResponse.json(
      { success: true, data: { rule, appliedCount } },
      { status: 201 }
    )
  } catch (error) {
    console.error("Failed to create categorization rule:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create categorization rule" },
      { status: 500 }
    )
  }
}
