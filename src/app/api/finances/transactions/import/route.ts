import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TransactionType } from "@/generated/prisma"
import { checkRateLimit, rateLimits, rateLimitResponse } from "@/lib/rate-limit"
import { importRequestSchema, formatZodError } from "@/lib/validations/finances"

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

  // Rate limit CSV imports
  const rl = checkRateLimit(`import:${userId}`, rateLimits.import)
  if (!rl.success) return rateLimitResponse(rl.resetAt)

  try {
    const body = await request.json()
    const parsed = importRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: formatZodError(parsed.error) },
        { status: 400 }
      )
    }

    const { accountId, transactions } = parsed.data

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

    // Batch duplicate detection — single query instead of N queries
    // Find the date range across all transactions to import
    const dates = validTransactions.map((txn) => new Date(txn.date))
    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())))
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())))
    const rangeStart = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate(), 0, 0, 0)
    const rangeEnd = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate(), 23, 59, 59, 999)

    // Fetch all existing transactions in the date range for this account (1 query)
    const existing = await prisma.bankTransaction.findMany({
      where: {
        accountId,
        date: { gte: rangeStart, lte: rangeEnd },
      },
      select: { date: true, description: true, amount: true },
    })

    // Build a Set of composite keys for O(1) duplicate lookup
    // Key format: "YYYY-MM-DD|description_lowercase|amount"
    const existingKeys = new Set(
      existing.map((txn) => {
        const d = new Date(txn.date)
        const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
        return `${dateKey}|${txn.description.toLowerCase()}|${Number(txn.amount)}`
      })
    )

    let skippedCount = 0
    const transactionsToInsert = validTransactions
      .map((txn) => {
        const date = new Date(txn.date)
        const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
        const key = `${dateKey}|${txn.description.toLowerCase()}|${txn.amount}`

        if (existingKeys.has(key)) {
          skippedCount++
          return null
        }

        // Also add to set so we don't insert duplicates within the CSV itself
        existingKeys.add(key)

        return {
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
          plaidStatus: null as null,
          plaidTransactionId: null as null,
        }
      })
      .filter((txn): txn is NonNullable<typeof txn> => txn !== null)

    // Bulk insert
    let importedCount = 0
    if (transactionsToInsert.length > 0) {
      const result = await prisma.bankTransaction.createMany({
        data: transactionsToInsert,
      })
      importedCount = result.count
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
