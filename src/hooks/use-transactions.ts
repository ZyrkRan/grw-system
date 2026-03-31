"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import type { TimeframeValue } from "@/components/finances/timeframe-selector"

export interface AccountRef {
  id: number
  name: string
}

export interface CategoryRef {
  id: number
  name: string
  color: string
  groupName?: string // "Business" or "Personal"
  groupSlug?: string // "business" or "personal"
}

export interface ServiceLogRef {
  id: number
  serviceName: string
}

export interface Transaction {
  id: number
  date: string
  description: string
  amount: number | string
  type: string
  notes: string | null
  merchantName: string | null
  isPending: boolean
  plaidTransactionId?: string | null
  account: AccountRef
  category: CategoryRef | null
  serviceLog: ServiceLogRef | null
  _count?: { attachments: number }
}

export interface PaginationInfo {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

interface UseTransactionsProps {
  accountId?: string
  timeframe?: TimeframeValue
  refreshKey?: number
  categoryGroupFilter?: "all" | "business" | "personal"
}

interface UseTransactionsReturn {
  transactions: Transaction[]
  setTransactions: (value: Transaction[] | ((prev: Transaction[]) => Transaction[])) => void
  pagination: PaginationInfo | null
  isLoading: boolean
  categories: CategoryRef[]
  categoryFilter: string
  setCategoryFilter: (value: string) => void
  filteredCategories: CategoryRef[]
  allGroupedCategories: { groups: { label: string; slug: string; items: CategoryRef[] }[]; ungrouped: CategoryRef[] }
  filteredGroupedCategories: { groups: { label: string; slug: string; items: CategoryRef[] }[]; ungrouped: CategoryRef[] }
  fetchTransactions: () => Promise<void>
  handleCategoryAssign: (transactionId: number, categoryId: number | null) => Promise<void>
  handleBulkCategoryAssign: (selected: Transaction[], categoryId: number | null, clearSelection: () => void) => Promise<void>
  handleDelete: (transaction: Transaction) => void
  handleBulkDelete: (selected: Transaction[], clearSelection: () => void) => void
  handleDeleteConfirm: () => Promise<void>
  deleteTarget: Transaction | null
  bulkDeleteTargets: Transaction[]
  setDeleteTarget: (value: Transaction | null) => void
  setBulkDeleteTargets: (value: Transaction[]) => void
  isDeleting: boolean
  deleteError: string
  setDeleteError: (value: string) => void
  bulkClearRef: React.MutableRefObject<(() => void) | null>
  assigningTxnId: number | null
  isBulkAssigning: boolean
}

/**
 * Hook that manages transaction data, fetching, categorization, and deletion.
 * Handles all transaction-related state and API calls.
 */
export function useTransactions({
  accountId,
  timeframe,
  refreshKey,
  categoryGroupFilter = "all",
}: UseTransactionsProps): UseTransactionsReturn {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [pagination, setPagination] = useState<PaginationInfo | null>(null)
  const [categories, setCategories] = useState<CategoryRef[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null)
  const [bulkDeleteTargets, setBulkDeleteTargets] = useState<Transaction[]>([])
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const bulkClearRef = useRef<(() => void) | null>(null)

  // Category filter: "all", "uncategorized", or a category ID string
  const [categoryFilter, setCategoryFilter] = useState("all")

  // Quick category assign
  const [assigningTxnId, setAssigningTxnId] = useState<number | null>(null)
  const [isBulkAssigning, setIsBulkAssigning] = useState(false)

  // Fetch categories on mount
  useEffect(() => {
    fetch("/api/finances/categories")
      .then((r) => r.json())
      .then((result) => {
        if (result.success) {
          const flat: CategoryRef[] = []
          for (const root of result.data) {
            if (root.isSystemGroup) {
              // System group (Business/Personal) — include itself as assignable + traverse children
              const groupName = root.name as string
              const groupSlug = root.slug as string
              flat.push({ id: root.id, name: root.name, color: root.color, groupName, groupSlug })
              if (root.children) {
                for (const child of root.children) {
                  if (!child.isGroup) {
                    flat.push({ id: child.id, name: child.name, color: child.color, groupName, groupSlug })
                  }
                  if (child.children) {
                    for (const leaf of child.children) {
                      flat.push({ id: leaf.id, name: leaf.name, color: leaf.color, groupName, groupSlug })
                    }
                  }
                }
              }
            } else if (!root.isGroup) {
              flat.push({ id: root.id, name: root.name, color: root.color })
            } else if (root.children) {
              for (const child of root.children) {
                flat.push({ id: child.id, name: child.name, color: child.color })
              }
            }
          }
          setCategories(flat)
        }
      })
      .catch((err) => console.error("Failed to load categories:", err))
  }, [])

  // Categories filtered by the active Business/Personal group toggle
  const filteredCategories = useMemo(() => {
    if (categoryGroupFilter === "all") return categories
    return categories.filter((c) => c.groupSlug === categoryGroupFilter || !c.groupSlug)
  }, [categories, categoryGroupFilter])

  // Helper: group a list of categories by Business/Personal for rendering with headers
  function buildGroupedCategories(cats: CategoryRef[]) {
    const groups: { label: string; slug: string; items: CategoryRef[] }[] = []
    const ungrouped: CategoryRef[] = []

    const businessItems = cats.filter((c) => c.groupSlug === "business")
    const personalItems = cats.filter((c) => c.groupSlug === "personal")
    const otherItems = cats.filter((c) => !c.groupSlug)

    if (businessItems.length > 0) groups.push({ label: "Business", slug: "business", items: businessItems })
    if (personalItems.length > 0) groups.push({ label: "Personal", slug: "personal", items: personalItems })
    if (otherItems.length > 0) ungrouped.push(...otherItems)

    return { groups, ungrouped }
  }

  // ALL categories grouped (for assign dropdowns — always show everything)
  const allGroupedCategories = useMemo(() => buildGroupedCategories(categories), [categories])

  // Filtered categories grouped (for toolbar filter dropdown — scoped to active toggle)
  const filteredGroupedCategories = useMemo(() => buildGroupedCategories(filteredCategories), [filteredCategories])

  // Fetch transactions with current filters
  const fetchTransactions = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (accountId && accountId !== "all") {
        params.set("accountId", accountId)
      }
      if (timeframe?.dateFrom) params.set("dateFrom", timeframe.dateFrom)
      if (timeframe?.dateTo) params.set("dateTo", timeframe.dateTo)
      if (categoryFilter === "uncategorized") {
        params.set("uncategorized", "true")
      } else if (categoryFilter !== "all") {
        params.set("categoryId", categoryFilter)
      }
      if (categoryGroupFilter && categoryGroupFilter !== "all") {
        params.set("categoryGroup", categoryGroupFilter)
      }
      params.set("pageSize", "250")
      const url = `/api/finances/transactions?${params}`
      const res = await fetch(url)
      const result = await res.json()

      if (result.success) {
        setTransactions(result.data)
        if (result.pagination) {
          setPagination(result.pagination)
        }
      }
    } catch (error) {
      console.error("Failed to fetch transactions:", error)
    } finally {
      setIsLoading(false)
    }
  }, [accountId, timeframe, refreshKey, categoryFilter, categoryGroupFilter])

  // Re-fetch when dependencies change
  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  // Delete handler
  async function handleDeleteConfirm() {
    const targets = bulkDeleteTargets.length > 0 ? bulkDeleteTargets : deleteTarget ? [deleteTarget] : []
    if (targets.length === 0) return
    setIsDeleting(true)
    setDeleteError("")

    try {
      if (targets.length === 1) {
        // Single delete uses the existing endpoint
        const res = await fetch(`/api/finances/transactions/${targets[0].id}`, { method: "DELETE" })
        const result = await res.json()
        if (!result.success) {
          setDeleteError(result.error || "Failed to delete transaction.")
          return
        }
      } else {
        // Bulk delete uses the batch endpoint
        const res = await fetch("/api/finances/transactions/batch", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: targets.map((t) => t.id) }),
        })
        const result = await res.json()
        if (!result.success) {
          setDeleteError(result.error || "Failed to delete transactions.")
          return
        }
      }

      setDeleteTarget(null)
      setBulkDeleteTargets([])
      bulkClearRef.current?.()
      bulkClearRef.current = null
      await fetchTransactions()
    } catch {
      setDeleteError("Failed to delete. Please try again.")
    } finally {
      setIsDeleting(false)
    }
  }

  // Single transaction delete click
  function handleDelete(transaction: Transaction) {
    setDeleteTarget(transaction)
    setDeleteError("")
  }

  // Bulk delete
  function handleBulkDelete(selected: Transaction[], clearSelection: () => void) {
    setBulkDeleteTargets(selected)
    bulkClearRef.current = clearSelection
    setDeleteError("")
  }

  // Assign category to single transaction
  async function handleCategoryAssign(transactionId: number, categoryId: number | null) {
    setAssigningTxnId(transactionId)
    try {
      const res = await fetch(`/api/finances/transactions/${transactionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId }),
      })
      const result = await res.json()
      if (result.success) {
        // Update the transaction in local state instead of refetching all
        setTransactions((prev) =>
          prev.map((txn) =>
            txn.id === transactionId
              ? {
                  ...txn,
                  category: categoryId
                    ? categories.find((c) => c.id === categoryId) || null
                    : null,
                }
              : txn
          )
        )
      }
    } catch {
      console.error("Failed to assign category")
    } finally {
      setAssigningTxnId(null)
    }
  }

  // Assign category to multiple transactions
  async function handleBulkCategoryAssign(
    selected: Transaction[],
    categoryId: number | null,
    clearSelection: () => void
  ) {
    setIsBulkAssigning(true)
    try {
      // Use batch endpoint instead of N individual requests
      const res = await fetch("/api/finances/transactions/batch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selected.map((t) => t.id),
          categoryId,
        }),
      })
      const result = await res.json()

      if (result.success) {
        // Update transactions in local state
        const selectedIds = new Set(selected.map((t) => t.id))
        setTransactions((prev) =>
          prev.map((txn) =>
            selectedIds.has(txn.id)
              ? {
                  ...txn,
                  category: categoryId
                    ? categories.find((c) => c.id === categoryId) || null
                    : null,
                }
              : txn
          )
        )
        clearSelection()
      }
    } catch {
      console.error("Failed to bulk assign category")
    } finally {
      setIsBulkAssigning(false)
    }
  }

  return {
    transactions,
    setTransactions,
    pagination,
    isLoading,
    categories,
    categoryFilter,
    setCategoryFilter,
    filteredCategories,
    allGroupedCategories,
    filteredGroupedCategories,
    fetchTransactions,
    handleCategoryAssign,
    handleBulkCategoryAssign,
    handleDelete,
    handleBulkDelete,
    handleDeleteConfirm,
    deleteTarget,
    bulkDeleteTargets,
    setDeleteTarget,
    setBulkDeleteTargets,
    isDeleting,
    deleteError,
    setDeleteError,
    bulkClearRef,
    assigningTxnId,
    isBulkAssigning,
  }
}
