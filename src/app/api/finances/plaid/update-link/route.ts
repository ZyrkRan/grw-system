import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { plaidClient } from "@/lib/plaid"
import { CountryCode } from "plaid"

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

    // Create link token in update mode using the existing access token
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: "GRW CRM",
      access_token: plaidItem.accessToken,
      country_codes: [CountryCode.Us],
      language: "en",
    })

    return NextResponse.json({
      success: true,
      data: { linkToken: response.data.link_token },
    })
  } catch (error: unknown) {
    console.error("Failed to create update link token:", error)
    const message =
      error instanceof Error ? error.message : "Failed to create update link token"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
