"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Send, CheckCircle, Trash2, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { InvoiceFormDialog } from "@/components/invoices/invoice-form-dialog"

interface InvoiceForActions {
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
  items: Array<{
    id: number
    description: string
    serviceDate: string
    quantity: number | string
    rate: number | string
    amount: number | string
    serviceLogId: number | null
  }>
}

interface InvoiceActionsProps {
  invoice: InvoiceForActions
}

export function InvoiceActions({ invoice }: InvoiceActionsProps) {
  const router = useRouter()
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  async function handleStatusChange(newStatus: string) {
    setIsUpdating(true)
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      const result = await res.json()

      if (result.success) {
        router.refresh()
      }
    } catch (error) {
      console.error("Failed to update invoice status:", error)
    } finally {
      setIsUpdating(false)
    }
  }

  async function handleDelete() {
    setIsDeleting(true)
    setDeleteError("")

    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: "DELETE",
      })
      const result = await res.json()

      if (result.success) {
        router.push("/invoices")
      } else {
        setDeleteError(result.error || "Failed to delete invoice.")
      }
    } catch {
      setDeleteError("Failed to delete invoice. Please try again.")
    } finally {
      setIsDeleting(false)
    }
  }

  function handlePrint() {
    window.print()
  }

  function handleFormSuccess() {
    router.refresh()
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 print:hidden">
        {invoice.status === "DRAFT" && (
          <Button
            variant="outline"
            onClick={() => setFormDialogOpen(true)}
          >
            <Pencil className="mr-2 size-4" />
            Edit
          </Button>
        )}
        {invoice.status === "DRAFT" && (
          <Button
            variant="outline"
            onClick={() => handleStatusChange("SENT")}
            disabled={isUpdating}
          >
            <Send className="mr-2 size-4" />
            Mark as Sent
          </Button>
        )}
        {invoice.status === "SENT" && (
          <Button
            variant="outline"
            onClick={() => handleStatusChange("PAID")}
            disabled={isUpdating}
          >
            <CheckCircle className="mr-2 size-4" />
            Mark as Paid
          </Button>
        )}
        <Button variant="outline" onClick={handlePrint}>
          <Printer className="mr-2 size-4" />
          Print
        </Button>
        {invoice.status === "DRAFT" && (
          <Button
            variant="destructive"
            onClick={() => {
              setDeleteDialogOpen(true)
              setDeleteError("")
            }}
          >
            <Trash2 className="mr-2 size-4" />
            Delete
          </Button>
        )}
      </div>

      {/* Edit Dialog */}
      <InvoiceFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        invoice={invoice}
        onSuccess={handleFormSuccess}
      />

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Invoice</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete invoice{" "}
              <strong>{invoice.invoiceNumber}</strong>? This action cannot be
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
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
