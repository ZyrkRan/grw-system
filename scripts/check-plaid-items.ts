/**
 * Quick diagnostic script — prints all PlaidItems and their BankAccounts.
 *
 * Usage: npx tsx scripts/check-plaid-items.ts
 */

import { PrismaClient } from "../src/generated/prisma"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env" })

const prisma = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL,
})

function truncate(value: string | null | undefined, max: number): string {
  if (!value) return "(null)"
  return value.length > max ? value.slice(0, max) + "..." : value
}

async function main() {
  const plaidItems = await prisma.plaidItem.findMany({
    include: { bankAccounts: true },
  })

  if (plaidItems.length === 0) {
    console.log("No PlaidItems found.")
    return
  }

  console.log(`Found ${plaidItems.length} PlaidItem(s)\n`)

  for (const item of plaidItems) {
    console.log("─".repeat(60))
    console.log(`PlaidItem #${item.id}`)
    console.log(`  itemId:             ${item.itemId}`)
    console.log(`  institutionName:    ${item.institutionName ?? "(null)"}`)
    console.log(`  status:             ${item.status}`)
    console.log(`  lastError:          ${item.lastError ?? "(none)"}`)
    console.log(`  lastSuccessfulSync: ${item.lastSuccessfulSync?.toISOString() ?? "(never)"}`)
    console.log(`  cursor:             ${truncate(item.cursor, 20)}`)

    if (item.bankAccounts.length === 0) {
      console.log("  bankAccounts:       (none)")
    } else {
      console.log(`  bankAccounts (${item.bankAccounts.length}):`)
      for (const ba of item.bankAccounts) {
        console.log(`    ├─ #${ba.id} | ${ba.name} | type=${ba.type} | mask=${ba.mask ?? "?"} | plaidAccountId=${ba.plaidAccountId ?? "(null)"} | balance=$${ba.currentBalance?.toString() ?? "N/A"}`)
      }
    }
    console.log()
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
