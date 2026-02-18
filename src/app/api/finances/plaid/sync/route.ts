import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { checkRateLimit, rateLimits, rateLimitResponse } from "@/lib/rate-limit"
import { plaidSyncSchema, formatZodError } from "@/lib/validations/finances"
import { syncPlaidItem, PlaidSyncError } from "@/lib/plaid-sync"

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  // Rate limit: Plaid sync is an expensive external API call
  const rl = checkRateLimit(`plaid-sync:${userId}`, rateLimits.plaidSync)
  if (!rl.success) return rateLimitResponse(rl.resetAt)

  try {
    const body = await request.json()
    const parsed = plaidSyncSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: formatZodError(parsed.error) },
        { status: 400 }
      )
    }

    const result = await syncPlaidItem(parsed.data.plaidItemId, userId)

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    if (error instanceof PlaidSyncError) {
      if (error.code === "NOT_FOUND") {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 404 }
        )
      }
      if (error.code === "LOGIN_REQUIRED") {
        return NextResponse.json(
          { success: false, error: "LOGIN_REQUIRED", loginRequired: true },
          { status: 400 }
        )
      }
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    console.error("Unexpected sync error:", error)
    const message = error instanceof Error ? error.message : "Failed to sync transactions"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
