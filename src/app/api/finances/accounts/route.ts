import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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

  try {
    const body = await request.json()
    const { name, type, accountNumber, currentBalance } = body

    if (!name || !type) {
      return NextResponse.json(
        { success: false, error: "Name and type are required" },
        { status: 400 }
      )
    }

    const validTypes = ["CHECKING", "SAVINGS", "CREDIT"]
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { success: false, error: "Type must be CHECKING, SAVINGS, or CREDIT" },
        { status: 400 }
      )
    }

    const account = await prisma.bankAccount.create({
      data: {
        name: name.trim(),
        type,
        accountNumber: accountNumber?.trim() || null,
        userId,
        isActive: true,
        ...(currentBalance != null && currentBalance !== "" ? { currentBalance: parseFloat(currentBalance) } : {}),
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
