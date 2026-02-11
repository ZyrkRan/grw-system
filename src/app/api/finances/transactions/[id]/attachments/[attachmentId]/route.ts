import { NextRequest, NextResponse } from "next/server"
import { del } from "@vercel/blob"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimits, rateLimitResponse } from "@/lib/rate-limit"

type RouteContext = { params: Promise<{ id: string; attachmentId: string }> }

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  const rl = checkRateLimit(`attachment-write:${userId}`, rateLimits.write)
  if (!rl.success) return rateLimitResponse(rl.resetAt)

  const { id, attachmentId } = await context.params
  const txnId = parseInt(id, 10)
  const attId = parseInt(attachmentId, 10)

  if (isNaN(txnId) || isNaN(attId)) {
    return NextResponse.json(
      { success: false, error: "Invalid ID" },
      { status: 400 }
    )
  }

  try {
    // Verify ownership via transaction
    const attachment = await prisma.transactionAttachment.findFirst({
      where: {
        id: attId,
        transactionId: txnId,
        userId,
      },
    })

    if (!attachment) {
      return NextResponse.json(
        { success: false, error: "Attachment not found" },
        { status: 404 }
      )
    }

    // Delete from Vercel Blob
    await del(attachment.url)

    // Delete DB record
    await prisma.transactionAttachment.delete({ where: { id: attId } })

    return NextResponse.json({ success: true, data: { deleted: true } })
  } catch (error) {
    console.error("Failed to delete attachment:", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete attachment" },
      { status: 500 }
    )
  }
}
