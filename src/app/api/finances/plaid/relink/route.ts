import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { plaidClient } from "@/lib/plaid"

function mapPlaidAccountType(plaidType: string): "CHECKING" | "SAVINGS" | "CREDIT" {
  switch (plaidType) {
    case "depository":
      return "CHECKING"
    case "credit":
      return "CREDIT"
    default:
      return "CHECKING"
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
    const { publicToken, institutionId, institutionName, accountMapping } = body

    // accountMapping: { [plaidAccountId]: existingBankAccountId }
    if (!publicToken) {
      return NextResponse.json(
        { success: false, error: "publicToken is required" },
        { status: 400 }
      )
    }

    // Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    })

    const { access_token: accessToken, item_id: itemId } = exchangeResponse.data

    // Fetch accounts from Plaid
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    })

    const result = await prisma.$transaction(async (tx) => {
      // Create the PlaidItem
      const plaidItem = await tx.plaidItem.create({
        data: {
          userId,
          itemId,
          accessToken,
          institutionId: institutionId || null,
          institutionName: institutionName || null,
          status: "ACTIVE",
        },
      })

      const updated: Array<{ name: string; id: number; linked: boolean }> = []

      for (const plaidAccount of accountsResponse.data.accounts) {
        const existingId = accountMapping?.[plaidAccount.account_id]

        if (existingId) {
          // Verify ownership and update existing account
          const existing = await tx.bankAccount.findFirst({
            where: { id: existingId, userId },
          })

          if (existing) {
            await tx.bankAccount.update({
              where: { id: existingId },
              data: {
                plaidAccountId: plaidAccount.account_id,
                plaidItemId: plaidItem.id,
                mask: plaidAccount.mask || existing.mask,
                officialName: plaidAccount.official_name || existing.officialName,
                subtype: plaidAccount.subtype || existing.subtype,
              },
            })
            updated.push({ name: existing.name, id: existingId, linked: true })
          }
        } else {
          // No mapping — create new account
          const created = await tx.bankAccount.create({
            data: {
              name: plaidAccount.name,
              type: mapPlaidAccountType(plaidAccount.type),
              mask: plaidAccount.mask || null,
              officialName: plaidAccount.official_name || null,
              plaidAccountId: plaidAccount.account_id,
              plaidItemId: plaidItem.id,
              subtype: plaidAccount.subtype || null,
              userId,
              isActive: true,
            },
          })
          updated.push({ name: created.name, id: created.id, linked: false })
        }
      }

      return { plaidItem, accounts: updated }
    })

    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (error: unknown) {
    console.error("Failed to relink Plaid accounts:", error)
    const message =
      error instanceof Error ? error.message : "Failed to relink"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
