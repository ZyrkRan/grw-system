import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { plaidClient } from "@/lib/plaid"
import { RemovedTransaction, Transaction } from "plaid"

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  try {
    const body = await request.json()
    const { plaidItemId } = body

    if (!plaidItemId) {
      return NextResponse.json(
        { success: false, error: "plaidItemId is required" },
        { status: 400 }
      )
    }

    // Fetch the PlaidItem and verify ownership
    const plaidItem = await prisma.plaidItem.findFirst({
      where: { id: plaidItemId, userId },
      include: { bankAccounts: true },
    })

    if (!plaidItem) {
      return NextResponse.json(
        { success: false, error: "Plaid item not found" },
        { status: 404 }
      )
    }

    // Build a map of plaidAccountId -> bankAccount.id
    const accountMap = new Map<string, number>()
    for (const ba of plaidItem.bankAccounts) {
      if (ba.plaidAccountId) {
        accountMap.set(ba.plaidAccountId, ba.id)
      }
    }

    // Fetch all pages of transaction updates
    let cursor = plaidItem.cursor || undefined
    let added: Transaction[] = []
    let modified: Transaction[] = []
    let removed: RemovedTransaction[] = []
    let hasMore = true

    while (hasMore) {
      const response = await plaidClient.transactionsSync({
        access_token: plaidItem.accessToken,
        cursor: cursor,
      })

      added = added.concat(response.data.added)
      modified = modified.concat(response.data.modified)
      removed = removed.concat(response.data.removed)
      hasMore = response.data.has_more
      cursor = response.data.next_cursor
    }

    // Process in a database transaction
    let addedCount = 0
    let modifiedCount = 0
    let removedCount = 0

    await prisma.$transaction(async (tx) => {
      // Process added transactions
      for (const txn of added) {
        const accountId = accountMap.get(txn.account_id)
        if (!accountId) continue

        const date = new Date(txn.date)
        // Plaid: positive = debit (outflow), negative = credit (inflow)
        const amount = Math.abs(txn.amount)
        const type = txn.amount < 0 ? "INFLOW" : "OUTFLOW"

        await tx.bankTransaction.create({
          data: {
            date,
            description: txn.name || txn.merchant_name || "Unknown",
            amount,
            type,
            accountId,
            userId,
            statementMonth: date.getMonth() + 1,
            statementYear: date.getFullYear(),
            isPending: txn.pending,
            merchantName: txn.merchant_name || null,
            plaidTransactionId: txn.transaction_id,
            plaidStatus: txn.pending ? "pending" : "posted",
            rawPlaidData: JSON.parse(JSON.stringify(txn)),
          },
        })
        addedCount++
      }

      // Process modified transactions
      for (const txn of modified) {
        const existing = await tx.bankTransaction.findUnique({
          where: { plaidTransactionId: txn.transaction_id },
        })
        if (!existing) continue

        const date = new Date(txn.date)
        const amount = Math.abs(txn.amount)
        const type = txn.amount < 0 ? "INFLOW" : "OUTFLOW"

        await tx.bankTransaction.update({
          where: { plaidTransactionId: txn.transaction_id },
          data: {
            date,
            description: txn.name || txn.merchant_name || "Unknown",
            amount,
            type,
            statementMonth: date.getMonth() + 1,
            statementYear: date.getFullYear(),
            isPending: txn.pending,
            merchantName: txn.merchant_name || null,
            plaidStatus: txn.pending ? "pending" : "posted",
            rawPlaidData: JSON.parse(JSON.stringify(txn)),
          },
        })
        modifiedCount++
      }

      // Process removed transactions
      for (const txn of removed) {
        if (!txn.transaction_id) continue
        const existing = await tx.bankTransaction.findUnique({
          where: { plaidTransactionId: txn.transaction_id },
        })
        if (existing) {
          await tx.bankTransaction.delete({
            where: { plaidTransactionId: txn.transaction_id },
          })
          removedCount++
        }
      }

      // Update PlaidItem cursor and lastSuccessfulSync
      await tx.plaidItem.update({
        where: { id: plaidItemId },
        data: {
          cursor: cursor,
          lastSuccessfulSync: new Date(),
        },
      })
    })

    // Apply categorization rules to newly added uncategorized transactions
    if (addedCount > 0) {
      await applyCategorizationRules(userId)
    }

    return NextResponse.json({
      success: true,
      data: { added: addedCount, modified: modifiedCount, removed: removedCount },
    })
  } catch (error: unknown) {
    console.error("Failed to sync Plaid transactions:", error)
    const message =
      error instanceof Error ? error.message : "Failed to sync transactions"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}

async function applyCategorizationRules(userId: string) {
  const rules = await prisma.categorizationRule.findMany({
    where: { userId },
  })

  if (rules.length === 0) return

  const uncategorized = await prisma.bankTransaction.findMany({
    where: { userId, categoryId: null },
  })

  for (const txn of uncategorized) {
    for (const rule of rules) {
      const regex = new RegExp(rule.pattern, "i")
      if (
        regex.test(txn.description) ||
        (txn.merchantName && regex.test(txn.merchantName))
      ) {
        await prisma.bankTransaction.update({
          where: { id: txn.id },
          data: { categoryId: rule.categoryId },
        })
        break // first matching rule wins
      }
    }
  }
}
