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
      // Sort by applyCount desc so rules that fire often bubble to the top
      // in the rule manager UI. Fallback on pattern for deterministic order.
      orderBy: [{ applyCount: "desc" }, { pattern: "asc" }],
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

    const { pattern, categoryId, taxType, applyToExisting } = parsed.data

    // Only verify category ownership when a non-null categoryId is provided.
    // Rules can be taxType-only (categoryId null); those skip the check.
    if (categoryId !== undefined && categoryId !== null) {
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

    const rule = await prisma.categorizationRule.create({
      data: {
        pattern,
        categoryId: categoryId ?? null,
        taxType: taxType ?? null,
        userId,
      },
      include: {
        category: {
          select: { id: true, name: true, color: true },
        },
      },
    })

    // Optionally apply the rule to existing uncategorized transactions.
    // For a taxType-only rule, "uncategorized" means taxType IS NULL; for a
    // category rule it means categoryId IS NULL (matching the legacy semantics).
    let appliedCount = 0
    if (applyToExisting) {
      const whereClause =
        categoryId !== undefined && categoryId !== null
          ? { userId, categoryId: null }
          : { userId, taxType: null }
      const uncategorized = await prisma.bankTransaction.findMany({
        where: whereClause,
        select: { id: true, description: true, merchantName: true },
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
          data: {
            ...(categoryId !== undefined && categoryId !== null ? { categoryId } : {}),
            ...(taxType !== undefined ? { taxType } : {}),
            isReviewed: true,
          },
        })
        appliedCount = result.count
        // Reflect the initial applyCount so the rule ranking picks this up.
        if (appliedCount > 0) {
          await prisma.categorizationRule.update({
            where: { id: rule.id },
            data: { applyCount: { increment: appliedCount } },
          })
        }
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
