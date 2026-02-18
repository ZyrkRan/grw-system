import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPlaidWebhook } from "@/lib/plaid-webhook-verify"
import { syncPlaidItem } from "@/lib/plaid-sync"
import { checkRateLimit, rateLimits } from "@/lib/rate-limit"

export async function POST(request: NextRequest) {
  let rawBody: string

  try {
    rawBody = await request.text()
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  // Verify webhook signature
  const verificationHeader = request.headers.get("plaid-verification")
  if (!verificationHeader) {
    console.warn("[Plaid Webhook] Missing Plaid-Verification header")
    return NextResponse.json({ error: "Missing verification" }, { status: 401 })
  }

  try {
    await verifyPlaidWebhook(rawBody, verificationHeader)
  } catch (error) {
    console.error("[Plaid Webhook] Verification failed:", error)
    return NextResponse.json({ error: "Verification failed" }, { status: 401 })
  }

  // Parse the webhook payload
  let payload: {
    webhook_type: string
    webhook_code: string
    item_id: string
    error?: { error_code?: string; error_message?: string }
  }

  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { webhook_type, webhook_code, item_id } = payload

  console.log(`[Plaid Webhook] ${webhook_type}/${webhook_code} for item ${item_id}`)

  try {
    // Look up PlaidItem by Plaid's item_id (not our internal id)
    const plaidItem = await prisma.plaidItem.findFirst({
      where: { itemId: item_id },
    })

    if (!plaidItem) {
      console.warn(`[Plaid Webhook] Unknown item_id: ${item_id}`)
      return NextResponse.json({ received: true })
    }

    // Handle TRANSACTIONS webhooks
    if (webhook_type === "TRANSACTIONS") {
      if (webhook_code === "SYNC_UPDATES_AVAILABLE" || webhook_code === "DEFAULT_UPDATE" || webhook_code === "INITIAL_UPDATE" || webhook_code === "HISTORICAL_UPDATE") {
        // Rate limit webhook-triggered syncs per PlaidItem
        const rl = checkRateLimit(`plaid-webhook-sync:${plaidItem.id}`, rateLimits.plaidWebhookSync)
        if (!rl.success) {
          console.log(`[Plaid Webhook] Rate limited for item ${plaidItem.id}, skipping sync`)
          return NextResponse.json({ received: true })
        }

        try {
          const result = await syncPlaidItem(plaidItem.id, plaidItem.userId)
          console.log(`[Plaid Webhook] Sync complete for item ${plaidItem.id}: +${result.added} ~${result.modified} -${result.removed}`)
        } catch (syncError) {
          console.error(`[Plaid Webhook] Sync failed for item ${plaidItem.id}:`, syncError)
          // Return 200 anyway — PlaidSyncError already updates item status in DB
        }
      }

      if (webhook_code === "TRANSACTIONS_REMOVED") {
        // Let the regular sync handle removals via cursor
        const rl = checkRateLimit(`plaid-webhook-sync:${plaidItem.id}`, rateLimits.plaidWebhookSync)
        if (rl.success) {
          try {
            await syncPlaidItem(plaidItem.id, plaidItem.userId)
          } catch (syncError) {
            console.error(`[Plaid Webhook] Sync failed for removal:`, syncError)
          }
        }
      }
    }

    // Handle ITEM webhooks (errors, status changes)
    if (webhook_type === "ITEM") {
      if (webhook_code === "ERROR") {
        const errorCode = payload.error?.error_code
        const errorMessage = payload.error?.error_message

        const reconnectRequired = [
          "ITEM_LOGIN_REQUIRED",
          "INVALID_CREDENTIALS",
          "INVALID_UPDATED_USERNAME",
          "INVALID_MFA",
          "ITEM_NOT_SUPPORTED",
        ]

        const status = errorCode && reconnectRequired.includes(errorCode)
          ? "LOGIN_REQUIRED" as const
          : "ERROR" as const

        await prisma.plaidItem.update({
          where: { id: plaidItem.id },
          data: {
            status,
            lastError: errorMessage || errorCode || "Unknown error from Plaid",
          },
        })

        console.log(`[Plaid Webhook] Item ${plaidItem.id} status set to ${status}: ${errorCode}`)
      }

      if (webhook_code === "PENDING_EXPIRATION") {
        console.warn(`[Plaid Webhook] Item ${plaidItem.id} consent expiring soon`)
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    // Always return 200 to prevent Plaid retries on unexpected errors
    console.error("[Plaid Webhook] Unexpected error:", error)
    return NextResponse.json({ received: true })
  }
}
