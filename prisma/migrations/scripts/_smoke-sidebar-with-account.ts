import "dotenv/config"
import { PrismaClient } from "../../../src/generated/prisma"

const prisma = new PrismaClient({ accelerateUrl: process.env.DATABASE_URL })

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true } })
  if (!user) return

  const acct = await prisma.bankAccount.findFirst({
    where: { userId: user.id, name: { contains: "Acceso" } },
    select: { id: true, name: true },
  })
  console.log("account:", acct)

  const accountFilter = acct?.id ?? null

  const rows = await prisma.$queryRaw<
    {
      year: number
      month: string
      total: bigint
      categorized: bigint
      income: number | null
      businessExpenses: number | null
    }[]
  >`
    SELECT
      EXTRACT(YEAR FROM date)::int AS year,
      TO_CHAR(date, 'YYYY-MM') AS month,
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "taxType" IS NOT NULL)::bigint AS categorized,
      COALESCE(SUM(amount) FILTER (WHERE type = 'INFLOW'), 0)::float AS income,
      COALESCE(
        SUM(amount) FILTER (WHERE type = 'OUTFLOW' AND "taxType" = 'business'),
        0
      )::float AS "businessExpenses"
    FROM "BankTransaction"
    WHERE "userId" = ${user.id}
      AND (${accountFilter}::int IS NULL OR "accountId" = ${accountFilter}::int)
    GROUP BY EXTRACT(YEAR FROM date), TO_CHAR(date, 'YYYY-MM')
    ORDER BY year DESC, month ASC
  `

  console.log(`Got ${rows.length} rows for account ${accountFilter}`)
  for (const r of rows.slice(0, 3)) {
    console.log(`  ${r.month}: total=${r.total} categorized=${r.categorized}`)
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("ERROR:", e)
  process.exit(1)
})
