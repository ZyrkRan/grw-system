import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { plaidClient } from "@/lib/plaid"
import { CountryCode, Products } from "plaid"

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: "GRW CRM",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
      ...(process.env.PLAID_WEBHOOK_URL && { webhook: process.env.PLAID_WEBHOOK_URL }),
    })

    return NextResponse.json({
      success: true,
      data: { linkToken: response.data.link_token },
    })
  } catch (error: unknown) {
    console.error("Failed to create Plaid link token:", error)
    const message =
      error instanceof Error ? error.message : "Failed to create link token"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
