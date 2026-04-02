import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// POST /api/tax/transactions/bulk
// Body: { ids: number[], categoryId: number | null, taxType: string | null, saveRule?: { pattern, categoryId, taxType } }
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const body = await request.json()
    const { ids, categoryId, taxType, saveRule } = body as {
      ids: number[]
      categoryId: number | null
      taxType: string | null
      saveRule?: { pattern: string; categoryId: number; taxType: string }
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: false, error: "ids required" }, { status: 400 })
    }

    const { count } = await prisma.taxTransaction.updateMany({
      where: { id: { in: ids }, userId },
      data: {
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(taxType !== undefined ? { taxType } : {}),
        isReviewed: true,
      },
    })

    // Optionally save rule
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

    return NextResponse.json({ success: true, data: { updated: count } })
  } catch (error) {
    console.error("Bulk update error:", error)
    return NextResponse.json({ success: false, error: "Bulk update failed" }, { status: 500 })
  }
}
