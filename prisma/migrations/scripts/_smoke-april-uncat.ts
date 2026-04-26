import "dotenv/config"
import { PrismaClient } from "../../../src/generated/prisma"

const prisma = new PrismaClient({ accelerateUrl: process.env.DATABASE_URL })

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true } })
  if (!user) return
  const userId = user.id

  // All accounts and how many txns each holds
  const accts = await prisma.$queryRaw<
    { id: number; name: string; cnt: bigint }[]
  >`
    SELECT ba.id, ba.name, COUNT(bt.id)::bigint AS cnt
    FROM "BankAccount" ba
    LEFT JOIN "BankTransaction" bt ON bt."accountId" = ba.id
    WHERE ba."userId" = ${userId}
    GROUP BY ba.id, ba.name
    ORDER BY cnt DESC
  `
  console.log("Accounts:")
  for (const a of accts) console.log(`  id=${a.id} ${a.name}: ${a.cnt} txns`)
  console.log()

  // Per-account, per-month breakdown of uncategorized (taxType IS NULL)
  const breakdown = await prisma.$queryRaw<
    { name: string; month: string; cnt: bigint }[]
  >`
    SELECT ba.name, TO_CHAR(bt.date, 'YYYY-MM') AS month, COUNT(*)::bigint AS cnt
    FROM "BankTransaction" bt
    JOIN "BankAccount" ba ON ba.id = bt."accountId"
    WHERE bt."userId" = ${userId} AND bt."taxType" IS NULL
    GROUP BY ba.name, 2
    ORDER BY ba.name, month
  `
  console.log("Uncategorized (taxType NULL) by account/month:")
  for (const r of breakdown) console.log(`  ${r.name} | ${r.month}: ${r.cnt}`)
  console.log()

  const start = new Date(2026, 3, 1)
  const end = new Date(2026, 4, 1)

  const all = await prisma.bankTransaction.count({
    where: { userId, date: { gte: start, lt: end } },
  })
  const taxTypeNull = await prisma.bankTransaction.count({
    where: { userId, date: { gte: start, lt: end }, taxType: null },
  })
  const categoryIdNull = await prisma.bankTransaction.count({
    where: { userId, date: { gte: start, lt: end }, categoryId: null },
  })
  const both = await prisma.bankTransaction.count({
    where: { userId, date: { gte: start, lt: end }, taxType: null, categoryId: null },
  })

  console.log("April 2026 (all accounts):")
  console.log(`  total:                ${all}`)
  console.log(`  taxType IS NULL:      ${taxTypeNull}`)
  console.log(`  categoryId IS NULL:   ${categoryIdNull}`)
  console.log(`  both NULL:            ${both}`)
  console.log(`  has cat but no tax:   ${taxTypeNull - both}`)
  console.log(`  has tax but no cat:   ${categoryIdNull - both}`)

  // Per-account breakdown for April taxType-null rows
  const byAccount = await prisma.$queryRaw<
    { accountId: number; name: string; cnt: bigint }[]
  >`
    SELECT bt."accountId", ba.name, COUNT(*)::bigint AS cnt
    FROM "BankTransaction" bt
    JOIN "BankAccount" ba ON ba.id = bt."accountId"
    WHERE bt."userId" = ${userId}
      AND bt.date >= ${start} AND bt.date < ${end}
      AND bt."taxType" IS NULL
    GROUP BY bt."accountId", ba.name
    ORDER BY cnt DESC
  `
  console.log("\nApril taxType-null by account:")
  for (const r of byAccount) {
    console.log(`  ${r.name} (id=${r.accountId}): ${r.cnt}`)
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
