import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createCategorySchema, formatZodError } from "@/lib/validations/finances"
import { checkRateLimit, rateLimits, rateLimitResponse } from "@/lib/rate-limit"
import { ensureSystemGroups } from "@/lib/system-categories"
import { ensureIncomeGroups, INCOME_GROUP_SLUGS } from "@/lib/income-categories"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  const lean = request.nextUrl.searchParams.get("lean") === "1"

  try {
    // Build includes — skip _count in lean mode (tax-review doesn't need counts)
    const childInclude = lean
      ? { children: { orderBy: { position: "asc" as const }, include: { children: { orderBy: { position: "asc" as const } } } } }
      : { _count: { select: { transactions: true } }, children: { orderBy: { position: "asc" as const }, include: { _count: { select: { transactions: true } }, children: { orderBy: { position: "asc" as const }, include: { _count: { select: { transactions: true } } } } } } }

    const categories = await prisma.transactionCategory.findMany({
      where: {
        parentId: null,
        OR: [
          { userId },
          { userId: null, isDefault: true },
        ],
      },
      orderBy: { position: "asc" },
      include: childInclude,
    })

    // Ensure system groups exist if missing (rare — only on first-ever load)
    const needsSystemGroups = !categories.some((c) => c.isSystemGroup)

    // Check whether the two Income subgroups exist anywhere in the tree.
    const hasIncomeGroups = (() => {
      let found = 0
      const target = new Set<string>([INCOME_GROUP_SLUGS.business, INCOME_GROUP_SLUGS.personal])
      const walk = (n: { slug: string; children?: { slug: string; children?: unknown[] }[] }) => {
        if (target.has(n.slug)) found++
        n.children?.forEach((c) => walk(c as typeof n))
      }
      categories.forEach((c) => walk(c as unknown as { slug: string; children?: { slug: string; children?: unknown[] }[] }))
      return found >= 2
    })()

    if (needsSystemGroups || !hasIncomeGroups) {
      if (needsSystemGroups) await ensureSystemGroups(userId)
      await ensureIncomeGroups(userId)
      const updated = await prisma.transactionCategory.findMany({
        where: { parentId: null, OR: [{ userId }, { userId: null, isDefault: true }] },
        orderBy: { position: "asc" },
        include: childInclude,
      })
      return NextResponse.json({ success: true, data: updated })
    }

    return NextResponse.json({ success: true, data: categories })
  } catch (error) {
    console.error("Failed to fetch categories:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch categories" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  const rl = checkRateLimit(`category-create:${userId}`, rateLimits.write)
  if (!rl.success) return rateLimitResponse(rl.resetAt)

  try {
    const body = await request.json()
    const parsed = createCategorySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: formatZodError(parsed.error) },
        { status: 400 }
      )
    }

    const { name, color, parentId, isGroup, position, attachmentPrompt } = parsed.data

    // Auto-generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")

    const category = await prisma.transactionCategory.create({
      data: {
        name,
        slug,
        color,
        userId,
        parentId: parentId || null,
        isGroup,
        position,
        attachmentPrompt,
      },
      include: {
        _count: { select: { transactions: true } },
      },
    })

    return NextResponse.json({ success: true, data: category }, { status: 201 })
  } catch (error) {
    console.error("Failed to create category:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create category" },
      { status: 500 }
    )
  }
}
