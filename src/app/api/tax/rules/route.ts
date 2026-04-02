import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/tax/rules
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const rules = await prisma.taxCategoryRule.findMany({
    where: { userId: session.user.id },
    include: { category: { select: { id: true, name: true, color: true } } },
    orderBy: { applyCount: "desc" },
  })

  return NextResponse.json({ success: true, data: { rules } })
}

// POST /api/tax/rules
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const { pattern, categoryId, taxType } = await request.json()

    if (!pattern || !taxType) {
      return NextResponse.json({ success: false, error: "pattern and taxType required" }, { status: 400 })
    }

    // Test regex is valid
    try { new RegExp(pattern, "i") } catch {
      return NextResponse.json({ success: false, error: "Invalid regex pattern" }, { status: 400 })
    }

    const existing = await prisma.taxCategoryRule.findFirst({ where: { userId, pattern } })
    if (existing) {
      return NextResponse.json({ success: false, error: "Rule with this pattern already exists" }, { status: 409 })
    }

    const rule = await prisma.taxCategoryRule.create({
      data: { userId, pattern, categoryId: categoryId ?? null, taxType },
      include: { category: { select: { id: true, name: true, color: true } } },
    })

    return NextResponse.json({ success: true, data: { rule } })
  } catch (error) {
    console.error("Create rule error:", error)
    return NextResponse.json({ success: false, error: "Failed to create rule" }, { status: 500 })
  }
}
