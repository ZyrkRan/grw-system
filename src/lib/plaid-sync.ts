import { prisma } from "@/lib/prisma"
import { plaidClient } from "@/lib/plaid"
import { TransactionType } from "@/generated/prisma"
import type { RemovedTransaction, Transaction } from "plaid"

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export type PlaidSyncErrorCode = "NOT_FOUND" | "LOGIN_REQUIRED" | "PLAID_ERROR"

export class PlaidSyncError extends Error {
  code: PlaidSyncErrorCode
  plaidMessage?: string

  constructor(code: PlaidSyncErrorCode, message: string, plaidMessage?: string) {
    super(message)
    this.name = "PlaidSyncError"
    this.code = code
    this.plaidMessage = plaidMessage
  }
}

// ---------------------------------------------------------------------------
// Concurrency guard — prevent overlapping syncs for the same PlaidItem
// ---------------------------------------------------------------------------

const activeSyncs = new Set<string>()

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface SyncResult {
  added: number
  modified: number
  removed: number
  merged: number
  skipped?: boolean
  refreshFailed?: boolean
  plaidReturned?: { added: number; modified: number; removed: number }
  hadCursor?: boolean
}

// ---------------------------------------------------------------------------
// Core sync function
// ---------------------------------------------------------------------------

/**
 * Sync transactions and balances for a PlaidItem.
 * Throws PlaidSyncError on failure — callers handle HTTP formatting.
 */
export async function syncPlaidItem(
  plaidItemId: string,
  userId: string
): Promise<SyncResult> {
  // Concurrency guard
  if (activeSyncs.has(plaidItemId)) {
    return { added: 0, modified: 0, removed: 0, merged: 0, skipped: true }
  }
  activeSyncs.add(plaidItemId)

  try {
    // Fetch the PlaidItem and verify ownership
    const plaidItem = await prisma.plaidItem.findFirst({
      where: { id: plaidItemId, userId },
      include: { bankAccounts: true },
    })

    if (!plaidItem) {
      throw new PlaidSyncError("NOT_FOUND", "Plaid item not found")
    }

    // Build a map of plaidAccountId -> bankAccount.id
    const accountMap = new Map<string, number>()
    for (const ba of plaidItem.bankAccounts) {
      if (ba.plaidAccountId) {
        accountMap.set(ba.plaidAccountId, ba.id)
      }
    }

    // Request fresh data from the bank (best-effort, don't block on failure)
    let refreshFailed = false
    try {
      await plaidClient.transactionsRefresh({
        access_token: plaidItem.accessToken,
      })
    } catch (refreshError) {
      refreshFailed = true
      console.warn("[Sync] transactionsRefresh failed (proceeding with sync):", refreshError)
    }

    // Fetch transaction updates and balances in parallel
    const balancePromise = plaidClient.accountsBalanceGet({
      access_token: plaidItem.accessToken,
    })

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

    const balanceResponse = await balancePromise
    const plaidBalances = new Map<string, number | null>()
    for (const acct of balanceResponse.data.accounts) {
      plaidBalances.set(acct.account_id, acct.balances.current)
    }

    console.log(`[Sync] Plaid returned: ${added.length} added, ${modified.length} modified, ${removed.length} removed (cursor: ${cursor ? "present" : "initial"})`)

    // Process in a database transaction
    let addedCount = 0
    let modifiedCount = 0
    let removedCount = 0
    let mergedCount = 0
    let addedPlaidIds: string[] = []

    await prisma.$transaction(async (tx) => {
      // Process added transactions — filter out user-deleted ones
      const unmappedCount = added.filter((txn) => !accountMap.has(txn.account_id)).length
      if (unmappedCount > 0) {
        console.log(`[Sync] ${unmappedCount} transactions skipped — no matching account mapping`)
      }

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

        const deletedRecords = await tx.deletedPlaidTransaction.findMany({
          where: {
            userId,
            plaidTransactionId: { in: plaidIds },
          },
          select: { plaidTransactionId: true },
        })

        const deletedIds = new Set(
          deletedRecords.map((r) => r.plaidTransactionId)
        )

        const transactionsAfterDeleteFilter = addedData.filter(
          (txn) => !deletedIds.has(txn.plaidTransactionId)
        )

        // --- Merge logic: match Plaid transactions against manual entries ---
        let transactionsToInsert = transactionsAfterDeleteFilter
        if (transactionsAfterDeleteFilter.length > 0) {
          const relevantAccountIds = [...new Set(transactionsAfterDeleteFilter.map((t) => t.accountId))]

          // Compute date window: min/max Plaid dates ± 3 days
          const plaidDates = transactionsAfterDeleteFilter.map((t) => t.date.getTime())
          const DAY_MS = 86_400_000
          const dateMin = new Date(Math.min(...plaidDates) - 3 * DAY_MS)
          const dateMax = new Date(Math.max(...plaidDates) + 3 * DAY_MS)

          // Single batch query for all manual candidates
          const manualCandidates = await tx.bankTransaction.findMany({
            where: {
              accountId: { in: relevantAccountIds },
              userId,
              plaidTransactionId: null,
              date: { gte: dateMin, lte: dateMax },
            },
            select: {
              id: true,
              date: true,
              amount: true,
              type: true,
              accountId: true,
              createdAt: true,
            },
          })

          if (manualCandidates.length > 0) {
            // Build lookup: "accountId|amount|type" -> candidates[]
            const candidateMap = new Map<string, typeof manualCandidates>()
            for (const c of manualCandidates) {
              const key = `${c.accountId}|${Number(c.amount)}|${c.type}`
              const existing = candidateMap.get(key)
              if (existing) {
                existing.push(c)
              } else {
                candidateMap.set(key, [c])
              }
            }

            const matchedManualIds = new Set<number>()
            const mergeUpdates: { manualTxnId: number; plaidTxn: typeof transactionsAfterDeleteFilter[number] }[] = []
            const unmatched: typeof transactionsAfterDeleteFilter = []

            for (const plaidTxn of transactionsAfterDeleteFilter) {
              const key = `${plaidTxn.accountId}|${plaidTxn.amount}|${plaidTxn.type}`
              const candidates = candidateMap.get(key)

              if (candidates) {
                // Find best match: within ±3 days, closest date, earliest createdAt
                let bestMatch: typeof manualCandidates[number] | null = null
                let bestDayDiff = Infinity

                for (const c of candidates) {
                  if (matchedManualIds.has(c.id)) continue
                  const dayDiff = Math.abs(plaidTxn.date.getTime() - c.date.getTime()) / DAY_MS
                  if (dayDiff <= 3 && (dayDiff < bestDayDiff || (dayDiff === bestDayDiff && bestMatch && c.createdAt < bestMatch.createdAt))) {
                    bestMatch = c
                    bestDayDiff = dayDiff
                  }
                }

                if (bestMatch) {
                  matchedManualIds.add(bestMatch.id)
                  mergeUpdates.push({ manualTxnId: bestMatch.id, plaidTxn })
                } else {
                  unmatched.push(plaidTxn)
                }
              } else {
                unmatched.push(plaidTxn)
              }
            }

            // Execute merge updates (preserve notes, categoryId, serviceLogId, attachments)
            if (mergeUpdates.length > 0) {
              await Promise.all(
                mergeUpdates.map(({ manualTxnId, plaidTxn }) =>
                  tx.bankTransaction.update({
                    where: { id: manualTxnId },
                    data: {
                      plaidTransactionId: plaidTxn.plaidTransactionId,
                      rawPlaidData: plaidTxn.rawPlaidData,
                      plaidStatus: plaidTxn.plaidStatus,
                      isPending: plaidTxn.isPending,
                      description: plaidTxn.description,
                      merchantName: plaidTxn.merchantName,
                      date: plaidTxn.date,
                      statementMonth: plaidTxn.statementMonth,
                      statementYear: plaidTxn.statementYear,
                    },
                  })
                )
              )
              mergedCount = mergeUpdates.length
              console.log(`[Sync] Merged ${mergedCount} Plaid transactions with existing manual entries`)
            }

            transactionsToInsert = unmatched
          }
        }

        // Insert remaining (unmatched) Plaid transactions
        if (transactionsToInsert.length > 0) {
          const inserted = await tx.bankTransaction.createMany({
            data: transactionsToInsert,
            skipDuplicates: true,
          })
          addedCount = inserted.count
          addedPlaidIds = transactionsToInsert.map((t) => t.plaidTransactionId)
        }

        console.log(`[Sync] Prepared ${addedData.length} → filtered ${addedData.length - transactionsAfterDeleteFilter.length} deleted → merged ${mergedCount} → inserted ${addedCount}`)
      }

      // Process modified transactions — skip if user deleted
      if (modified.length > 0) {
        const modifiedPlaidIds = modified
          .map((txn) => txn.transaction_id)
          .filter((id): id is string => !!id)

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
      const balanceUpdates = plaidItem.bankAccounts
        .filter((ba) => ba.plaidAccountId && plaidBalances.has(ba.plaidAccountId))
        .map((ba) => {
          const rawBal = plaidBalances.get(ba.plaidAccountId!) ?? null
          const currentBalance =
            rawBal !== null && ba.type === "CREDIT" ? -Math.abs(rawBal) : rawBal
          return tx.bankAccount.update({
            where: { id: ba.id },
            data: { currentBalance },
          })
        })
      await Promise.all(balanceUpdates)
    }, { timeout: 15000 })

    // Apply categorization rules to newly added uncategorized transactions
    if (addedCount > 0) {
      await applyCategorizationRules(userId, addedPlaidIds)
    }

    return {
      added: addedCount,
      modified: modifiedCount,
      removed: removedCount,
      merged: mergedCount,
      refreshFailed,
      plaidReturned: { added: added.length, modified: modified.length, removed: removed.length },
      hadCursor: !!plaidItem.cursor,
    }
  } catch (error) {
    // Re-throw PlaidSyncErrors as-is
    if (error instanceof PlaidSyncError) throw error

    const plaidError = (error as { response?: { data?: unknown } })?.response?.data
    const plaidErrorCode = (plaidError as { error_code?: string })?.error_code
    const plaidMsg = (plaidError as { error_message?: string })?.error_message

    // Error codes that require reconnection
    const reconnectRequired = [
      "ITEM_LOGIN_REQUIRED",
      "INVALID_CREDENTIALS",
      "INVALID_UPDATED_USERNAME",
      "INVALID_MFA",
      "ITEM_NOT_SUPPORTED",
    ]

    if (plaidItemId && plaidErrorCode && reconnectRequired.includes(plaidErrorCode)) {
      await prisma.plaidItem.update({
        where: { id: plaidItemId },
        data: {
          status: "LOGIN_REQUIRED",
          lastError: plaidMsg || "Login required — please reconnect your bank.",
        },
      })
      throw new PlaidSyncError("LOGIN_REQUIRED", "Login required", plaidMsg)
    }

    if (plaidItemId && plaidErrorCode) {
      await prisma.plaidItem.update({
        where: { id: plaidItemId },
        data: {
          status: "ERROR",
          lastError: plaidMsg || "An error occurred during sync.",
        },
      })
    }

    console.error("Failed to sync Plaid transactions:", plaidError || error)
    const message = plaidMsg || (error instanceof Error ? error.message : "Failed to sync transactions")
    throw new PlaidSyncError("PLAID_ERROR", message, plaidMsg)
  } finally {
    activeSyncs.delete(plaidItemId)
  }
}

// ---------------------------------------------------------------------------
// Auto-categorization helper
// ---------------------------------------------------------------------------

async function applyCategorizationRules(userId: string, plaidTransactionIds: string[]) {
  if (plaidTransactionIds.length === 0) return

  const [rules, transactions] = await Promise.all([
    prisma.categorizationRule.findMany({ where: { userId } }),
    prisma.bankTransaction.findMany({
      where: { plaidTransactionId: { in: plaidTransactionIds }, categoryId: null },
      select: { id: true, description: true, merchantName: true },
    }),
  ])

  if (rules.length === 0 || transactions.length === 0) return

  const compiledRules = rules.map((rule) => ({
    regex: new RegExp(rule.pattern, "i"),
    categoryId: rule.categoryId,
  }))

  const categoryBatches = new Map<number, number[]>()

  for (const txn of transactions) {
    for (const rule of compiledRules) {
      if (
        rule.regex.test(txn.description) ||
        (txn.merchantName && rule.regex.test(txn.merchantName))
      ) {
        const batch = categoryBatches.get(rule.categoryId)
        if (batch) {
          batch.push(txn.id)
        } else {
          categoryBatches.set(rule.categoryId, [txn.id])
        }
        break
      }
    }
  }

  await Promise.all(
    Array.from(categoryBatches.entries()).map(([categoryId, ids]) =>
      prisma.bankTransaction.updateMany({
        where: { id: { in: ids } },
        data: { categoryId },
      })
    )
  )
}
