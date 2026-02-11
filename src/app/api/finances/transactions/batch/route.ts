import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma"
import {
  batchDeleteSchema,
  batchCategoryAssignSchema,
  formatZodError,
} from "@/lib/validations/finances"
import { checkRateLimit, rateLimits, rateLimitResponse } from "@/lib/rate-limit"

export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  const rl = checkRateLimit(`txn-batch:${userId}`, rateLimits.write)
  if (!rl.success) return rateLimitResponse(rl.resetAt)

  try {
    const body = await request.json()
    const parsed = batchDeleteSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: formatZodError(parsed.error) },
        { status: 400 }
      )
    }

    const { ids } = parsed.data

    // Fetch all transactions to verify ownership and get Plaid IDs
    const transactions = await prisma.bankTransaction.findMany({
      where: { id: { in: ids }, userId },
      select: { id: true, plaidTransactionId: true, rawPlaidData: true },
    })

    if (transactions.length === 0) {
      return NextResponse.json(
        { success: false, error: "No matching transactions found" },
        { status: 404 }
      )
    }

    const verifiedIds = transactions.map((t) => t.id)
    const plaidTransactions = transactions.filter((t) => t.plaidTransactionId)

    await prisma.$transaction(async (tx) => {
      // Track deleted Plaid transactions to prevent re-import
      if (plaidTransactions.length > 0) {
        await tx.deletedPlaidTransaction.createMany({
          data: plaidTransactions.map((t) => ({
            userId,
            plaidTransactionId: t.plaidTransactionId!,
            transactionData: t.rawPlaidData ?? Prisma.DbNull,
          })),
          skipDuplicates: true,
        })
      }

      // Batch delete
      await tx.bankTransaction.deleteMany({
        where: { id: { in: verifiedIds } },
      })
    })

    return NextResponse.json({
      success: true,
      data: { deleted: verifiedIds.length, requested: ids.length },
    })
  } catch (error) {
    console.error("Failed to batch delete transactions:", error)
    return NextResponse.json(
      { success: false, error: "Failed to batch delete transactions" },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  const rl = checkRateLimit(`txn-batch:${userId}`, rateLimits.write)
  if (!rl.success) return rateLimitResponse(rl.resetAt)

  try {
    const body = await request.json()
    const parsed = batchCategoryAssignSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: formatZodError(parsed.error) },
        { status: 400 }
      )
    }

    const { ids, categoryId } = parsed.data

    // Verify category ownership if assigning (not clearing)
    if (categoryId !== null) {
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

    // Batch update — only update transactions owned by this user
    const result = await prisma.bankTransaction.updateMany({
      where: { id: { in: ids }, userId },
      data: { categoryId },
    })

    return NextResponse.json({
      success: true,
      data: { updated: result.count, requested: ids.length },
    })
  } catch (error) {
    console.error("Failed to batch assign category:", error)
    return NextResponse.json(
      { success: false, error: "Failed to batch assign category" },
      { status: 500 }
    )
  }
}
