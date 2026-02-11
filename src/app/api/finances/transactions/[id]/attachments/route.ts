import { NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimits, rateLimitResponse } from "@/lib/rate-limit"
import {
  ATTACHMENT_MAX_COUNT,
  ATTACHMENT_MAX_SIZE,
  ATTACHMENT_ALLOWED_TYPES,
} from "@/lib/validations/finances"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!
  const { id } = await context.params
  const txnId = parseInt(id, 10)

  if (isNaN(txnId)) {
    return NextResponse.json(
      { success: false, error: "Invalid transaction ID" },
      { status: 400 }
    )
  }

  try {
    // Verify ownership
    const transaction = await prisma.bankTransaction.findFirst({
      where: { id: txnId, userId },
      select: { id: true },
    })

    if (!transaction) {
      return NextResponse.json(
        { success: false, error: "Transaction not found" },
        { status: 404 }
      )
    }

    const attachments = await prisma.transactionAttachment.findMany({
      where: { transactionId: txnId },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ success: true, data: attachments })
  } catch (error) {
    console.error("Failed to fetch attachments:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch attachments" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  const rl = checkRateLimit(`attachment-write:${userId}`, rateLimits.write)
  if (!rl.success) return rateLimitResponse(rl.resetAt)

  const { id } = await context.params
  const txnId = parseInt(id, 10)

  if (isNaN(txnId)) {
    return NextResponse.json(
      { success: false, error: "Invalid transaction ID" },
      { status: 400 }
    )
  }

  try {
    // Verify ownership
    const transaction = await prisma.bankTransaction.findFirst({
      where: { id: txnId, userId },
      select: { id: true, _count: { select: { attachments: true } } },
    })

    if (!transaction) {
      return NextResponse.json(
        { success: false, error: "Transaction not found" },
        { status: 404 }
      )
    }

    // Check attachment limit
    if (transaction._count.attachments >= ATTACHMENT_MAX_COUNT) {
      return NextResponse.json(
        { success: false, error: `Maximum ${ATTACHMENT_MAX_COUNT} attachments per transaction` },
        { status: 400 }
      )
    }

    const formData = await request.formData()
    const file = formData.get("file")

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      )
    }

    // Validate file type
    if (!ATTACHMENT_ALLOWED_TYPES.includes(file.type as typeof ATTACHMENT_ALLOWED_TYPES[number])) {
      return NextResponse.json(
        { success: false, error: "File type not allowed. Use JPEG, PNG, WebP, or PDF." },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > ATTACHMENT_MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: "File too large. Maximum size is 5MB." },
        { status: 400 }
      )
    }

    // Upload to Vercel Blob
    const blob = await put(`transactions/${txnId}/${file.name}`, file, {
      access: "public",
    })

    // Create DB record
    const attachment = await prisma.transactionAttachment.create({
      data: {
        transactionId: txnId,
        userId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        url: blob.url,
      },
    })

    return NextResponse.json({ success: true, data: attachment }, { status: 201 })
  } catch (error) {
    console.error("Failed to upload attachment:", error)
    return NextResponse.json(
      { success: false, error: "Failed to upload attachment" },
      { status: 500 }
    )
  }
}
