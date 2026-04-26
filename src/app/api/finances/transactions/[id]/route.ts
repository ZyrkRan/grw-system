import { NextRequest, NextResponse } from "next/server"
import { del } from "@vercel/blob"
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

    const {
      notes,
      categoryId,
      serviceLogId,
      description,
      amount,
      date,
      type,
      merchantName,
      taxType,
      isReviewed,
      saveRule,
    } = parsed.data

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
        ...(merchantName !== undefined && { merchantName }),
        ...(taxType !== undefined && { taxType }),
        ...(isReviewed !== undefined && { isReviewed }),
        ...(statementMonth !== undefined && { statementMonth }),
        ...(statementYear !== undefined && { statementYear }),
      },
      include: {
        account: { select: { id: true, name: true } },
        category: {
          select: {
            id: true,
            name: true,
            color: true,
            parentId: true,
            parent: { select: { id: true, name: true, isSystemGroup: true } },
          },
        },
        serviceLog: { select: { id: true, serviceName: true } },
      },
    })

    // Inline rule creation: if the client asked to save a rule from this row,
    // create it (or silently no-op if an identical rule already exists).
    if (saveRule && saveRule.pattern) {
      try {
        // eslint-disable-next-line no-new
        new RegExp(saveRule.pattern, "i")
        const existing = await prisma.categorizationRule.findFirst({
          where: {
            userId,
            pattern: saveRule.pattern,
            categoryId: saveRule.categoryId ?? null,
            taxType: saveRule.taxType ?? null,
          },
        })
        if (!existing) {
          await prisma.categorizationRule.create({
            data: {
              userId,
              pattern: saveRule.pattern,
              categoryId: saveRule.categoryId ?? null,
              taxType: saveRule.taxType ?? null,
            },
          })
        }
      } catch {
        // Invalid regex — quietly ignore the rule save, the transaction
        // update itself still succeeded.
      }
    }

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
    // Verify ownership and fetch transaction with attachments
    const transaction = await prisma.bankTransaction.findFirst({
      where: { id: txnId, userId },
      include: { attachments: { select: { url: true } } },
    })

    if (!transaction) {
      return NextResponse.json(
        { success: false, error: "Transaction not found" },
        { status: 404 }
      )
    }

    // Clean up attachment blobs
    if (transaction.attachments.length > 0) {
      const urls = transaction.attachments.map((a) => a.url)
      await del(urls).catch((err) =>
        console.error("Failed to delete attachment blobs:", err)
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
