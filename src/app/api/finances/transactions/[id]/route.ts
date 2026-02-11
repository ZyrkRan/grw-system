import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma"
import { updateTransactionSchema, formatZodError } from "@/lib/validations/finances"
import { checkRateLimit, rateLimits, rateLimitResponse } from "@/lib/rate-limit"

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  const rl = checkRateLimit(`txn-write:${userId}`, rateLimits.write)
  if (!rl.success) return rateLimitResponse(rl.resetAt)

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
    const parsed = updateTransactionSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: formatZodError(parsed.error) },
        { status: 400 }
      )
    }

    const { notes, categoryId, serviceLogId, description, amount, date, type } = parsed.data

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
        ...(notes !== undefined && { notes }),
        ...(categoryId !== undefined && { categoryId }),
        ...(serviceLogId !== undefined && { serviceLogId }),
        ...(description !== undefined && { description }),
        ...(amount !== undefined && { amount }),
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

  const rl = checkRateLimit(`txn-write:${userId}`, rateLimits.write)
  if (!rl.success) return rateLimitResponse(rl.resetAt)

  const { id } = await context.params
  const txnId = parseInt(id, 10)

  if (isNaN(txnId)) {
    return NextResponse.json(
      { success: false, error: "Invalid transaction ID" },
      { status: 400 }
    )
  }

  try {
    // Verify ownership and fetch transaction
    const transaction = await prisma.bankTransaction.findFirst({
      where: { id: txnId, userId },
    })

    if (!transaction) {
      return NextResponse.json(
        { success: false, error: "Transaction not found" },
        { status: 404 }
      )
    }

    // Use transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      // If this is a Plaid-sourced transaction, track the deletion
      if (transaction.plaidTransactionId) {
        await tx.deletedPlaidTransaction.upsert({
          where: {
            userId_plaidTransactionId: {
              userId,
              plaidTransactionId: transaction.plaidTransactionId,
            },
          },
          create: {
            userId,
            plaidTransactionId: transaction.plaidTransactionId,
            transactionData: transaction.rawPlaidData ?? Prisma.DbNull,
          },
          update: {
            deletedAt: new Date(),
          },
        })
      }

      // Delete the transaction
      await tx.bankTransaction.delete({ where: { id: txnId } })
    })

    return NextResponse.json({ success: true, data: { deleted: true } })
  } catch (error) {
    console.error("Failed to delete transaction:", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete transaction" },
      { status: 500 }
    )
  }
}
