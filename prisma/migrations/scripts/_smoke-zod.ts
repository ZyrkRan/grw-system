import "dotenv/config"
import { transactionQuerySchema, searchParamsToObject } from "../../../src/lib/validations/finances"

const tests = [
  "status=all&direction=all&page=1&pageSize=50&monthKey=2026-03",
  "status=all&direction=all&page=1&pageSize=50&monthKey=2026-03&accountId=1",
  "status=uncategorized&direction=inflow&page=1&pageSize=50&monthKey=2026-03",
  "status=all&direction=all&search=walmart&page=1&pageSize=50",
  "status=mismatched&direction=all&page=1&pageSize=50",
]

for (const qs of tests) {
  const params = new URLSearchParams(qs)
  const obj = searchParamsToObject(params)
  const parsed = transactionQuerySchema.safeParse(obj)
  console.log(`\n[${qs}]`)
  if (parsed.success) {
    console.log("  ✓ parsed:", JSON.stringify(parsed.data))
  } else {
    console.log("  ✗ error:", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "))
  }
}
