"use client"

import { useState } from "react"
import { useOllama } from "@/hooks/use-ollama"
import {
  categorizeTransactions,
  type TransactionInput,
  type CategoryOption,
} from "@/lib/ai/categorize"
export type { CategorizationResult } from "@/lib/ai/categorize"
import type { CategorizationResult } from "@/lib/ai/categorize"
import type { Transaction, CategoryRef } from "@/hooks/use-transactions"

interface UseAiCategorizeProps {
  categories: CategoryRef[]
  transactions: Transaction[]
  fetchTransactions: () => Promise<void>
}

interface UseAiCategorizeReturn {
  ollamaConnected: boolean
  isAiCategorizing: boolean
  aiProgress: { completed: number; total: number }
  aiResults: CategorizationResult[] | null
  aiReviewOpen: boolean
  setAiReviewOpen: (value: boolean) => void
  setAiResults: (value: CategorizationResult[] | null | ((prev: CategorizationResult[] | null) => CategorizationResult[] | null)) => void
  handleAiCategorize: (txns?: Transaction[]) => Promise<void>
  handleAiApply: (results: CategorizationResult[]) => Promise<void>
  handleAiReject: () => void
}

/**
 * Hook that manages AI categorization state and handlers.
 * Handles Ollama connection check, AI categorization, and result review.
 */
export function useAiCategorize({
  categories,
  transactions,
  fetchTransactions,
}: UseAiCategorizeProps): UseAiCategorizeReturn {
  // Check Ollama connection
  const { isConnected: ollamaConnected } = useOllama()

  // AI categorization state
  const [isAiCategorizing, setIsAiCategorizing] = useState(false)
  const [aiProgress, setAiProgress] = useState({ completed: 0, total: 0 })
  const [aiResults, setAiResults] = useState<CategorizationResult[] | null>(null)
  const [aiReviewOpen, setAiReviewOpen] = useState(false)

  // Run AI categorization on uncategorized transactions
  async function handleAiCategorize(txns?: Transaction[]) {
    const uncategorized = (txns || transactions).filter((t) => !t.category)
    if (uncategorized.length === 0) return

    setIsAiCategorizing(true)
    setAiProgress({ completed: 0, total: uncategorized.length })

    const txnInputs: TransactionInput[] = uncategorized.map((t) => ({
      id: t.id,
      description: t.description,
      amount: t.amount,
      type: t.type,
      merchantName: t.merchantName,
    }))

    const categoryOptions: CategoryOption[] = categories.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      groupName: c.groupName,
    }))

    try {
      const result = await categorizeTransactions(
        txnInputs,
        categoryOptions,
        (completed, total) => setAiProgress({ completed, total })
      )

      // Only show results that have a valid category suggestion
      const validResults = result.results.filter((r) => r.categoryId !== null)
      if (validResults.length > 0) {
        setAiResults(validResults)
        setAiReviewOpen(true)
      } else {
        setAiResults([])
        setAiReviewOpen(true)
      }
    } catch (err) {
      console.error("AI categorization failed:", err)
    } finally {
      setIsAiCategorizing(false)
    }
  }

  // Apply AI categorization results
  async function handleAiApply(results: CategorizationResult[]) {
    const suggestions = results
      .filter((r) => r.categoryId !== null)
      .map((r) => ({
        transactionId: r.transactionId,
        categoryId: r.categoryId!,
        confidence: r.confidence,
      }))

    if (suggestions.length === 0) {
      setAiReviewOpen(false)
      setAiResults(null)
      return
    }

    try {
      const res = await fetch("/api/finances/transactions/ai-categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestions }),
      })
      const result = await res.json()
      if (result.success) {
        await fetchTransactions()
      }
    } catch (err) {
      console.error("Failed to apply AI results:", err)
    } finally {
      setAiReviewOpen(false)
      setAiResults(null)
    }
  }

  // Reject AI categorization
  function handleAiReject() {
    setAiReviewOpen(false)
    setAiResults(null)
  }

  return {
    ollamaConnected,
    isAiCategorizing,
    aiProgress,
    aiResults,
    aiReviewOpen,
    setAiReviewOpen,
    setAiResults,
    handleAiCategorize,
    handleAiApply,
    handleAiReject,
  }
}
