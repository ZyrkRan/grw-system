import "dotenv/config"
import { PrismaClient } from "../../../src/generated/prisma"

const prisma = new PrismaClient({ accelerateUrl: process.env.DATABASE_URL })

async function main() {
  const [
    taxTxnCount,
    taxRuleCount,
    bankTxnCount,
    reviewedCount,
    taxTypeBuckets,
    rules,
    landingAcct,
    landingAcctTxnCount,
  ] = await Promise.all([
    prisma.taxTransaction.count(),
    prisma.taxCategoryRule.count(),
    prisma.bankTransaction.count(),
    prisma.bankTransaction.count({ where: { isReviewed: true } }),
    prisma.$queryRaw<{ taxType: string | null; count: bigint }[]>`
      SELECT "taxType", COUNT(*) AS count FROM "BankTransaction"
      GROUP BY "taxType" ORDER BY count DESC
    `,
    prisma.categorizationRule.count(),
    prisma.bankAccount.findFirst({ where: { name: "Imported (Historical)" } }),
    prisma.bankTransaction.count({
      where: { account: { name: "Imported (Historical)" } },
    }),
  ])

  console.log("=== Phase 1 verification ===\n")
  console.log("Source (archive, should be unchanged):")
  console.log(`  TaxTransaction rows:       ${taxTxnCount}`)
  console.log(`  TaxCategoryRule rows:      ${taxRuleCount}`)
  console.log("\nDestination:")
  console.log(`  BankTransaction total:     ${bankTxnCount}`)
  console.log(`  BankTransaction reviewed:  ${reviewedCount}`)
  console.log(`  CategorizationRule rows:   ${rules}`)
  console.log(`\nSynthetic landing account: id=${landingAcct?.id ?? "—"}`)
  console.log(`  rows on landing account: ${landingAcctTxnCount}`)
  console.log("\nBankTransaction.taxType distribution:")
  for (const b of taxTypeBuckets) {
    console.log(`  ${b.taxType ?? "(null)"}: ${b.count}`)
  }

  console.log("\nExpected (based on earlier runs):")
  console.log(`  - TaxTransaction should still be 1738 (never touched)`)
  console.log(`  - TaxCategoryRule should still be 180 (never touched)`)
  console.log(`  - CategorizationRule should be 180 (all tax rules migrated, PURCHASE ATHM TEXACO twice)`)
  console.log(`  - Landing account should have 1738 BankTransactions`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
