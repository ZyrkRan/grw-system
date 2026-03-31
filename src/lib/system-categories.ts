import { prisma } from "@/lib/prisma"

const SYSTEM_GROUPS = [
  { name: "Business", slug: "business", color: "#3b82f6", position: 0 },
  { name: "Personal", slug: "personal", color: "#8b5cf6", position: 1 },
] as const

/**
 * Ensures the Personal and Business system category groups exist for a user.
 * Creates them if missing. Returns the group records.
 */
export async function ensureSystemGroups(userId: string) {
  const existing = await prisma.transactionCategory.findMany({
    where: { userId, isSystemGroup: true },
  })

  const groups = []

  for (const group of SYSTEM_GROUPS) {
    const found = existing.find((e) => e.slug === group.slug)
    if (found) {
      groups.push(found)
    } else {
      const created = await prisma.transactionCategory.create({
        data: {
          userId,
          name: group.name,
          slug: group.slug,
          color: group.color,
          isGroup: true,
          isSystemGroup: true,
          position: group.position,
        },
      })
      groups.push(created)
    }
  }

  return groups
}

/**
 * Migrates existing top-level non-system categories under the Business group.
 * Only runs once (skips categories that already have a parent).
 */
export async function migrateExistingCategories(userId: string) {
  const groups = await ensureSystemGroups(userId)
  const businessGroup = groups.find((g) => g.slug === "business")
  if (!businessGroup) return

  // Find top-level categories that aren't system groups and have no parent
  const orphans = await prisma.transactionCategory.findMany({
    where: {
      userId,
      parentId: null,
      isSystemGroup: false,
    },
  })

  if (orphans.length === 0) return

  // Move them under Business
  await prisma.transactionCategory.updateMany({
    where: {
      id: { in: orphans.map((o) => o.id) },
    },
    data: {
      parentId: businessGroup.id,
    },
  })
}
