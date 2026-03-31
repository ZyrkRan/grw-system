import { prisma } from "@/lib/prisma"

/**
 * Resolves a categoryGroup filter ("business" | "personal") to an array of category IDs
 * that belong to that system group (including all nested children).
 * Returns undefined if no filtering is needed.
 */
export async function resolveCategoryGroupIds(
  userId: string,
  categoryGroup: string | null
): Promise<number[] | undefined> {
  if (categoryGroup !== "business" && categoryGroup !== "personal") return undefined

  const systemGroup = await prisma.transactionCategory.findFirst({
    where: { userId, isSystemGroup: true, slug: categoryGroup },
    include: {
      children: {
        select: { id: true, children: { select: { id: true } } },
      },
    },
  })

  if (!systemGroup) return undefined

  return [
    systemGroup.id,
    ...systemGroup.children.map((c) => c.id),
    ...systemGroup.children.flatMap((c) => c.children?.map((gc) => gc.id) ?? []),
  ]
}
