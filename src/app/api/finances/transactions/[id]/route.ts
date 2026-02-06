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
  const txnId = parseInt(id, 10)

  if (isNaN(txnId)) {
    return NextResponse.json(
      { success: false, error: "Invalid transaction ID" },
      { status: 400 }
    )
  }

  try {
    // Verify ownership
    const transaction = await prisma.bankTransaction.findFirst({
      where: { id: txnId, userId },
    })

    if (!transaction) {
      return NextResponse.json(
        { success: false, error: "Transaction not found" },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { notes, categoryId, serviceLogId, description, amount, date, type } = body

    const validTypes = ["INFLOW", "OUTFLOW"]
    if (type && !validTypes.includes(type)) {
      return NextResponse.json(
        { success: false, error: "Type must be INFLOW or OUTFLOW" },
        { status: 400 }
      )
    }

    // If date changes, recalculate statementMonth/statementYear
    let statementMonth: number | undefined
    let statementYear: number | undefined
    if (date) {
      const newDate = new Date(date)
      statementMonth = newDate.getMonth() + 1
      statementYear = newDate.getFullYear()
    }

    const updated = await prisma.bankTransaction.update({
      where: { id: txnId },
      data: {
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(categoryId !== undefined && { categoryId: categoryId ? parseInt(categoryId, 10) : null }),
        ...(serviceLogId !== undefined && { serviceLogId: serviceLogId ? parseInt(serviceLogId, 10) : null }),
        ...(description !== undefined && { description: description.trim() }),
        ...(amount !== undefined && { amount: parseFloat(amount) }),
        ...(date !== undefined && { date: new Date(date) }),
        ...(type !== undefined && { type }),
        ...(statementMonth !== undefined && { statementMonth }),
        ...(statementYear !== undefined && { statementYear }),
      },
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true } },
        serviceLog: { select: { id: true, serviceName: true } },
      },
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error("Failed to update transaction:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update transaction" },
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
  const txnId = parseInt(id, 10)

  if (isNaN(txnId)) {
    return NextResponse.json(
      { success: false, error: "Invalid transaction ID" },
      { status: 400 }
    )
  }

  try {
    // Verify ownership
    const transaction = await prisma.bankTransaction.findFirst({
      where: { id: txnId, userId },
    })

    if (!transaction) {
      return NextResponse.json(
        { success: false, error: "Transaction not found" },
        { status: 404 }
      )
    }

    // Don't allow deleting Plaid-synced transactions
    if (transaction.plaidTransactionId) {
      return NextResponse.json(
        { success: false, error: "Cannot delete Plaid-synced transactions. They are managed by Plaid sync." },
        { status: 400 }
      )
    }

    await prisma.bankTransaction.delete({ where: { id: txnId } })

    return NextResponse.json({ success: true, data: { deleted: true } })
  } catch (error) {
    console.error("Failed to delete transaction:", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete transaction" },
      { status: 500 }
    )
  }
}
