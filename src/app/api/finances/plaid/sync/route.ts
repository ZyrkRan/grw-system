import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TransactionType } from "@/generated/prisma"
import { plaidClient } from "@/lib/plaid"
import { RemovedTransaction, Transaction } from "plaid"

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  let plaidItemId: string | undefined

  try {
    const body = await request.json()
    plaidItemId = body.plaidItemId

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

    // Fetch fresh balances from Plaid
    const balanceResponse = await plaidClient.accountsBalanceGet({
      access_token: plaidItem.accessToken,
    })
    const plaidBalances = new Map<string, number | null>()
    for (const acct of balanceResponse.data.accounts) {
      plaidBalances.set(acct.account_id, acct.balances.current)
    }

    // Process in a database transaction
    let addedCount = 0
    let modifiedCount = 0
    let removedCount = 0

    await prisma.$transaction(async (tx) => {
      // Process added transactions — filter out user-deleted ones
      const addedData = added
        .filter((txn) => accountMap.has(txn.account_id))
        .map((txn) => {
          const date = new Date(txn.date)
          const amount = Math.abs(txn.amount)
          const type: TransactionType = txn.amount < 0 ? "INFLOW" : "OUTFLOW"
          return {
            plaidTransactionId: txn.transaction_id,
            date,
            description: txn.name || txn.merchant_name || "Unknown",
            amount,
            type,
            accountId: accountMap.get(txn.account_id)!,
            userId,
            statementMonth: date.getMonth() + 1,
            statementYear: date.getFullYear(),
            isPending: txn.pending,
            merchantName: txn.merchant_name || null,
            plaidStatus: txn.pending ? "pending" : "posted",
            rawPlaidData: JSON.parse(JSON.stringify(txn)),
          }
        })

      // Filter out transactions that the user has deleted
      if (addedData.length > 0) {
        const plaidIds = addedData
          .map((txn) => txn.plaidTransactionId)
          .filter((id): id is string => !!id)

        // Fetch all deleted transaction IDs for this user (single indexed query)
        const deletedRecords = await tx.deletedPlaidTransaction.findMany({
          where: {
            userId,
            plaidTransactionId: { in: plaidIds },
          },
          select: { plaidTransactionId: true },
        })

        // Build Set for O(1) lookup
        const deletedIds = new Set(
          deletedRecords.map((r) => r.plaidTransactionId)
        )

        // Filter out deleted transactions
        const transactionsToInsert = addedData.filter(
          (txn) => !deletedIds.has(txn.plaidTransactionId)
        )

        if (transactionsToInsert.length > 0) {
          await tx.bankTransaction.createMany({ data: transactionsToInsert })
          addedCount = transactionsToInsert.length
        }

        // Log filtered count for visibility
        const filteredCount = addedData.length - transactionsToInsert.length
        if (filteredCount > 0) {
          console.log(
            `[Sync] Filtered out ${filteredCount} user-deleted transactions for user ${userId}`
          )
        }
      }

      // Process modified transactions — skip if user deleted
      if (modified.length > 0) {
        const modifiedPlaidIds = modified
          .map((txn) => txn.transaction_id)
          .filter((id): id is string => !!id)

        // Fetch deleted IDs for modified transactions
        const deletedModifiedRecords = await tx.deletedPlaidTransaction.findMany({
          where: {
            userId,
            plaidTransactionId: { in: modifiedPlaidIds },
          },
          select: { plaidTransactionId: true },
        })

        const deletedModifiedIds = new Set(
          deletedModifiedRecords.map((r) => r.plaidTransactionId)
        )

        // Filter out deleted transactions from modified array
        const updateResults = await Promise.all(
          modified
            .filter((txn) => !deletedModifiedIds.has(txn.transaction_id))
            .map(async (txn) => {
              const date = new Date(txn.date)
              const amount = Math.abs(txn.amount)
              const type = txn.amount < 0 ? "INFLOW" : "OUTFLOW"

              try {
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
                return true
              } catch {
                // Transaction doesn't exist, skip
                return false
              }
            })
        )
        modifiedCount = updateResults.filter(Boolean).length
      }

      // Process removed transactions — bulk delete
      const removedIds = removed
        .map((txn) => txn.transaction_id)
        .filter((id): id is string => !!id)

      if (removedIds.length > 0) {
        const deleteResult = await tx.bankTransaction.deleteMany({
          where: { plaidTransactionId: { in: removedIds } },
        })
        removedCount = deleteResult.count
      }

      // Update PlaidItem cursor and lastSuccessfulSync
      const now = new Date()
      await tx.plaidItem.update({
        where: { id: plaidItemId },
        data: {
          cursor: cursor,
          lastSuccessfulSync: now,
        },
      })

      // Update lastSyncedAt on all bank accounts for this Plaid item
      const bankAccountIds = Array.from(accountMap.values())
      if (bankAccountIds.length > 0) {
        await tx.bankAccount.updateMany({
          where: { id: { in: bankAccountIds } },
          data: { lastSyncedAt: now },
        })
      }

      // Update currentBalance for each account from Plaid balances
      for (const ba of plaidItem.bankAccounts) {
        if (ba.plaidAccountId && plaidBalances.has(ba.plaidAccountId)) {
          const rawBal = plaidBalances.get(ba.plaidAccountId) ?? null
          const currentBalance =
            rawBal !== null && ba.type === "CREDIT" ? -Math.abs(rawBal) : rawBal
          await tx.bankAccount.update({
            where: { id: ba.id },
            data: { currentBalance },
          })
        }
      }
    }, { timeout: 15000 })

    // Apply categorization rules to newly added uncategorized transactions
    if (addedCount > 0) {
      await applyCategorizationRules(userId)
    }

    return NextResponse.json({
      success: true,
      data: { added: addedCount, modified: modifiedCount, removed: removedCount },
    })
  } catch (error: unknown) {
    const plaidError = (error as { response?: { data?: unknown } })?.response?.data
    console.error("Failed to sync Plaid transactions:", plaidError || error)

    const plaidErrorCode = (plaidError as { error_code?: string })?.error_code
    const plaidMsg = (plaidError as { error_message?: string })?.error_message

    // Error codes that require reconnection
    const reconnectRequired = [
      "ITEM_LOGIN_REQUIRED",
      "INVALID_CREDENTIALS",
      "INVALID_UPDATED_USERNAME",
      "INVALID_MFA",
      "INTERNAL_SERVER_ERROR",
      "ITEM_NOT_SUPPORTED",
    ]

    // Detect errors that require reconnection — mark item for reconnection
    if (plaidItemId && plaidErrorCode && reconnectRequired.includes(plaidErrorCode)) {
      await prisma.plaidItem.update({
        where: { id: plaidItemId },
        data: {
          status: "LOGIN_REQUIRED",
          lastError: plaidMsg || "Login required — please reconnect your bank.",
        },
      })
      return NextResponse.json(
        { success: false, error: "LOGIN_REQUIRED", loginRequired: true },
        { status: 400 }
      )
    }

    // For other errors, set status to ERROR and update lastError
    if (plaidItemId && plaidErrorCode) {
      await prisma.plaidItem.update({
        where: { id: plaidItemId },
        data: {
          status: "ERROR",
          lastError: plaidMsg || "An error occurred during sync.",
        },
      })
    }

    const message = plaidMsg || (error instanceof Error ? error.message : "Failed to sync transactions")
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
