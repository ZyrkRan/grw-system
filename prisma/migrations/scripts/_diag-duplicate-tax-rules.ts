import "dotenv/config"
import { PrismaClient } from "../../../src/generated/prisma"

const prisma = new PrismaClient({ accelerateUrl: process.env.DATABASE_URL })

async function main() {
  const dupes = await prisma.$queryRaw<
    { userId: string; pattern: string; count: bigint }[]
  >`
    SELECT "userId", pattern, COUNT(*) AS count
    FROM "TaxCategoryRule"
    GROUP BY "userId", pattern
    HAVING COUNT(*) > 1
  `

  if (dupes.length === 0) {
    console.log("No duplicate patterns in TaxCategoryRule")
    await prisma.$disconnect()
    return
  }

  console.log(`Found ${dupes.length} duplicate pattern groups in TaxCategoryRule:`)
  for (const d of dupes) {
    console.log(`\n  pattern: "${d.pattern}" (count=${d.count})`)
    const rows = await prisma.taxCategoryRule.findMany({
      where: { userId: d.userId, pattern: d.pattern },
      include: { category: { select: { id: true, name: true, slug: true } } },
    })
    for (const r of rows) {
      console.log(
        `    id=${r.id} categoryId=${r.categoryId ?? "null"} (${r.category?.name ?? "—"}) taxType=${r.taxType} applyCount=${r.applyCount}`
      )
    }
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
