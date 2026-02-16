/**
 * Manual Plaid sync script — forces refresh + sync for all linked accounts.
 *
 * Usage: npx tsx scripts/plaid-sync-all.ts
 *
 * 1. Calls transactionsRefresh on each PlaidItem (tells Plaid to pull fresh data from the bank)
 * 2. Waits 5 seconds for Plaid to process
 * 3. Runs transactionsSync to pull the latest transactions into the database
 *
 * Uses batched inserts (no wrapping transaction) to avoid Prisma Accelerate 15s timeout.
 */

import { Configuration, PlaidApi, PlaidEnvironments } from "plaid"
import { PrismaClient, TransactionType } from "../src/generated/prisma"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env" })

const prisma = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL,
})

const plaidClient = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || "sandbox"],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!,
        "PLAID-SECRET": process.env.PLAID_SECRET!,
      },
    },
  })
)

const BATCH_SIZE = 50

async function main() {
  const plaidItems = await prisma.plaidItem.findMany({
    include: { bankAccounts: true },
  })

  if (plaidItems.length === 0) {
    console.log("No Plaid items found.")
    return
  }

  console.log(`Found ${plaidItems.length} Plaid item(s)\n`)

  // Step 1: Force refresh on all items
  console.log("=== Step 1: Requesting fresh data from banks ===\n")
  for (const item of plaidItems) {
    const label = `${item.institutionName || item.itemId} (${item.id})`
    try {
      await plaidClient.transactionsRefresh({
        access_token: item.accessToken,
      })
      console.log(`  [OK] ${label} — refresh requested`)
    } catch (err: any) {
      const plaidErr = err?.response?.data
      console.error(`  [ERR] ${label} — ${plaidErr?.error_message || err.message}`)
      if (plaidErr?.error_code) console.error(`         Code: ${plaidErr.error_code}`)
    }
  }

  // Step 2: Wait for Plaid to process
  console.log("\nWaiting 5 seconds for Plaid to process refreshes...\n")
  await new Promise((r) => setTimeout(r, 5000))

  // Step 3: Sync each item
  console.log("=== Step 2: Syncing transactions ===\n")
  for (const item of plaidItems) {
    const label = `${item.institutionName || item.itemId} (${item.id})`

    try {
      // Build account map
      const accountMap = new Map<string, number>()
      for (const ba of item.bankAccounts) {
        if (ba.plaidAccountId) {
          accountMap.set(ba.plaidAccountId, ba.id)
        }
      }

      // Fetch transactions
      let cursor = item.cursor || undefined
      let added: any[] = []
      let modified: any[] = []
      let removed: any[] = []
      let hasMore = true

      while (hasMore) {
        const response = await plaidClient.transactionsSync({
          access_token: item.accessToken,
          cursor,
        })
        added = added.concat(response.data.added)
        modified = modified.concat(response.data.modified)
        removed = removed.concat(response.data.removed)
        hasMore = response.data.has_more
        cursor = response.data.next_cursor
      }

      // Fetch balances
      const balanceResponse = await plaidClient.accountsBalanceGet({
        access_token: item.accessToken,
      })
      const plaidBalances = new Map<string, number | null>()
      for (const acct of balanceResponse.data.accounts) {
        plaidBalances.set(acct.account_id, acct.balances.current)
      }

      console.log(`  ${label}:`)
      console.log(`    Plaid returned: +${added.length} added, ~${modified.length} modified, -${removed.length} removed`)

      let addedCount = 0
      let modifiedCount = 0
      let removedCount = 0

      // --- Process ADDED transactions in batches (no wrapping tx) ---
      if (added.length > 0) {
        const addedData = added
          .filter((txn: any) => accountMap.has(txn.account_id))
          .map((txn: any) => {
            const date = new Date(txn.date)
            return {
              plaidTransactionId: txn.transaction_id,
              date,
              description: txn.name || txn.merchant_name || "Unknown",
              amount: Math.abs(txn.amount),
              type: (txn.amount < 0 ? "INFLOW" : "OUTFLOW") as TransactionType,
              accountId: accountMap.get(txn.account_id)!,
              userId: item.userId,
              statementMonth: date.getMonth() + 1,
              statementYear: date.getFullYear(),
              isPending: txn.pending,
              merchantName: txn.merchant_name || null,
              plaidStatus: txn.pending ? "pending" : "posted",
              rawPlaidData: JSON.parse(JSON.stringify(txn)),
            }
          })

        // Filter out user-deleted transactions
        const plaidIds = addedData.map((t) => t.plaidTransactionId).filter(Boolean)
        const deletedRecords = await prisma.deletedPlaidTransaction.findMany({
          where: { userId: item.userId, plaidTransactionId: { in: plaidIds } },
          select: { plaidTransactionId: true },
        })
        const deletedIds = new Set(deletedRecords.map((r) => r.plaidTransactionId))
        const toInsert = addedData.filter((t) => !deletedIds.has(t.plaidTransactionId))

        // Insert in batches
        for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
          const batch = toInsert.slice(i, i + BATCH_SIZE)
          const result = await prisma.bankTransaction.createMany({
            data: batch,
            skipDuplicates: true,
          })
          addedCount += result.count
          console.log(`    Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}: ${result.count} of ${batch.length}`)
        }
      }

      // --- Process MODIFIED transactions ---
      if (modified.length > 0) {
        const modPlaidIds = modified.map((t: any) => t.transaction_id).filter(Boolean)
        const deletedMod = await prisma.deletedPlaidTransaction.findMany({
          where: { userId: item.userId, plaidTransactionId: { in: modPlaidIds } },
          select: { plaidTransactionId: true },
        })
        const deletedModIds = new Set(deletedMod.map((r) => r.plaidTransactionId))

        for (const txn of modified) {
          if (deletedModIds.has(txn.transaction_id)) continue
          const date = new Date(txn.date)
          try {
            await prisma.bankTransaction.update({
              where: { plaidTransactionId: txn.transaction_id },
              data: {
                date,
                description: txn.name || txn.merchant_name || "Unknown",
                amount: Math.abs(txn.amount),
                type: txn.amount < 0 ? "INFLOW" : "OUTFLOW",
                statementMonth: date.getMonth() + 1,
                statementYear: date.getFullYear(),
                isPending: txn.pending,
                merchantName: txn.merchant_name || null,
                plaidStatus: txn.pending ? "pending" : "posted",
                rawPlaidData: JSON.parse(JSON.stringify(txn)),
              },
            })
            modifiedCount++
          } catch {
            // Transaction doesn't exist locally, skip
          }
        }
      }

      // --- Process REMOVED transactions ---
      const removedIds = removed.map((t: any) => t.transaction_id).filter(Boolean)
      if (removedIds.length > 0) {
        const result = await prisma.bankTransaction.deleteMany({
          where: { plaidTransactionId: { in: removedIds } },
        })
        removedCount = result.count
      }

      // --- Update cursor + timestamps ---
      const now = new Date()
      await prisma.plaidItem.update({
        where: { id: item.id },
        data: { cursor, lastSuccessfulSync: now },
      })

      const bankAccountIds = Array.from(accountMap.values())
      if (bankAccountIds.length > 0) {
        await prisma.bankAccount.updateMany({
          where: { id: { in: bankAccountIds } },
          data: { lastSyncedAt: now },
        })
      }

      // --- Update balances ---
      for (const ba of item.bankAccounts) {
        if (ba.plaidAccountId && plaidBalances.has(ba.plaidAccountId)) {
          const rawBal = plaidBalances.get(ba.plaidAccountId!) ?? null
          const currentBalance =
            rawBal !== null && ba.type === "CREDIT" ? -Math.abs(rawBal) : rawBal
          await prisma.bankAccount.update({
            where: { id: ba.id },
            data: { currentBalance },
          })
        }
      }

      console.log(`    DB result:    +${addedCount} inserted, ~${modifiedCount} updated, -${removedCount} deleted`)

      // Print updated balances
      for (const ba of item.bankAccounts) {
        if (ba.plaidAccountId && plaidBalances.has(ba.plaidAccountId)) {
          const bal = plaidBalances.get(ba.plaidAccountId!)
          const display = ba.type === "CREDIT" && bal !== null && bal !== undefined ? -Math.abs(bal) : bal
          console.log(`    Balance: ${ba.name} (${ba.mask || "?"}) → $${display?.toFixed(2) ?? "N/A"}`)
        }
      }
      console.log()
    } catch (err: any) {
      const plaidErr = err?.response?.data
      console.error(`  [ERR] ${label}`)
      console.error(`    ${plaidErr?.error_message || err.message}`)
      if (plaidErr?.error_code) console.error(`    Code: ${plaidErr.error_code}`)
      console.log()
    }
  }

  console.log("Done!")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
