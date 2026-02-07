"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Plus,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Send,
  CheckCircle,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { InvoiceFormDialog } from "@/components/invoices/invoice-form-dialog"

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
  const [isLoading, setIsLoading] = useState(true)

  // Dialogs
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | undefined>(
    undefined
  )
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  const fetchInvoices = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/invoices")
      const result = await res.json()

      if (result.success) {
        setInvoices(result.data)
      }
    } catch (error) {
      console.error("Failed to fetch invoices:", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchInvoices()
  }, [fetchInvoices])

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
        fetchInvoices()
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
        fetchInvoices()
      }
    } catch (error) {
      console.error("Failed to update invoice status:", error)
    }
  }

  function handleFormSuccess() {
    fetchInvoices()
  }

  const invoiceColumns: ColumnDef<Invoice>[] = [
    {
      key: "invoiceNumber",
      label: "Invoice #",
      render: (_, row) => (
        <button
          className="font-medium text-primary underline-offset-4 hover:underline"
          onClick={(e) => {
            e.stopPropagation()
            router.push(`/invoices/${row.id}`)
          }}
        >
          {row.invoiceNumber}
        </button>
      ),
    },
    {
      key: "customer",
      label: "Customer",
      filterable: true,
      sortValue: (row) => row.customer.name,
      filterValue: (row) => row.customer.name,
      render: (_, row) => row.customer.name,
    },
    {
      key: "issueDate",
      label: "Date",
      sortValue: (row) => new Date(row.issueDate).getTime(),
      render: (_, row) => (
        <span className="whitespace-nowrap">{formatDate(row.issueDate)}</span>
      ),
    },
    {
      key: "dueDate",
      label: "Due Date",
      sortValue: (row) =>
        row.dueDate ? new Date(row.dueDate).getTime() : 0,
      render: (_, row) =>
        row.dueDate ? (
          <span className="whitespace-nowrap">{formatDate(row.dueDate)}</span>
        ) : (
          <span className="text-muted-foreground">&mdash;</span>
        ),
    },
    {
      key: "status",
      label: "Status",
      filterable: true,
      filterValue: (row) => {
        switch (row.status) {
          case "DRAFT": return "Draft"
          case "SENT": return "Sent"
          case "PAID": return "Paid"
          case "CANCELLED": return "Cancelled"
          default: return row.status
        }
      },
      render: (_, row) => getStatusBadge(row.status),
    },
    {
      key: "_count",
      label: "Items",
      sortValue: (row) => row._count.items,
      render: (_, row) => row._count.items,
    },
    {
      key: "total",
      label: "Total",
      className: "text-right",
      sortValue: (row) => Number(row.total),
      render: (_, row) => (
        <span className="whitespace-nowrap">{formatCurrency(row.total)}</span>
      ),
    },
    {
      key: "amountPaid",
      label: "Paid",
      className: "text-right",
      sortValue: (row) => Number(row.amountPaid),
      render: (_, row) => (
        <span className="whitespace-nowrap">
          {formatCurrency(row.amountPaid)}
        </span>
      ),
    },
    {
      key: "_actions",
      label: "",
      pinned: true,
      className: "w-12",
      render: (_, invoice) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
              <span className="sr-only">Actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                router.push(`/invoices/${invoice.id}`)
              }}
            >
              <Eye className="mr-2 size-4" />
              View
            </DropdownMenuItem>
            {invoice.status === "DRAFT" && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  handleEditInvoice(invoice)
                }}
              >
                <Pencil className="mr-2 size-4" />
                Edit
              </DropdownMenuItem>
            )}
            {invoice.status === "DRAFT" && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  handleStatusChange(invoice.id, "SENT")
                }}
              >
                <Send className="mr-2 size-4" />
                Mark as Sent
              </DropdownMenuItem>
            )}
            {invoice.status === "SENT" && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  handleStatusChange(invoice.id, "PAID")
                }}
              >
                <CheckCircle className="mr-2 size-4" />
                Mark as Paid
              </DropdownMenuItem>
            )}
            {invoice.status === "DRAFT" && (
              <DropdownMenuItem
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteClick(invoice)
                }}
              >
                <Trash2 className="mr-2 size-4" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Invoices</h1>
        <Button onClick={handleCreateInvoice}>
          <Plus className="mr-2 size-4" />
          Create Invoice
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable
          storageKey="invoices"
          columns={invoiceColumns}
          data={invoices}
          rowKey="id"
          searchable
          searchPlaceholder="Search by invoice number or customer..."
          onRowClick={(invoice) => router.push(`/invoices/${invoice.id}`)}
          emptyMessage="No invoices yet. Click 'Create Invoice' to get started."
        />
      )}

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
