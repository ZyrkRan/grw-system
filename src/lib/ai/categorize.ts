// ---------------------------------------------------------------------------
// AI Transaction Categorization — Client-side Ollama integration
// ---------------------------------------------------------------------------

import { generate } from "@/lib/ollama"

export interface TransactionInput {
  id: number
  description: string
  amount: number | string
  type: string
  merchantName: string | null
}

export interface CategoryOption {
  id: number
  name: string
  color: string
  groupName?: string // "Business" or "Personal"
}

export interface CategorizationResult {
  transactionId: number
  categoryId: number | null
  categoryName: string | null
  confidence: number // 0-1
  reasoning: string
}

export interface CategorizationBatchResult {
  results: CategorizationResult[]
  totalProcessed: number
  totalCategorized: number
  errors: string[]
}

// ---------------------------------------------------------------------------
// Single transaction categorization
// ---------------------------------------------------------------------------

export async function categorizeTransaction(
  transaction: TransactionInput,
  categories: CategoryOption[]
): Promise<CategorizationResult> {
  const categoryList = categories
    .map((c) => `- ID: ${c.id}, Name: "${c.name}"${c.groupName ? ` (${c.groupName})` : ""}`)
    .join("\n")

  const system = `You are a financial transaction categorizer. Given a bank transaction, assign it to the most appropriate category from the provided list. Categories are organized under Business or Personal groups — pick the right group first, then the best sub-category. This user runs both personal and business expenses through the same bank account. Respond ONLY with valid JSON, no markdown fences.`

  const prompt = `Categorize this transaction:

Description: "${transaction.description}"
Amount: $${Number(transaction.amount).toFixed(2)}
Type: ${transaction.type}
${transaction.merchantName ? `Merchant: "${transaction.merchantName}"` : ""}

Available categories:
${categoryList}

Respond with JSON:
{
  "categoryId": <number or null if no good match>,
  "categoryName": <string or null>,
  "confidence": <number 0-1>,
  "reasoning": <brief explanation>
}`

  try {
    const response = await generate({
      prompt,
      system,
      temperature: 0.1,
      format: "json",
    })

    const parsed = JSON.parse(response.response)

    // Validate that the returned categoryId actually exists
    const validCategory = parsed.categoryId
      ? categories.find((c) => c.id === parsed.categoryId)
      : null

    return {
      transactionId: transaction.id,
      categoryId: validCategory ? parsed.categoryId : null,
      categoryName: validCategory?.name || null,
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0)),
      reasoning: parsed.reasoning || "No reasoning provided",
    }
  } catch (err) {
    return {
      transactionId: transaction.id,
      categoryId: null,
      categoryName: null,
      confidence: 0,
      reasoning: err instanceof Error ? err.message : "Categorization failed",
    }
  }
}

// ---------------------------------------------------------------------------
// Batch categorization (processes sequentially to avoid overloading Ollama)
// ---------------------------------------------------------------------------

export async function categorizeTransactions(
  transactions: TransactionInput[],
  categories: CategoryOption[],
  onProgress?: (completed: number, total: number) => void
): Promise<CategorizationBatchResult> {
  const results: CategorizationResult[] = []
  const errors: string[] = []

  for (let i = 0; i < transactions.length; i++) {
    try {
      const result = await categorizeTransaction(transactions[i], categories)
      results.push(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      errors.push(`Transaction ${transactions[i].id}: ${msg}`)
      results.push({
        transactionId: transactions[i].id,
        categoryId: null,
        categoryName: null,
        confidence: 0,
        reasoning: msg,
      })
    }
    onProgress?.(i + 1, transactions.length)
  }

  return {
    results,
    totalProcessed: transactions.length,
    totalCategorized: results.filter((r) => r.categoryId !== null).length,
    errors,
  }
}
