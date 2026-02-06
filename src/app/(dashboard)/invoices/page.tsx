"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Send,
  CheckCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
import { InvoiceFormDialog } from "@/components/invoices/invoice-form-dialog"

interface Customer {
  id: number
  name: string
}

interface InvoiceItem {
  id: number
  description: string
  serviceDate: string
  quantity: number | string
  rate: number | string
  amount: number | string
  serviceLogId: number | null
}

interface Invoice {
  id: number
  invoiceNumber: string
  customerId: number
  issueDate: string
  dueDate: string | null
  status: string
  subtotal: number | string
  total: number | string
  amountPaid: number | string
  notes: string | null
  terms: string | null
  customer: { id: number; name: string }
  items: InvoiceItem[]
  _count: { items: number }
}

function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "$0.00"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value))
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString()
}

function getStatusBadge(status: string) {
  switch (status) {
    case "DRAFT":
      return <Badge variant="outline">Draft</Badge>
    case "SENT":
      return <Badge className="bg-blue-600 text-white">Sent</Badge>
    case "PAID":
      return <Badge className="bg-green-600 text-white">Paid</Badge>
    case "CANCELLED":
      return <Badge variant="destructive">Cancelled</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export default function InvoicesPage() {
  const router = useRouter()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState("")
  const [filterCustomerId, setFilterCustomerId] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [filterDateFrom, setFilterDateFrom] = useState("")
  const [filterDateTo, setFilterDateTo] = useState("")

  // Dialogs
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | undefined>(
    undefined
  )
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch customers for the filter dropdown
  useEffect(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then((result) => {
        if (result.success) setCustomers(result.data)
      })
      .catch((err) => console.error("Failed to load customers:", err))
  }, [])

  const fetchInvoices = useCallback(
    async (searchTerm: string) => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams()
        if (searchTerm) params.set("search", searchTerm)
        if (filterCustomerId) params.set("customerId", filterCustomerId)
        if (filterStatus) params.set("status", filterStatus)
        if (filterDateFrom) params.set("dateFrom", filterDateFrom)
        if (filterDateTo) params.set("dateTo", filterDateTo)

        const res = await fetch(`/api/invoices?${params.toString()}`)
        const result = await res.json()

        if (result.success) {
          setInvoices(result.data)
        }
      } catch (error) {
        console.error("Failed to fetch invoices:", error)
      } finally {
        setIsLoading(false)
      }
    },
    [filterCustomerId, filterStatus, filterDateFrom, filterDateTo]
  )

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchInvoices(search)
  }, [fetchInvoices]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearchChange(value: string) {
    setSearch(value)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      fetchInvoices(value)
    }, 300)
  }

  function handleCreateInvoice() {
    setEditingInvoice(undefined)
    setFormDialogOpen(true)
  }

  function handleEditInvoice(invoice: Invoice) {
    setEditingInvoice(invoice)
    setFormDialogOpen(true)
  }

  function handleDeleteClick(invoice: Invoice) {
    setDeleteTarget(invoice)
    setDeleteError("")
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setIsDeleting(true)
    setDeleteError("")

    try {
      const res = await fetch(`/api/invoices/${deleteTarget.id}`, {
        method: "DELETE",
      })
      const result = await res.json()

      if (result.success) {
        setDeleteTarget(null)
        fetchInvoices(search)
      } else {
        setDeleteError(result.error || "Failed to delete invoice.")
      }
    } catch {
      setDeleteError("Failed to delete invoice. Please try again.")
    } finally {
      setIsDeleting(false)
    }
  }

  async function handleStatusChange(invoiceId: number, newStatus: string) {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      const result = await res.json()

      if (result.success) {
        fetchInvoices(search)
      }
    } catch (error) {
      console.error("Failed to update invoice status:", error)
    }
  }

  function handleFormSuccess() {
    fetchInvoices(search)
  }

  const hasFilters =
    search || filterCustomerId || filterStatus || filterDateFrom || filterDateTo

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Invoices</h1>
        <Button onClick={handleCreateInvoice}>
          <Plus className="mr-2 size-4" />
          Create Invoice
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-56">
          <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search invoice #..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={filterCustomerId} onValueChange={setFilterCustomerId}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Customers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Customers</SelectItem>
            {customers.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="SENT">Sent</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            className="w-36"
            placeholder="From"
          />
          <span className="text-muted-foreground text-sm">to</span>
          <Input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            className="w-36"
            placeholder="To"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-8" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-8" />
                  </TableCell>
                </TableRow>
              ))
            ) : invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center">
                  {hasFilters
                    ? "No invoices match your filters."
                    : "No invoices yet. Create your first invoice to get started."}
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <button
                      className="font-medium text-primary underline-offset-4 hover:underline"
                      onClick={() =>
                        router.push(`/invoices/${invoice.id}`)
                      }
                    >
                      {invoice.invoiceNumber}
                    </button>
                  </TableCell>
                  <TableCell>{invoice.customer.name}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(invoice.issueDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {invoice.dueDate ? (
                      formatDate(invoice.dueDate)
                    ) : (
                      <span className="text-muted-foreground">&mdash;</span>
                    )}
                  </TableCell>
                  <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                  <TableCell>{invoice._count.items}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {formatCurrency(invoice.total)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {formatCurrency(invoice.amountPaid)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            router.push(`/invoices/${invoice.id}`)
                          }
                        >
                          <Eye className="mr-2 size-4" />
                          View
                        </DropdownMenuItem>
                        {invoice.status === "DRAFT" && (
                          <DropdownMenuItem
                            onClick={() => handleEditInvoice(invoice)}
                          >
                            <Pencil className="mr-2 size-4" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        {invoice.status === "DRAFT" && (
                          <DropdownMenuItem
                            onClick={() =>
                              handleStatusChange(invoice.id, "SENT")
                            }
                          >
                            <Send className="mr-2 size-4" />
                            Mark as Sent
                          </DropdownMenuItem>
                        )}
                        {invoice.status === "SENT" && (
                          <DropdownMenuItem
                            onClick={() =>
                              handleStatusChange(invoice.id, "PAID")
                            }
                          >
                            <CheckCircle className="mr-2 size-4" />
                            Mark as Paid
                          </DropdownMenuItem>
                        )}
                        {invoice.status === "DRAFT" && (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => handleDeleteClick(invoice)}
                          >
                            <Trash2 className="mr-2 size-4" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Form Dialog */}
      <InvoiceFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        invoice={editingInvoice}
        onSuccess={handleFormSuccess}
      />

      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Invoice</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete invoice{" "}
              <strong>{deleteTarget?.invoiceNumber}</strong>? This action cannot
              be undone.
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
