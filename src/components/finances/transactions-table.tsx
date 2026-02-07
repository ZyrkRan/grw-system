"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Tag,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { TransactionDialog } from "@/components/finances/transaction-dialog"

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

export function TransactionsTable() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
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
  const [categoryAssignTarget, setCategoryAssignTarget] =
    useState<Transaction | null>(null)
  const [assignCategoryId, setAssignCategoryId] = useState("")
  const [isAssigning, setIsAssigning] = useState(false)

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
      const res = await fetch("/api/finances/transactions")
      const result = await res.json()

      if (result.success) {
        setTransactions(result.data)
      }
    } catch (error) {
      console.error("Failed to fetch transactions:", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

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
      const results = await Promise.all(
        targets.map((txn) =>
          fetch(`/api/finances/transactions/${txn.id}`, { method: "DELETE" }).then((r) => r.json())
        )
      )

      const failed = results.filter((r) => !r.success)
      if (failed.length > 0) {
        setDeleteError(`Failed to delete ${failed.length} transaction(s).`)
      } else {
        setDeleteTarget(null)
        setBulkDeleteTargets([])
        bulkClearRef.current?.()
        bulkClearRef.current = null
        fetchTransactions()
      }
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

  function handleCategoryAssignClick(transaction: Transaction) {
    setCategoryAssignTarget(transaction)
    setAssignCategoryId(
      transaction.category ? String(transaction.category.id) : ""
    )
  }

  async function handleCategoryAssignConfirm() {
    if (!categoryAssignTarget) return
    setIsAssigning(true)

    try {
      const res = await fetch(
        `/api/finances/transactions/${categoryAssignTarget.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryId:
              assignCategoryId && assignCategoryId !== "none"
                ? parseInt(assignCategoryId, 10)
                : null,
          }),
        }
      )
      const result = await res.json()

      if (result.success) {
        setCategoryAssignTarget(null)
        fetchTransactions()
      }
    } catch {
      console.error("Failed to assign category")
    } finally {
      setIsAssigning(false)
    }
  }

  function handleFormSuccess() {
    fetchTransactions()
  }

  const transactionColumns: ColumnDef<Transaction>[] = [
    {
      key: "date",
      label: "Date",
      sortValue: (row) => new Date(row.date).getTime(),
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
      filterable: true,
      sortValue: (row) => row.account.name,
      filterValue: (row) => row.account.name,
      render: (_, row) => row.account.name,
    },
    {
      key: "category",
      label: "Category",
      filterable: true,
      filterValue: (row) => row.category?.name ?? "Uncategorized",
      sortValue: (row) => row.category?.name ?? "",
      render: (_, row) =>
        row.category ? (
          <span className="flex items-center gap-2">
            <span
              className="inline-block size-3 shrink-0 rounded-full"
              style={{ backgroundColor: row.category.color }}
            />
            {row.category.name}
          </span>
        ) : (
          <span className="text-muted-foreground">Uncategorized</span>
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
      render: (_, txn) => {
        const isPlaid = !!txn.plaidTransactionId
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => handleCategoryAssignClick(txn)}
              >
                <Tag className="mr-2 size-4" />
                Edit Category
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleEditTransaction(txn)}
              >
                <Pencil className="mr-2 size-4" />
                Edit
              </DropdownMenuItem>
              {!isPlaid && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => handleDeleteClick(txn)}
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Transactions</h2>
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
          searchable
          searchPlaceholder="Search by description or merchant..."
          selectable
          renderBulkActions={(selected, clearSelection) => {
            const deletable = selected.filter((txn) => !txn.plaidTransactionId)
            return (
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5"
                disabled={deletable.length === 0}
                onClick={() => handleBulkDelete(deletable, clearSelection)}
              >
                <Trash2 className="size-4" />
                Delete ({deletable.length})
              </Button>
            )
          }}
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

      {/* Quick Category Assign Dialog */}
      <Dialog
        open={!!categoryAssignTarget}
        onOpenChange={(open) => {
          if (!open) setCategoryAssignTarget(null)
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign Category</DialogTitle>
            <DialogDescription>
              Select a category for &quot;{categoryAssignTarget?.description}
              &quot;
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select
              value={assignCategoryId}
              onValueChange={setAssignCategoryId}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Category</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCategoryAssignTarget(null)}
              disabled={isAssigning}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCategoryAssignConfirm}
              disabled={isAssigning}
            >
              {isAssigning ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
