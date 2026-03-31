import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { formatZodError } from "@/lib/validations/finances"
import { checkRateLimit, rateLimits, rateLimitResponse } from "@/lib/rate-limit"

// ---------------------------------------------------------------------------
// Schema: accepts AI categorization suggestions from the client
// ---------------------------------------------------------------------------

const aiCategorizeSchema = z.object({
  suggestions: z
    .array(
      z.object({
        transactionId: z.number().int().positive(),
        categoryId: z.number().int().positive(),
        confidence: z.number().min(0).max(1),
      })
    )
    .min(1)
    .max(500),
})

// ---------------------------------------------------------------------------
// POST — Apply AI categorization suggestions
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    )
  }

  const userId = session.user!.id!

  const rl = checkRateLimit(`ai-categorize:${userId}`, rateLimits.write)
  if (!rl.success) return rateLimitResponse(rl.resetAt)

  try {
    const body = await request.json()
    const parsed = aiCategorizeSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: formatZodError(parsed.error) },
        { status: 400 }
      )
    }

    const { suggestions } = parsed.data

    // Verify all transactions belong to the user
    const transactionIds = suggestions.map((s) => s.transactionId)
    const existingTxns = await prisma.bankTransaction.findMany({
      where: { id: { in: transactionIds }, userId },
      select: { id: true },
    })
    const existingIds = new Set(existingTxns.map((t) => t.id))

    // Verify all categories exist and belong to user (or are defaults)
    const categoryIds = [...new Set(suggestions.map((s) => s.categoryId))]
    const existingCategories = await prisma.transactionCategory.findMany({
      where: {
        id: { in: categoryIds },
        OR: [{ userId }, { userId: null, isDefault: true }],
      },
      select: { id: true },
    })
    const validCategoryIds = new Set(existingCategories.map((c) => c.id))

    // Apply valid suggestions
    const validSuggestions = suggestions.filter(
      (s) => existingIds.has(s.transactionId) && validCategoryIds.has(s.categoryId)
    )

    if (validSuggestions.length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid suggestions to apply" },
        { status: 400 }
      )
    }

    // Update all transactions in a batch
    const updates = await prisma.$transaction(
      validSuggestions.map((s) =>
        prisma.bankTransaction.update({
          where: { id: s.transactionId },
          data: { categoryId: s.categoryId },
          select: {
            id: true,
            category: { select: { id: true, name: true, color: true } },
          },
        })
      )
    )

    return NextResponse.json({
      success: true,
      data: {
        applied: updates.length,
        skipped: suggestions.length - validSuggestions.length,
        updates,
      },
    })
  } catch (error) {
    console.error("Failed to apply AI categorization:", error)
    return NextResponse.json(
      { success: false, error: "Failed to apply categorization" },
      { status: 500 }
    )
  }
}
