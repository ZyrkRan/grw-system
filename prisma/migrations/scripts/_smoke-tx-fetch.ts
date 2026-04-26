import "dotenv/config"
import { PrismaClient } from "../../../src/generated/prisma"

const prisma = new PrismaClient({ accelerateUrl: process.env.DATABASE_URL })

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true } })
  if (!user) return
  const userId = user.id

  // Pick most recent month that has data
  const recent = await prisma.$queryRaw<{ month: string }[]>`
    SELECT TO_CHAR(date, 'YYYY-MM') AS month
    FROM "BankTransaction"
    WHERE "userId" = ${userId}
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT 5
  `
  console.log("Recent months with data:", recent)

  // Try the exact same WHERE clause /finances-v2 would build for a month
  const testMonth = recent[0]?.month
  if (!testMonth) return
  const [yr, mo] = testMonth.split("-").map(Number)
  const start = new Date(yr, mo - 1, 1)
  const end = new Date(yr, mo, 1)
  const rows = await prisma.bankTransaction.findMany({
    where: { userId, date: { gte: start, lt: end } },
    orderBy: { date: "asc" },
    take: 3,
    include: {
      account: { select: { id: true, name: true } },
      category: {
        select: {
          id: true,
          name: true,
          color: true,
          attachmentPrompt: true,
          parentId: true,
          parent: { select: { id: true, name: true, isSystemGroup: true } },
        },
      },
      serviceLog: { select: { id: true, serviceName: true } },
      _count: { select: { attachments: true } },
    },
  })
  const total = await prisma.bankTransaction.count({
    where: { userId, date: { gte: start, lt: end } },
  })
  console.log(`\nMonth ${testMonth}: total=${total}, first 3 sample:`)
  for (const r of rows) {
    console.log(
      `  id=${r.id} date=${r.date.toISOString().slice(0, 10)} desc="${r.description.slice(0, 40)}" amount=${r.amount} taxType=${r.taxType} isReviewed=${r.isReviewed} categoryId=${r.categoryId} account=${r.account?.name}`
    )
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
