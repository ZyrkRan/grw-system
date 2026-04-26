import "dotenv/config"
import { PrismaClient } from "../../../src/generated/prisma"

async function main() {
  const prisma = new PrismaClient({ accelerateUrl: process.env.DATABASE_URL })
  const dupes = await prisma.$queryRaw<
    { userId: string; pattern: string; count: bigint }[]
  >`
    SELECT "userId", pattern, COUNT(*) AS count
    FROM "CategorizationRule"
    GROUP BY "userId", pattern
    HAVING COUNT(*) > 1
    ORDER BY count DESC
  `
  if (dupes.length === 0) {
    console.log("✓ No duplicate (userId, pattern) pairs in CategorizationRule")
  } else {
    console.log(`✗ Found ${dupes.length} duplicate groups:`)
    for (const d of dupes) {
      console.log(`  user=${d.userId} pattern="${d.pattern}" count=${d.count}`)
    }
  }
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
