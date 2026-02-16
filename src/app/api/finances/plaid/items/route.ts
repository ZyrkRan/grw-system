import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const items = await prisma.plaidItem.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        institutionName: true,
        status: true,
        lastError: true,
        lastSuccessfulSync: true,
        _count: { select: { bankAccounts: true } },
      },
      orderBy: { lastSuccessfulSync: { sort: "desc", nulls: "last" } },
    })

    return NextResponse.json({ success: true, data: items })
  } catch (error) {
    console.error("Failed to fetch Plaid items:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch Plaid items" },
      { status: 500 }
    )
  }
}
