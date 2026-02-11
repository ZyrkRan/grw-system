import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!
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
    const { name, type, isActive, accountNumber, currentBalance } = body

    const validTypes = ["CHECKING", "SAVINGS", "CREDIT"]
    if (type && !validTypes.includes(type)) {
      return NextResponse.json(
        { success: false, error: "Type must be CHECKING, SAVINGS, or CREDIT" },
        { status: 400 }
      )
    }

    const updated = await prisma.bankAccount.update({
      where: { id: accountId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(type !== undefined && { type }),
        ...(isActive !== undefined && { isActive }),
        ...(accountNumber !== undefined && { accountNumber: accountNumber?.trim() || null }),
        ...(currentBalance !== undefined && {
          currentBalance: currentBalance === null || currentBalance === "" ? null : parseFloat(currentBalance),
        }),
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

    if (body.action !== "reset") {
      return NextResponse.json(
        { success: false, error: "Unknown action" },
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
      const deleted = await tx.bankTransaction.deleteMany({ where: { accountId } })

      // Reset Plaid cursor so next sync re-fetches all transactions
      if (account.plaidItemId) {
        await tx.plaidItem.update({
          where: { id: account.plaidItemId },
          data: { cursor: null },
        })
      }

      return deleted
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
      include: { _count: { select: { transactions: true } } },
    })

    if (!account) {
      return NextResponse.json(
        { success: false, error: "Account not found" },
        { status: 404 }
      )
    }

    // Delete transactions first, then the account
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
