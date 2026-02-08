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

    // Upsert PlaidItem and accounts in a transaction (handles reconnects)
    const result = await prisma.$transaction(async (tx) => {
      // Check if this Plaid item already exists for this user
      const existingItem = await tx.plaidItem.findFirst({
        where: { itemId, userId },
      })

      let plaidItem
      if (existingItem) {
        plaidItem = await tx.plaidItem.update({
          where: { id: existingItem.id },
          data: {
            accessToken,
            status: "ACTIVE",
            lastError: null,
            institutionId: institutionId || existingItem.institutionId,
            institutionName: institutionName || existingItem.institutionName,
          },
        })
      } else {
        plaidItem = await tx.plaidItem.create({
          data: {
            userId,
            itemId,
            accessToken,
            institutionId: institutionId || null,
            institutionName: institutionName || null,
            status: "ACTIVE",
          },
        })
      }

      // Fetch accounts from Plaid
      const accountsResponse = await plaidClient.accountsGet({
        access_token: accessToken,
      })

      // Upsert BankAccount records for each Plaid account
      const bankAccounts = await Promise.all(
        accountsResponse.data.accounts.map(async (account) => {
          const accountType = mapPlaidAccountType(account.type)

          const rawBalance = account.balances.current
          const currentBalance =
            rawBalance !== null && accountType === "CREDIT"
              ? -Math.abs(rawBalance)
              : rawBalance

          const existingAccount = await tx.bankAccount.findFirst({
            where: { plaidAccountId: account.account_id, userId },
          })

          if (existingAccount) {
            return tx.bankAccount.update({
              where: { id: existingAccount.id },
              data: {
                name: account.name,
                type: accountType,
                mask: account.mask || null,
                officialName: account.official_name || null,
                subtype: account.subtype || null,
                plaidItemId: plaidItem.id,
                isActive: true,
                currentBalance,
              },
            })
          }

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
              currentBalance,
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
