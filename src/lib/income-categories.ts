import { prisma } from "@/lib/prisma"
import { ensureSystemGroups } from "@/lib/system-categories"

export const INCOME_GROUP_SLUGS = {
  business: "business-income",
  personal: "personal-income",
} as const

const INCOME_GROUP_DEFS = [
  { parentSlug: "business", slug: INCOME_GROUP_SLUGS.business, name: "Income", color: "#10b981", position: 0 },
  { parentSlug: "personal", slug: INCOME_GROUP_SLUGS.personal, name: "Income", color: "#10b981", position: 0 },
] as const

/**
 * Ensures the `Income` subgroups exist under the Business and Personal system
 * groups. Idempotent — creates only what's missing.
 */
export async function ensureIncomeGroups(userId: string) {
  const systemGroups = await ensureSystemGroups(userId)
  const bySlug = new Map(systemGroups.map((g) => [g.slug, g]))

  const existing = await prisma.transactionCategory.findMany({
    where: {
      userId,
      slug: { in: [INCOME_GROUP_SLUGS.business, INCOME_GROUP_SLUGS.personal] },
    },
  })

  const created = []
  for (const def of INCOME_GROUP_DEFS) {
    if (existing.some((e) => e.slug === def.slug)) continue
    const parent = bySlug.get(def.parentSlug)
    if (!parent) continue
    const row = await prisma.transactionCategory.create({
      data: {
        userId,
        name: def.name,
        slug: def.slug,
        color: def.color,
        parentId: parent.id,
        isGroup: true,
        isSystemGroup: false,
        position: def.position,
      },
    })
    created.push(row)
  }
  return [...existing, ...created]
}

// Minimal shape the walker needs — matches the API's nested response.
interface CatNode {
  id: number
  slug: string
  isGroup: boolean
  isSystemGroup: boolean
  children?: CatNode[]
}

/**
 * Walks a nested category tree and returns the set of category IDs that are
 * "income" — i.e. the two reserved income subgroups themselves plus every
 * descendant. Pure; no DB access.
 */
export function computeIncomeFlags(roots: CatNode[]): Set<number> {
  const incomeIds = new Set<number>()

  function walk(node: CatNode, insideIncome: boolean) {
    const isIncomeRoot =
      node.slug === INCOME_GROUP_SLUGS.business || node.slug === INCOME_GROUP_SLUGS.personal
    const nowInside = insideIncome || isIncomeRoot
    if (nowInside) incomeIds.add(node.id)
    node.children?.forEach((c) => walk(c, nowInside))
  }

  roots.forEach((r) => walk(r, false))
  return incomeIds
}
