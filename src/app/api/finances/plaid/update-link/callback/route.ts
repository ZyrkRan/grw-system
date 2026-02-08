import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  try {
    const body = await request.json()
    const { plaidItemId } = body

    if (!plaidItemId) {
      return NextResponse.json(
        { success: false, error: "plaidItemId is required" },
        { status: 400 }
      )
    }

    const plaidItem = await prisma.plaidItem.findFirst({
      where: { id: plaidItemId, userId },
    })

    if (!plaidItem) {
      return NextResponse.json(
        { success: false, error: "Plaid item not found" },
        { status: 404 }
      )
    }

    // Reset status to ACTIVE after successful re-authentication
    await prisma.plaidItem.update({
      where: { id: plaidItemId },
      data: {
        status: "ACTIVE",
        lastError: null,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Failed to update Plaid item status:", error)
    const message =
      error instanceof Error ? error.message : "Failed to update status"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
