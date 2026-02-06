"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Tag,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

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
  const [accounts, setAccounts] = useState<AccountRef[]>([])
  const [categories, setCategories] = useState<CategoryRef[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState("")
  const [filterAccountId, setFilterAccountId] = useState("")
  const [filterCategoryId, setFilterCategoryId] = useState("")
  const [filterType, setFilterType] = useState("")
  const [filterMonth, setFilterMonth] = useState("")
  const [filterYear, setFilterYear] = useState("")
  const [filterUncategorized, setFilterUncategorized] = useState(false)

  // Dialogs
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<
    Transaction | undefined
  >(undefined)
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  // Quick category assign
  const [categoryAssignTarget, setCategoryAssignTarget] = useState<Transaction | null>(null)
  const [assignCategoryId, setAssignCategoryId] = useState("")
  const [isAssigning, setIsAssigning] = useState(false)

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch dropdown data on mount
  useEffect(() => {
    Promise.all([
      fetch("/api/finances/accounts").then((r) => r.json()),
      fetch("/api/finances/categories").then((r) => r.json()),
    ])
      .then(([accResult, catResult]) => {
        if (accResult.success) setAccounts(accResult.data)
        if (catResult.success) {
          // Flatten categories for the filter dropdown
          const flat: CategoryRef[] = []
          for (const cat of catResult.data) {
            flat.push({ id: cat.id, name: cat.name, color: cat.color })
            if (cat.children) {
              for (const child of cat.children) {
                flat.push({ id: child.id, name: child.name, color: child.color })
              }
            }
          }
          setCategories(flat)
        }
      })
      .catch((err) => console.error("Failed to load filter data:", err))
  }, [])

  const fetchTransactions = useCallback(
    async (searchTerm: string) => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams()
        if (searchTerm) params.set("search", searchTerm)
        if (filterAccountId && filterAccountId !== "all")
          params.set("accountId", filterAccountId)
        if (filterCategoryId && filterCategoryId !== "all")
          params.set("categoryId", filterCategoryId)
        if (filterType && filterType !== "all") params.set("type", filterType)
        if (filterMonth && filterMonth !== "all")
          params.set("month", filterMonth)
        if (filterYear) params.set("year", filterYear)
        if (filterUncategorized) params.set("uncategorized", "true")

        const res = await fetch(
          `/api/finances/transactions?${params.toString()}`
        )
        const result = await res.json()

        if (result.success) {
          setTransactions(result.data)
        }
      } catch (error) {
        console.error("Failed to fetch transactions:", error)
      } finally {
        setIsLoading(false)
      }
    },
    [
      filterAccountId,
      filterCategoryId,
      filterType,
      filterMonth,
      filterYear,
      filterUncategorized,
    ]
  )

  useEffect(() => {
    fetchTransactions(search)
  }, [fetchTransactions]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearchChange(value: string) {
    setSearch(value)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      fetchTransactions(value)
    }, 300)
  }

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
    if (!deleteTarget) return
    setIsDeleting(true)
    setDeleteError("")

    try {
      const res = await fetch(
        `/api/finances/transactions/${deleteTarget.id}`,
        { method: "DELETE" }
      )
      const result = await res.json()

      if (result.success) {
        setDeleteTarget(null)
        fetchTransactions(search)
      } else {
        setDeleteError(result.error || "Failed to delete transaction.")
      }
    } catch {
      setDeleteError("Failed to delete transaction. Please try again.")
    } finally {
      setIsDeleting(false)
    }
  }

  function handleCategoryAssignClick(transaction: Transaction) {
    setCategoryAssignTarget(transaction)
    setAssignCategoryId(transaction.category ? String(transaction.category.id) : "")
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
            categoryId: assignCategoryId && assignCategoryId !== "none"
              ? parseInt(assignCategoryId, 10)
              : null,
          }),
        }
      )
      const result = await res.json()

      if (result.success) {
        setCategoryAssignTarget(null)
        fetchTransactions(search)
      }
    } catch {
      console.error("Failed to assign category")
    } finally {
      setIsAssigning(false)
    }
  }

  function handleFormSuccess() {
    fetchTransactions(search)
  }

  const hasFilters =
    search ||
    filterAccountId ||
    filterCategoryId ||
    filterType ||
    filterMonth ||
    filterYear ||
    filterUncategorized

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Transactions</h2>
        <Button onClick={handleAddTransaction}>
          <Plus className="mr-2 size-4" />
          Add Transaction
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-56">
          <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={filterAccountId} onValueChange={setFilterAccountId}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterCategoryId} onValueChange={setFilterCategoryId}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
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

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="INFLOW">Inflow</SelectItem>
            <SelectItem value="OUTFLOW">Outflow</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All Months" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Months</SelectItem>
            {MONTH_NAMES.map((name, i) => (
              <SelectItem key={i} value={String(i + 1)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="number"
          placeholder="Year"
          value={filterYear}
          onChange={(e) => setFilterYear(e.target.value)}
          className="w-24"
          min={2000}
          max={2100}
        />

        <div className="flex items-center gap-2">
          <Checkbox
            id="uncategorized-filter"
            checked={filterUncategorized}
            onCheckedChange={(checked) =>
              setFilterUncategorized(checked === true)
            }
          />
          <label
            htmlFor="uncategorized-filter"
            className="text-sm text-muted-foreground cursor-pointer whitespace-nowrap"
          >
            Uncategorized only
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Merchant</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                </TableRow>
              ))
            ) : transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  {hasFilters
                    ? "No transactions match your filters."
                    : "No transactions yet. Add your first transaction to get started."}
                </TableCell>
              </TableRow>
            ) : (
              transactions.map((txn) => {
                const isPlaid = !!txn.plaidTransactionId
                return (
                  <TableRow key={txn.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(txn.date)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="max-w-[200px] truncate">
                          {txn.description}
                        </span>
                        {txn.isPending && (
                          <Badge
                            variant="outline"
                            className="border-amber-500 text-amber-600 text-xs"
                          >
                            Pending
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {txn.merchantName || "\u2014"}
                    </TableCell>
                    <TableCell>{txn.account.name}</TableCell>
                    <TableCell>
                      {txn.category ? (
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block size-3 shrink-0 rounded-full"
                            style={{ backgroundColor: txn.category.color }}
                          />
                          {txn.category.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          Uncategorized
                        </span>
                      )}
                    </TableCell>
                    <TableCell
                      className={`text-right whitespace-nowrap font-medium ${
                        txn.type === "INFLOW"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {txn.type === "INFLOW" ? "+" : "-"}
                      {formatCurrency(txn.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          txn.type === "INFLOW" ? "default" : "destructive"
                        }
                        className={
                          txn.type === "INFLOW"
                            ? "bg-green-600 text-white"
                            : ""
                        }
                      >
                        {txn.type === "INFLOW" ? "Inflow" : "Outflow"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                          >
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
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

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
              Select a category for &quot;{categoryAssignTarget?.description}&quot;
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={assignCategoryId} onValueChange={setAssignCategoryId}>
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
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Transaction</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the transaction{" "}
              <strong>{deleteTarget?.description}</strong>? This action cannot be
              undone.
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
              onClick={() => setDeleteTarget(null)}
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
