import "dotenv/config"
import { PrismaClient } from "../../../src/generated/prisma"
import { aggregateAnnualReport } from "../../../src/lib/finances-report-aggregator"

const prisma = new PrismaClient({ accelerateUrl: process.env.DATABASE_URL })

async function runYear(userId: string, year: number, accountId: number | null) {
  const start = new Date(year, 0, 1)
  const end = new Date(year + 1, 0, 1)
  const txns = await prisma.bankTransaction.findMany({
    where: {
      userId,
      date: { gte: start, lt: end },
      ...(accountId ? { accountId } : {}),
    },
    include: { category: { select: { name: true } } },
    orderBy: { date: "asc" },
  })

  const report = aggregateAnnualReport(txns)
  const flagReasons = report.flagged.reduce<Record<string, number>>((acc, f) => {
    acc[f.reason] = (acc[f.reason] || 0) + 1
    return acc
  }, {})

  const label = accountId === null ? "all accounts" : `account=${accountId}`
  console.log(`\n=== ${year} (${label}) ===`)
  console.log(`  txns scanned:           ${txns.length}`)
  console.log(`  totals.uncategorized:   ${report.totals.uncategorizedCount}`)
  console.log(`  flagged.length:         ${report.flagged.length}`)
  console.log(`  flag reasons:           ${JSON.stringify(flagReasons)}`)

  // Invariants for option (a):
  //  - flagged.length === uncategorizedCount
  //  - every flag reason is "Uncategorized"
  //  - no slice(0, 50) cap
  const ok = {
    countMatches: report.flagged.length === report.totals.uncategorizedCount,
    onlyUncategorized: Object.keys(flagReasons).every((r) => r === "Uncategorized"),
    notCappedAt50: report.flagged.length !== 50 || report.totals.uncategorizedCount === 50,
  }
  console.log(`  ✔ count matches:        ${ok.countMatches}`)
  console.log(`  ✔ only Uncategorized:   ${ok.onlyUncategorized}`)
  console.log(`  ✔ not capped at 50:     ${ok.notCappedAt50}`)
}

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true } })
  if (!user) {
    console.log("No user found.")
    return
  }
  const userId = user.id

  // Years that have any transactions
  const years = await prisma.$queryRaw<{ y: number }[]>`
    SELECT DISTINCT EXTRACT(YEAR FROM date)::int AS y
    FROM "BankTransaction"
    WHERE "userId" = ${userId}
    ORDER BY y DESC
  `
  console.log(`Years with txns: ${years.map((r) => r.y).join(", ")}`)

  for (const { y } of years) {
    await runYear(userId, y, null)
  }

  // PayPal-only spot check (id=31 per SESSION.md)
  await runYear(userId, 2026, 31)
  await runYear(userId, 2025, 31)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
