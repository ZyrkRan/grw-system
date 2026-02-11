import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createAccountSchema, formatZodError } from "@/lib/validations/finances"
import { checkRateLimit, rateLimits, rateLimitResponse } from "@/lib/rate-limit"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  try {
    const accounts = await prisma.bankAccount.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { transactions: true },
        },
        plaidItem: {
          select: { id: true, institutionName: true, status: true },
        },
      },
    })

    return NextResponse.json({ success: true, data: accounts })
  } catch (error) {
    console.error("Failed to fetch accounts:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch accounts" },
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

  const rl = checkRateLimit(`account-create:${userId}`, rateLimits.write)
  if (!rl.success) return rateLimitResponse(rl.resetAt)

  try {
    const body = await request.json()
    const parsed = createAccountSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: formatZodError(parsed.error) },
        { status: 400 }
      )
    }

    const { name, type, accountNumber, currentBalance } = parsed.data

    const account = await prisma.bankAccount.create({
      data: {
        name,
        type,
        accountNumber: accountNumber || null,
        userId,
        isActive: true,
        ...(currentBalance != null ? { currentBalance } : {}),
      },
    })

    return NextResponse.json({ success: true, data: account }, { status: 201 })
  } catch (error) {
    console.error("Failed to create account:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create account" },
      { status: 500 }
    )
  }
}
