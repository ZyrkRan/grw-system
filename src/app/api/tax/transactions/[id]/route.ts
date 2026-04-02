import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// PATCH /api/tax/transactions/[id]
// Body: { categoryId?, taxType?, isReviewed?, notes?, saveRule? }
// saveRule: { pattern, categoryId, taxType } — optionally create a TaxCategoryRule
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }
  const userId = session.user.id
  const { id } = await params

  try {
    const body = await request.json()
    const { categoryId, taxType, isReviewed, notes, saveRule } = body

    // Verify ownership
    const existing = await prisma.taxTransaction.findFirst({
      where: { id: Number(id), userId },
    })
    if (!existing) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
    }

    const updated = await prisma.taxTransaction.update({
      where: { id: Number(id) },
      data: {
        ...(categoryId !== undefined ? { categoryId: categoryId ?? null } : {}),
        ...(taxType !== undefined ? { taxType: taxType ?? null } : {}),
        ...(isReviewed !== undefined ? { isReviewed } : {}),
        ...(notes !== undefined ? { notes: notes ?? null } : {}),
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            color: true,
            parent: { select: { id: true, name: true, isSystemGroup: true } },
          },
        },
      },
    })

    // Optionally save a categorization rule
    if (saveRule?.pattern && saveRule?.taxType) {
      const existingRule = await prisma.taxCategoryRule.findFirst({
        where: { userId, pattern: saveRule.pattern },
      })
      if (!existingRule) {
        await prisma.taxCategoryRule.create({
          data: {
            userId,
            pattern: saveRule.pattern,
            categoryId: saveRule.categoryId ?? null,
            taxType: saveRule.taxType,
          },
        })
      }
    }

    return NextResponse.json({
      success: true,
      data: { ...updated, amount: Number(updated.amount) },
    })
  } catch (error) {
    console.error("Tax transaction update error:", error)
    return NextResponse.json({ success: false, error: "Update failed" }, { status: 500 })
  }
}
