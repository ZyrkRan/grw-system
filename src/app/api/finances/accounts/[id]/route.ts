import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { updateAccountSchema, accountResetSchema, formatZodError } from "@/lib/validations/finances"
import { checkRateLimit, rateLimits, rateLimitResponse } from "@/lib/rate-limit"

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  const rl = checkRateLimit(`account-write:${userId}`, rateLimits.write)
  if (!rl.success) return rateLimitResponse(rl.resetAt)

  const { id } = await context.params
  const accountId = parseInt(id, 10)

  if (isNaN(accountId)) {
    return NextResponse.json(
      { success: false, error: "Invalid account ID" },
      { status: 400 }
    )
  }

  try {
    // Verify ownership
    const account = await prisma.bankAccount.findFirst({
      where: { id: accountId, userId },
    })

    if (!account) {
      return NextResponse.json(
        { success: false, error: "Account not found" },
        { status: 404 }
      )
    }

    const body = await request.json()
    const parsed = updateAccountSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: formatZodError(parsed.error) },
        { status: 400 }
      )
    }

    const { name, type, isActive, accountNumber, currentBalance } = parsed.data

    const updated = await prisma.bankAccount.update({
      where: { id: accountId },
      data: {
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(isActive !== undefined && { isActive }),
        ...(accountNumber !== undefined && { accountNumber }),
        ...(currentBalance !== undefined && { currentBalance }),
      },
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error("Failed to update account:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update account" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  const rl = checkRateLimit(`account-write:${userId}`, rateLimits.write)
  if (!rl.success) return rateLimitResponse(rl.resetAt)

  const { id } = await context.params
  const accountId = parseInt(id, 10)

  if (isNaN(accountId)) {
    return NextResponse.json(
      { success: false, error: "Invalid account ID" },
      { status: 400 }
    )
  }

  try {
    const body = await request.json()
    const parsed = accountResetSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: formatZodError(parsed.error) },
        { status: 400 }
      )
    }

    // Verify ownership
    const account = await prisma.bankAccount.findFirst({
      where: { id: accountId, userId },
      include: { _count: { select: { transactions: true } } },
    })

    if (!account) {
      return NextResponse.json(
        { success: false, error: "Account not found" },
        { status: 404 }
      )
    }

    // Delete all transactions and reset Plaid cursor if linked
    await prisma.$transaction(async (tx) => {
      await tx.bankTransaction.deleteMany({ where: { accountId } })

      if (account.plaidItemId) {
        await tx.plaidItem.update({
          where: { id: account.plaidItemId },
          data: { cursor: null },
        })
      }
    })

    return NextResponse.json({
      success: true,
      data: { reset: true, deletedCount: account._count.transactions },
    })
  } catch (error) {
    console.error("Failed to reset account:", error)
    return NextResponse.json(
      { success: false, error: "Failed to reset account" },
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

  const rl = checkRateLimit(`account-write:${userId}`, rateLimits.write)
  if (!rl.success) return rateLimitResponse(rl.resetAt)

  const { id } = await context.params
  const accountId = parseInt(id, 10)

  if (isNaN(accountId)) {
    return NextResponse.json(
      { success: false, error: "Invalid account ID" },
      { status: 400 }
    )
  }

  try {
    const account = await prisma.bankAccount.findFirst({
      where: { id: accountId, userId },
    })

    if (!account) {
      return NextResponse.json(
        { success: false, error: "Account not found" },
        { status: 404 }
      )
    }

    await prisma.$transaction([
      prisma.bankTransaction.deleteMany({ where: { accountId } }),
      prisma.bankAccount.delete({ where: { id: accountId } }),
    ])

    return NextResponse.json({ success: true, data: { deleted: true } })
  } catch (error) {
    console.error("Failed to delete account:", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete account" },
      { status: 500 }
    )
  }
}
