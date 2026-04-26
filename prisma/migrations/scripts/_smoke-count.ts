import "dotenv/config"
import { PrismaClient } from "../../../src/generated/prisma"

const prisma = new PrismaClient({ accelerateUrl: process.env.DATABASE_URL })

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true } })
  if (!user) return
  const userId = user.id
  const accountFilter = 25

  console.log("Test 1: count with type+taxType+accountId")
  try {
    const c1 = await prisma.bankTransaction.count({
      where: {
        userId,
        type: "OUTFLOW",
        taxType: "service_income",
        accountId: accountFilter,
      },
    })
    console.log("  ✓ count =", c1)
  } catch (e) {
    console.log("  ✗", e instanceof Error ? e.message : e)
  }

  console.log("\nTest 2: count with taxType: null")
  try {
    const c2 = await prisma.bankTransaction.count({
      where: {
        userId,
        type: "INFLOW",
        taxType: null,
        accountId: accountFilter,
      },
    })
    console.log("  ✓ count =", c2)
  } catch (e) {
    console.log("  ✗", e instanceof Error ? e.message : e)
  }

  console.log("\nTest 3: count with no accountFilter spread")
  try {
    const c3 = await prisma.bankTransaction.count({
      where: {
        userId,
        type: "OUTFLOW",
        taxType: "service_income",
      },
    })
    console.log("  ✓ count =", c3)
  } catch (e) {
    console.log("  ✗", e instanceof Error ? e.message : e)
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("OUTER:", e)
  process.exit(1)
})
