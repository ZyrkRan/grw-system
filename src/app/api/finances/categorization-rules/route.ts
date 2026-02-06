import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  try {
    const rules = await prisma.categorizationRule.findMany({
      where: { userId },
      orderBy: { pattern: "asc" },
      include: {
        category: {
          select: { id: true, name: true, color: true },
        },
      },
    })

    return NextResponse.json({ success: true, data: rules })
  } catch (error) {
    console.error("Failed to fetch categorization rules:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch categorization rules" },
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

  try {
    const body = await request.json()
    const { pattern, categoryId, applyToExisting } = body

    if (!pattern || !categoryId) {
      return NextResponse.json(
        { success: false, error: "Pattern and categoryId are required" },
        { status: 400 }
      )
    }

    // Validate that the pattern is a valid regex
    try {
      new RegExp(pattern, "i")
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid regex pattern" },
        { status: 400 }
      )
    }

    const catId = parseInt(categoryId, 10)

    // Verify category belongs to user or is a default category
    const category = await prisma.transactionCategory.findFirst({
      where: {
        id: catId,
        OR: [{ userId }, { userId: null, isDefault: true }],
      },
    })

    if (!category) {
      return NextResponse.json(
        { success: false, error: "Category not found" },
        { status: 404 }
      )
    }

    const rule = await prisma.categorizationRule.create({
      data: {
        pattern: pattern.trim(),
        categoryId: catId,
        userId,
      },
      include: {
        category: {
          select: { id: true, name: true, color: true },
        },
      },
    })

    // Optionally apply the rule to existing uncategorized transactions
    let appliedCount = 0
    if (applyToExisting) {
      const uncategorized = await prisma.bankTransaction.findMany({
        where: { userId, categoryId: null },
      })

      const regex = new RegExp(pattern, "i")
      const matchingIds: number[] = []

      for (const txn of uncategorized) {
        if (
          regex.test(txn.description) ||
          (txn.merchantName && regex.test(txn.merchantName))
        ) {
          matchingIds.push(txn.id)
        }
      }

      if (matchingIds.length > 0) {
        const result = await prisma.bankTransaction.updateMany({
          where: { id: { in: matchingIds } },
          data: { categoryId: catId },
        })
        appliedCount = result.count
      }
    }

    return NextResponse.json(
      { success: true, data: { rule, appliedCount } },
      { status: 201 }
    )
  } catch (error) {
    console.error("Failed to create categorization rule:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create categorization rule" },
      { status: 500 }
    )
  }
}
