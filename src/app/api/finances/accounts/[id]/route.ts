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
    const { name, type, isActive, accountNumber } = body

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

    if (account._count.transactions > 0) {
      return NextResponse.json(
        { success: false, error: "Cannot delete account with existing transactions. Remove transactions first." },
        { status: 400 }
      )
    }

    await prisma.bankAccount.delete({ where: { id: accountId } })

    return NextResponse.json({ success: true, data: { deleted: true } })
  } catch (error) {
    console.error("Failed to delete account:", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete account" },
      { status: 500 }
    )
  }
}
