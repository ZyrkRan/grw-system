import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { plaidClient } from "@/lib/plaid"
import { checkRateLimit, rateLimits, rateLimitResponse } from "@/lib/rate-limit"

type RouteContext = { params: Promise<{ id: string }> }

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id

  const rl = checkRateLimit(`plaid-item-write:${userId}`, rateLimits.write)
  if (!rl.success) return rateLimitResponse(rl.resetAt)

  const { id } = await context.params

  try {
    const item = await prisma.plaidItem.findFirst({
      where: { id, userId },
      include: { _count: { select: { bankAccounts: true } } },
    })

    if (!item) {
      return NextResponse.json(
        { success: false, error: "Plaid item not found" },
        { status: 404 }
      )
    }

    if (item._count.bankAccounts > 0) {
      return NextResponse.json(
        { success: false, error: "Cannot delete — this connection still has linked accounts. Delete the accounts first." },
        { status: 400 }
      )
    }

    // Revoke access token on Plaid's side (best-effort)
    try {
      await plaidClient.itemRemove({ access_token: item.accessToken })
    } catch (err) {
      console.warn(`Failed to revoke Plaid access token for item ${id}:`, err)
    }

    await prisma.plaidItem.delete({ where: { id } })

    return NextResponse.json({ success: true, data: { deleted: true } })
  } catch (error) {
    console.error("Failed to delete Plaid item:", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete Plaid item" },
      { status: 500 }
    )
  }
}
