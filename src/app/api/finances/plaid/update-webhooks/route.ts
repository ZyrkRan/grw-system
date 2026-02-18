import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { plaidClient } from "@/lib/plaid"

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const webhookUrl = process.env.PLAID_WEBHOOK_URL
  if (!webhookUrl) {
    return NextResponse.json(
      { success: false, error: "PLAID_WEBHOOK_URL is not configured" },
      { status: 400 }
    )
  }

  const userId = session.user!.id!

  // Find all PlaidItems that need webhook URL update
  const items = await prisma.plaidItem.findMany({
    where: {
      userId,
      OR: [
        { webhookUrl: null },
        { NOT: { webhookUrl } },
      ],
    },
  })

  if (items.length === 0) {
    return NextResponse.json({
      success: true,
      data: { updated: 0, message: "All items already have the correct webhook URL" },
    })
  }

  const results: { id: string; institution: string | null; success: boolean; error?: string }[] = []

  for (const item of items) {
    try {
      await plaidClient.itemWebhookUpdate({
        access_token: item.accessToken,
        webhook: webhookUrl,
      })

      await prisma.plaidItem.update({
        where: { id: item.id },
        data: { webhookUrl },
      })

      results.push({ id: item.id, institution: item.institutionName, success: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      console.error(`[UpdateWebhooks] Failed for item ${item.id}:`, error)
      results.push({ id: item.id, institution: item.institutionName, success: false, error: message })
    }
  }

  const updated = results.filter((r) => r.success).length
  return NextResponse.json({
    success: true,
    data: { updated, total: items.length, results },
  })
}
