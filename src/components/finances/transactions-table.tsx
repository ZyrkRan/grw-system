"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  X,
  Tags,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { TransactionDialog } from "@/components/finances/transaction-dialog"
import type { TimeframeValue } from "@/components/finances/timeframe-selector"

interface AccountRef {
  id: number
  name: string
}

interface CategoryRef {
  id: number
  name: string
  color: string
}

interface ServiceLogRef {
  id: number
  serviceName: string
}

interface Transaction {
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
}

interface PaginationInfo {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "$0.00"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value))
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

interface TransactionsTableProps {
  accountId?: string
  timeframe?: TimeframeValue
  refreshKey?: number
}

export function TransactionsTable({ accountId, timeframe, refreshKey }: TransactionsTableProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [pagination, setPagination] = useState<PaginationInfo | null>(null)
  const [categories, setCategories] = useState<CategoryRef[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Dialogs
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<
    Transaction | undefined
  >(undefined)
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null)
  const [bulkDeleteTargets, setBulkDeleteTargets] = useState<Transaction[]>([])
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const bulkClearRef = useRef<(() => void) | null>(null)

  // Quick category assign
  const [assigningTxnId, setAssigningTxnId] = useState<number | null>(null)
  const [isBulkAssigning, setIsBulkAssigning] = useState(false)

  // Fetch categories for assign dialog
  useEffect(() => {
    fetch("/api/finances/categories")
      .then((r) => r.json())
      .then((result) => {
        if (result.success) {
          const flat: CategoryRef[] = []
          for (const cat of result.data) {
            flat.push({ id: cat.id, name: cat.name, color: cat.color })
            if (cat.children) {
              for (const child of cat.children) {
                flat.push({
                  id: child.id,
                  name: child.name,
                  color: child.color,
                })
              }
            }
          }
          setCategories(flat)
        }
      })
      .catch((err) => console.error("Failed to load categories:", err))
  }, [])

  const fetchTransactions = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (accountId && accountId !== "all") {
        params.set("accountId", accountId)
      }
      if (timeframe) {
        params.set("dateFrom", timeframe.dateFrom)
        params.set("dateTo", timeframe.dateTo)
      }
      // Use server-side pagination with a large page size so
      // client-side DataTable pagination still works as before
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
  }, [accountId, timeframe, refreshKey])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  function handleAddTransaction() {
    setEditingTransaction(undefined)
    setFormDialogOpen(true)
  }

  function handleEditTransaction(transaction: Transaction) {
    setEditingTransaction(transaction)
    setFormDialogOpen(true)
  }

  function handleDeleteClick(transaction: Transaction) {
    setDeleteTarget(transaction)
    setDeleteError("")
  }

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
      fetchTransactions()
    } catch {
      setDeleteError("Failed to delete. Please try again.")
    } finally {
      setIsDeleting(false)
    }
  }

  function handleBulkDelete(selected: Transaction[], clearSelection: () => void) {
    setBulkDeleteTargets(selected)
    bulkClearRef.current = clearSelection
    setDeleteError("")
  }

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

  function handleFormSuccess() {
    fetchTransactions()
  }

  // Count uncategorized transactions for display in title
  const uncategorizedCount = transactions.filter((txn) => txn.category === null).length

  const transactionColumns: ColumnDef<Transaction>[] = [
    {
      key: "date",
      label: "Date",
      sortValue: (row) => new Date(row.date).getTime(),
      searchValue: (row) => formatDate(row.date),
      render: (_, row) => (
        <span className="whitespace-nowrap">{formatDate(row.date)}</span>
      ),
    },
    {
      key: "description",
      label: "Description",
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <span className="max-w-[200px] truncate">{row.description}</span>
          {row.isPending && (
            <Badge
              variant="outline"
              className="border-amber-500 text-amber-600 text-xs"
            >
              Pending
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "merchantName",
      label: "Merchant",
      render: (_, row) => (
        <span className="text-muted-foreground">
          {row.merchantName || "\u2014"}
        </span>
      ),
    },
    {
      key: "account",
      label: "Account",
      sortValue: (row) => row.account.name,
      render: (_, row) => row.account.name,
    },
    {
      key: "category",
      label: "Category",
      filterable: true,
      filterValue: (row) => row.category?.name ?? "Uncategorized",
      sortValue: (row) => row.category?.name ?? "",
      render: (_, row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            {row.category ? (
              <button type="button" className="cursor-pointer">
                <Badge variant="outline" className="gap-1.5 hover:bg-accent">
                  {assigningTxnId === row.id ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <span
                      className="inline-block size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: row.category.color }}
                    />
                  )}
                  {row.category.name}
                </Badge>
              </button>
            ) : (
              <button type="button" className="cursor-pointer">
                <Badge variant="outline" className="text-muted-foreground hover:bg-accent">
                  {assigningTxnId === row.id ? (
                    <Loader2 className="mr-1 size-3 animate-spin" />
                  ) : null}
                  Uncategorized
                </Badge>
              </button>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuLabel>Assign Category</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                handleCategoryAssign(row.id, null)
              }}
            >
              <X className="mr-2 size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Uncategorized</span>
            </DropdownMenuItem>
            {categories.map((c) => (
              <DropdownMenuItem
                key={c.id}
                onClick={(e) => {
                  e.stopPropagation()
                  handleCategoryAssign(row.id, c.id)
                }}
              >
                <span
                  className="mr-2 inline-block size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: c.color }}
                />
                {c.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
    {
      key: "amount",
      label: "Amount",
      className: "text-right",
      sortValue: (row) => Number(row.amount),
      render: (_, row) => (
        <span
          className={`whitespace-nowrap font-medium ${
            row.type === "INFLOW" ? "text-green-600" : "text-red-600"
          }`}
        >
          {row.type === "INFLOW" ? "+" : "-"}
          {formatCurrency(row.amount)}
        </span>
      ),
    },
    {
      key: "type",
      label: "Type",
      filterable: true,
      filterValue: (row) =>
        row.type === "INFLOW" ? "Inflow" : "Outflow",
      render: (_, row) => (
        <Badge
          variant={row.type === "INFLOW" ? "default" : "destructive"}
          className={row.type === "INFLOW" ? "bg-green-600 text-white" : ""}
        >
          {row.type === "INFLOW" ? "Inflow" : "Outflow"}
        </Badge>
      ),
    },
    {
      key: "_actions",
      label: "",
      pinned: true,
      className: "w-12",
      render: (_, txn) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontal className="size-4" />
              <span className="sr-only">Actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => handleEditTransaction(txn)}
            >
              <Pencil className="mr-2 size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => handleDeleteClick(txn)}
            >
              <Trash2 className="mr-2 size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          Transactions
          {pagination && ` (${pagination.total})`}
          {uncategorizedCount > 0 && (
            <span className="text-muted-foreground font-normal text-base ml-1">
              {uncategorizedCount} uncategorized
            </span>
          )}
        </h2>
        <Button onClick={handleAddTransaction}>
          <Plus className="mr-2 size-4" />
          Add Transaction
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable
          storageKey="transactions"
          columns={transactionColumns}
          data={transactions}
          rowKey="id"
          rowStyle={(row) =>
            row.category?.color
              ? { borderLeft: `4px solid ${row.category.color}` }
              : undefined
          }
          searchable
          searchPlaceholder="Search by description, merchant, or date..."
          selectable
          renderCard={(txn, { isSelected, onToggle }) => (
            <div
              className={`rounded-md border p-3 space-y-1.5 ${isSelected ? "bg-muted" : ""}`}
              style={
                txn.category?.color
                  ? { borderLeft: `4px solid ${txn.category.color}` }
                  : undefined
              }
            >
              {/* Row 1: checkbox + description + actions */}
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={onToggle}
                  className="mt-0.5"
                  aria-label={`Select transaction ${txn.description}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium truncate">{txn.description}</span>
                    {txn.isPending && (
                      <Badge
                        variant="outline"
                        className="border-amber-500 text-amber-600 text-xs shrink-0"
                      >
                        Pending
                      </Badge>
                    )}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7 shrink-0 -mt-0.5">
                      <MoreHorizontal className="size-4" />
                      <span className="sr-only">Actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleEditTransaction(txn)}>
                      <Pencil className="mr-2 size-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => handleDeleteClick(txn)}
                    >
                      <Trash2 className="mr-2 size-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {/* Row 2: merchant + date */}
              <div className="pl-7 text-sm text-muted-foreground">
                {txn.merchantName && <>{txn.merchantName} &middot; </>}
                {formatDate(txn.date)}
              </div>
              {/* Row 3: account */}
              <div className="pl-7 text-sm text-muted-foreground">
                {txn.account.name}
              </div>
              {/* Row 4: category + amount */}
              <div className="pl-7 flex items-center justify-between">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    {txn.category ? (
                      <button type="button" className="cursor-pointer">
                        <Badge variant="outline" className="gap-1.5 hover:bg-accent">
                          {assigningTxnId === txn.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <span
                              className="inline-block size-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: txn.category.color }}
                            />
                          )}
                          {txn.category.name}
                        </Badge>
                      </button>
                    ) : (
                      <button type="button" className="cursor-pointer">
                        <Badge variant="outline" className="text-muted-foreground hover:bg-accent">
                          {assigningTxnId === txn.id ? (
                            <Loader2 className="mr-1 size-3 animate-spin" />
                          ) : null}
                          Uncategorized
                        </Badge>
                      </button>
                    )}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                    <DropdownMenuLabel>Assign Category</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCategoryAssign(txn.id, null)
                      }}
                    >
                      <X className="mr-2 size-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Uncategorized</span>
                    </DropdownMenuItem>
                    {categories.map((c) => (
                      <DropdownMenuItem
                        key={c.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCategoryAssign(txn.id, c.id)
                        }}
                      >
                        <span
                          className="mr-2 inline-block size-3 shrink-0 rounded-full"
                          style={{ backgroundColor: c.color }}
                        />
                        {c.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <span
                  className={`text-sm font-medium whitespace-nowrap ${
                    txn.type === "INFLOW" ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {txn.type === "INFLOW" ? "+" : "-"}
                  {formatCurrency(txn.amount)}
                </span>
              </div>
            </div>
          )}
          renderBulkActions={(selected, clearSelection) => (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={isBulkAssigning}
                  >
                    {isBulkAssigning ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Tags className="size-4" />
                    )}
                    Set Category ({selected.length})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                  <DropdownMenuLabel>Assign Category</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleBulkCategoryAssign(selected, null, clearSelection)}
                  >
                    <X className="mr-2 size-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Uncategorized</span>
                  </DropdownMenuItem>
                  {categories.map((c) => (
                    <DropdownMenuItem
                      key={c.id}
                      onClick={() => handleBulkCategoryAssign(selected, c.id, clearSelection)}
                    >
                      <span
                        className="mr-2 inline-block size-3 shrink-0 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      {c.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5"
                onClick={() => handleBulkDelete(selected, clearSelection)}
              >
                <Trash2 className="size-4" />
                Delete ({selected.length})
              </Button>
            </>
          )}
          emptyMessage="No transactions yet. Click 'Add Transaction' or connect a bank account to get started."
        />
      )}

      {/* Transaction Form Dialog */}
      <TransactionDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        transaction={editingTransaction}
        onSuccess={handleFormSuccess}
      />

      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteTarget || bulkDeleteTargets.length > 0}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
            setBulkDeleteTargets([])
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bulkDeleteTargets.length > 1
                ? `Delete ${bulkDeleteTargets.length} Transactions`
                : "Delete Transaction"}
            </DialogTitle>
            <DialogDescription>
              {bulkDeleteTargets.length > 1 ? (
                <>
                  Are you sure you want to delete{" "}
                  <strong>{bulkDeleteTargets.length} transactions</strong>? This
                  action cannot be undone.
                </>
              ) : (
                <>
                  Are you sure you want to delete the transaction{" "}
                  <strong>{deleteTarget?.description}</strong>? This action
                  cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {deleteError}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteTarget(null)
                setBulkDeleteTargets([])
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
