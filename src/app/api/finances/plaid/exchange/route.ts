import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { plaidClient } from "@/lib/plaid"

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user!.id!

  try {
    const body = await request.json()
    const { publicToken, institutionId, institutionName } = body

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

    // Create PlaidItem and fetch accounts in a transaction
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

      // Fetch accounts from Plaid
      const accountsResponse = await plaidClient.accountsGet({
        access_token: accessToken,
      })

      // Create BankAccount records for each Plaid account
      const bankAccounts = await Promise.all(
        accountsResponse.data.accounts.map((account) => {
          const accountType = mapPlaidAccountType(account.type)
          return tx.bankAccount.create({
            data: {
              name: account.name,
              type: accountType,
              mask: account.mask || null,
              officialName: account.official_name || null,
              plaidAccountId: account.account_id,
              plaidItemId: plaidItem.id,
              subtype: account.subtype || null,
              userId,
              isActive: true,
            },
          })
        })
      )

      return { plaidItem, bankAccounts }
    })

    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (error: unknown) {
    console.error("Failed to exchange Plaid token:", error)
    const message =
      error instanceof Error ? error.message : "Failed to exchange token"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}

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
