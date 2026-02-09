import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TransactionType } from "@/generated/prisma"

type ImportTransaction = {
  date: string
  description: string
  amount: number
  type: "INFLOW" | "OUTFLOW"
  merchantName?: string | null
}

type ValidationError = {
  row: number
  error: string
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    )
  }

  const userId = session.user!.id!

  try {
    const body = await request.json()
    const { accountId, transactions } = body

    // Validate request body
    if (!accountId || typeof accountId !== "number") {
      return NextResponse.json(
        { success: false, error: "Valid accountId is required" },
        { status: 400 }
      )
    }

    if (!Array.isArray(transactions)) {
      return NextResponse.json(
        { success: false, error: "transactions must be an array" },
        { status: 400 }
      )
    }

    // Verify account ownership
    const account = await prisma.bankAccount.findFirst({
      where: { id: accountId, userId },
    })

    if (!account) {
      return NextResponse.json(
        { success: false, error: "Account not found or access denied" },
        { status: 404 }
      )
    }

    // Validate and process transactions
    const validTransactions: Array<ImportTransaction & { row: number }> = []
    const errors: ValidationError[] = []
    const now = new Date()

    transactions.forEach((txn: ImportTransaction, index: number) => {
      const row = index + 1
      const validationErrors: string[] = []

      // Validate date
      if (!txn.date) {
        validationErrors.push("Date is required")
      } else {
        const date = new Date(txn.date)
        if (isNaN(date.getTime())) {
          validationErrors.push("Invalid date format")
        } else if (date > now) {
          validationErrors.push("Date cannot be in the future")
        }
      }

      // Validate description
      if (!txn.description || typeof txn.description !== "string" || txn.description.trim() === "") {
        validationErrors.push("Description is required and cannot be empty")
      }

      // Validate amount
      if (typeof txn.amount !== "number" || isNaN(txn.amount)) {
        validationErrors.push("Amount must be a valid number")
      } else if (txn.amount <= 0) {
        validationErrors.push("Amount must be positive")
      }

      // Validate type
      if (txn.type !== "INFLOW" && txn.type !== "OUTFLOW") {
        validationErrors.push("Type must be 'INFLOW' or 'OUTFLOW'")
      }

      if (validationErrors.length > 0) {
        errors.push({
          row,
          error: validationErrors.join("; "),
        })
      } else {
        validTransactions.push({ ...txn, row })
      }
    })

    // If there are validation errors, return them without processing
    if (validTransactions.length === 0 && errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "All transactions failed validation",
          data: { imported: 0, skipped: 0, errors },
        },
        { status: 400 }
      )
    }

    // Check for duplicates
    const transactionsToInsert: Array<{
      date: Date
      description: string
      amount: number
      type: TransactionType
      accountId: number
      userId: string
      statementMonth: number
      statementYear: number
      isPending: boolean
      merchantName: string | null
      plaidStatus: null
      plaidTransactionId: null
    }> = []
    let skippedCount = 0

    for (const txn of validTransactions) {
      const date = new Date(txn.date)
      const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0)
      const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)

      // Check for duplicate: same accountId, date (within same day), description (case-insensitive), and amount
      const existingTransaction = await prisma.bankTransaction.findFirst({
        where: {
          accountId,
          date: {
            gte: startOfDay,
            lte: endOfDay,
          },
          description: {
            equals: txn.description,
            mode: "insensitive",
          },
          amount: txn.amount,
        },
      })

      if (existingTransaction) {
        skippedCount++
      } else {
        transactionsToInsert.push({
          date,
          description: txn.description,
          amount: txn.amount,
          type: txn.type as TransactionType,
          accountId,
          userId,
          statementMonth: date.getMonth() + 1,
          statementYear: date.getFullYear(),
          isPending: false,
          merchantName: txn.merchantName || null,
          plaidStatus: null,
          plaidTransactionId: null,
        })
      }
    }

    // Bulk insert valid transactions
    let importedCount = 0
    if (transactionsToInsert.length > 0) {
      await prisma.bankTransaction.createMany({
        data: transactionsToInsert,
      })
      importedCount = transactionsToInsert.length
    }

    return NextResponse.json({
      success: true,
      data: {
        imported: importedCount,
        skipped: skippedCount,
        errors,
      },
    })
  } catch (error) {
    console.error("Failed to import transactions:", error)
    return NextResponse.json(
      { success: false, error: "Failed to import transactions" },
      { status: 500 }
    )
  }
}
