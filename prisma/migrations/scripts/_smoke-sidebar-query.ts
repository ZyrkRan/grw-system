import "dotenv/config"
import { PrismaClient } from "../../../src/generated/prisma"

const prisma = new PrismaClient({ accelerateUrl: process.env.DATABASE_URL })

async function main() {
  // Pick the single user — we're in single-user mode
  const user = await prisma.user.findFirst({ select: { id: true } })
  if (!user) {
    console.log("No user found")
    return
  }

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
      AND (${null}::int IS NULL OR "accountId" = ${null}::int)
    GROUP BY EXTRACT(YEAR FROM date), TO_CHAR(date, 'YYYY-MM')
    ORDER BY year DESC, month ASC
  `

  console.log(`Got ${rows.length} rows`)
  for (const r of rows.slice(0, 6)) {
    console.log(
      `  ${r.month}: total=${r.total} categorized=${r.categorized} income=${r.income?.toFixed(2)} bizExp=${r.businessExpenses?.toFixed(2)}`
    )
  }
  if (rows.length > 6) console.log(`  ... (${rows.length - 6} more)`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
