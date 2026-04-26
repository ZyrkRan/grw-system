import "dotenv/config"
import { PrismaClient } from "../../../src/generated/prisma"

const prisma = new PrismaClient({ accelerateUrl: process.env.DATABASE_URL })

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true } })
  if (!user) return
  const userId = user.id

  const [taxRuleCount, catRuleCount] = await Promise.all([
    prisma.taxCategoryRule.count({ where: { userId } }),
    prisma.categorizationRule.count({ where: { userId } }),
  ])

  console.log(`TaxCategoryRule (legacy):    ${taxRuleCount}`)
  console.log(`CategorizationRule (active): ${catRuleCount}`)

  // Pattern-only overlap check
  const taxRules = await prisma.taxCategoryRule.findMany({
    where: { userId },
    select: { pattern: true, categoryId: true, taxType: true, applyCount: true },
  })
  const catRules = await prisma.categorizationRule.findMany({
    where: { userId },
    select: { pattern: true, categoryId: true, taxType: true, applyCount: true },
  })

  const key = (p: string, c: number | null, t: string | null) =>
    `${p}|${c ?? "null"}|${t ?? ""}`
  const catKeys = new Set(catRules.map((r) => key(r.pattern, r.categoryId, r.taxType)))

  const missingFromCat = taxRules.filter((r) => !catKeys.has(key(r.pattern, r.categoryId, r.taxType)))
  console.log(`\nLegacy rules NOT present in CategorizationRule (exact key): ${missingFromCat.length}`)
  if (missingFromCat.length > 0) {
    console.log("First 5:")
    for (const r of missingFromCat.slice(0, 5)) {
      console.log(`  pattern="${r.pattern}" categoryId=${r.categoryId} taxType=${r.taxType ?? "null"} applyCount=${r.applyCount}`)
    }
  }

  // applyCount > 0 distribution in active rules (proves they're being fired)
  const fired = catRules.filter((r) => r.applyCount > 0)
  console.log(`\nActive CategorizationRule rows with applyCount > 0: ${fired.length}/${catRules.length}`)

  // Distribution of taxType in active rules
  const byTaxType = catRules.reduce<Record<string, number>>((acc, r) => {
    const k = r.taxType ?? "null"
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {})
  console.log(`\nActive rules by taxType: ${JSON.stringify(byTaxType)}`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
