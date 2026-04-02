import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// PATCH /api/tax/rules/[id]
// Body: { pattern?, categoryId?, taxType? }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }
  const { id } = await params

  const rule = await prisma.taxCategoryRule.findFirst({
    where: { id: Number(id), userId: session.user.id },
  })
  if (!rule) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  try {
    const body = await request.json()
    const { pattern, categoryId, taxType } = body

    // Validate regex if pattern provided
    if (pattern !== undefined) {
      if (!pattern) {
        return NextResponse.json({ success: false, error: "Pattern cannot be empty" }, { status: 400 })
      }
      try { new RegExp(pattern, "i") } catch {
        return NextResponse.json({ success: false, error: "Invalid regex pattern" }, { status: 400 })
      }
    }

    const updated = await prisma.taxCategoryRule.update({
      where: { id: Number(id) },
      data: {
        ...(pattern !== undefined ? { pattern } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(taxType !== undefined ? { taxType } : {}),
      },
      include: { category: { select: { id: true, name: true, color: true } } },
    })

    return NextResponse.json({ success: true, data: { rule: updated } })
  } catch (error) {
    console.error("Update rule error:", error)
    return NextResponse.json({ success: false, error: "Failed to update rule" }, { status: 500 })
  }
}

// DELETE /api/tax/rules/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }
  const { id } = await params

  const rule = await prisma.taxCategoryRule.findFirst({
    where: { id: Number(id), userId: session.user.id },
  })
  if (!rule) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  await prisma.taxCategoryRule.delete({ where: { id: Number(id) } })
  return NextResponse.json({ success: true })
}
