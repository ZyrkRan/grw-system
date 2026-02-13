"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Plus, MoreHorizontal, Pencil, Trash2, Loader2, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { Badge } from "@/components/ui/badge"
import { DueStatusBadge } from "@/components/ui/due-status-badge"
import { cn } from "@/lib/utils"
import { CustomerDialog } from "@/components/customers/customer-dialog"
import type { DueStatus } from "@/lib/due-date"

interface Customer {
  id: number
  name: string
  phone: string
  email: string | null
  address: string
  serviceInterval: number | null
  isVip: boolean
  _count: {
    serviceLogs: number
  }
  nextDueDate: string | null
  daysUntilDue: number | null
  dueStatus: DueStatus
}

export default function CustomersPage() {
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | undefined>(
    undefined
  )
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)
  const [bulkDeleteTargets, setBulkDeleteTargets] = useState<Customer[]>([])
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  const fetchCustomers = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/customers")
      const result = await res.json()

      if (result.success) {
        setCustomers(result.data)
      }
    } catch (error) {
      console.error("Failed to fetch customers:", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  function handleAddCustomer() {
    setEditingCustomer(undefined)
    setDialogOpen(true)
  }

  function handleEditCustomer(customer: Customer) {
    setEditingCustomer(customer)
    setDialogOpen(true)
  }

  function handleDeleteClick(customer: Customer) {
    setDeleteTarget(customer)
    setDeleteError("")
  }

  async function handleDeleteConfirm() {
    const targets = bulkDeleteTargets.length > 0 ? bulkDeleteTargets : deleteTarget ? [deleteTarget] : []
    if (targets.length === 0) return

    setIsDeleting(true)
    setDeleteError("")

    try {
      const results = await Promise.all(
        targets.map((c) =>
          fetch(`/api/customers/${c.id}`, { method: "DELETE" }).then((r) => r.json())
        )
      )

      const failed = results.filter((r) => !r.success)
      if (failed.length > 0) {
        setDeleteError(`Failed to delete ${failed.length} customer(s).`)
      } else {
        setDeleteTarget(null)
        setBulkDeleteTargets([])
        fetchCustomers()
      }
    } catch {
      setDeleteError("Failed to delete. Please try again.")
    } finally {
      setIsDeleting(false)
    }
  }

  function handleBulkDelete(selected: Customer[], clearSelection: () => void) {
    setBulkDeleteTargets(selected)
    bulkClearRef.current = clearSelection
    setDeleteError("")
  }

  const bulkClearRef = useRef<(() => void) | null>(null)

  function handleDialogSuccess() {
    fetchCustomers()
  }

  async function toggleVip(customer: Customer) {
    const newVip = !customer.isVip
    // Optimistic update
    setCustomers((prev) =>
      prev.map((c) => (c.id === customer.id ? { ...c, isVip: newVip } : c))
    )
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isVip: newVip }),
      })
      const result = await res.json()
      if (!result.success) {
        // Revert on failure
        setCustomers((prev) =>
          prev.map((c) => (c.id === customer.id ? { ...c, isVip: !newVip } : c))
        )
      }
    } catch {
      // Revert on error
      setCustomers((prev) =>
        prev.map((c) => (c.id === customer.id ? { ...c, isVip: !newVip } : c))
      )
    }
  }

  const intervalOptions = [
    { value: 14, label: "2 Weeks" },
    { value: 21, label: "3 Weeks" },
    { value: 28, label: "Monthly" },
  ] as const

  async function setInterval(customer: Customer, interval: number | null) {
    const prev = { serviceInterval: customer.serviceInterval, daysUntilDue: customer.daysUntilDue, dueStatus: customer.dueStatus, nextDueDate: customer.nextDueDate }
    setCustomers((cs) =>
      cs.map((c) => (c.id === customer.id ? { ...c, serviceInterval: interval } : c))
    )
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceInterval: interval }),
      })
      const result = await res.json()
      if (result.success) {
        const { daysUntilDue, dueStatus, nextDueDate } = result.data
        setCustomers((cs) =>
          cs.map((c) => (c.id === customer.id ? { ...c, daysUntilDue, dueStatus, nextDueDate } : c))
        )
      } else {
        setCustomers((cs) =>
          cs.map((c) => (c.id === customer.id ? { ...c, ...prev } : c))
        )
      }
    } catch {
      setCustomers((cs) =>
        cs.map((c) => (c.id === customer.id ? { ...c, ...prev } : c))
      )
    }
  }

  const customerColumns: ColumnDef<Customer>[] = [
    {
      key: "isVip",
      label: "",
      pinnedStart: true,
      sortValue: (row) => (row.isVip ? 1 : 0),
      className: "w-10 px-0 text-center",
      render: (_, customer) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            toggleVip(customer)
          }}
          className="inline-flex items-center justify-center"
          aria-label={customer.isVip ? "Remove VIP status" : "Set as VIP"}
        >
          <Star
            className={cn(
              "size-4 transition-colors",
              customer.isVip
                ? "fill-yellow-400 text-yellow-400"
                : "text-muted-foreground/40 hover:text-yellow-400/60"
            )}
          />
        </button>
      ),
    },
    {
      key: "name",
      label: "Name",
      render: (v) => (
        <span className="font-medium">{v as string}</span>
      ),
    },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email", render: (v) => (v as string) || <span className="text-muted-foreground">--</span> },
    { key: "address", label: "Address", render: (v) => <span className="max-w-48 truncate block">{v as string}</span> },
    {
      key: "serviceInterval",
      label: "Interval",
      filterable: true,
      filterValue: (row) => {
        const m = intervalOptions.find((o) => o.value === row.serviceInterval)
        return m ? m.label : "None"
      },
      render: (_, customer) => {
        const match = intervalOptions.find((o) => o.value === customer.serviceInterval)
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              {match ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "cursor-pointer",
                    match.value === 14 && "border-blue-500 text-blue-600 hover:bg-blue-500/10",
                    match.value === 21 && "border-violet-500 text-violet-600 hover:bg-violet-500/10",
                    match.value === 28 && "border-emerald-500 text-emerald-600 hover:bg-emerald-500/10",
                  )}
                >
                  {match.label}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="cursor-pointer text-muted-foreground hover:bg-accent"
                >
                  None
                </Badge>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
              {intervalOptions.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  className={cn(customer.serviceInterval === opt.value && "font-medium")}
                  onClick={() => setInterval(customer, opt.value)}
                >
                  {opt.label}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {opt.value} days
                  </span>
                </DropdownMenuItem>
              ))}
              {customer.serviceInterval && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setInterval(customer, null)}
                >
                  Remove
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
    {
      key: "dueStatus",
      label: "Status",
      filterable: true,
      filterValue: (row) => {
        switch (row.dueStatus) {
          case "late": return "Late"
          case "due-today": return "Due Today"
          case "due-soon": return "Due Soon"
          case "on-track": return "On Track"
          default: return "No Schedule"
        }
      },
      sortValue: (row) => row.daysUntilDue ?? 999999,
      render: (_, row) => (
        <DueStatusBadge daysUntilDue={row.daysUntilDue} dueStatus={row.dueStatus} />
      ),
    },
    {
      key: "_count",
      label: "Services",
      sortValue: (row) => row._count.serviceLogs,
      render: (_, row) => row._count.serviceLogs,
    },
    {
      key: "_actions",
      label: "",
      pinned: true,
      className: "w-12",
      render: (_, customer) => (
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
                handleEditCustomer(customer)
              }}
            >
              <Pencil className="mr-2 size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation()
                handleDeleteClick(customer)
              }}
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
        <h1 className="text-3xl font-bold">Customers</h1>
        <Button onClick={handleAddCustomer}>
          <Plus className="mr-2 size-4" />
          Add Customer
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable
          storageKey="customers"
          columns={customerColumns}
          data={customers}
          rowKey="id"
          searchable
          searchPlaceholder="Search by name, phone, or address..."
          selectable
          onRowClick={(customer) => router.push(`/customers/${customer.id}`)}
          renderBulkActions={(selected, clearSelection) => (
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => handleBulkDelete(selected, clearSelection)}
            >
              <Trash2 className="size-4" />
              Delete ({selected.length})
            </Button>
          )}
          emptyMessage="No customers yet. Click 'Add Customer' to get started."
        />
      )}

      <CustomerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        customer={editingCustomer}
        onSuccess={handleDialogSuccess}
      />

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
                ? `Delete ${bulkDeleteTargets.length} Customers`
                : "Delete Customer"}
            </DialogTitle>
            <DialogDescription>
              {bulkDeleteTargets.length > 1 ? (
                <>
                  Are you sure you want to delete{" "}
                  <strong>{bulkDeleteTargets.length} customers</strong>? This
                  action cannot be undone.
                </>
              ) : (
                <>
                  Are you sure you want to delete{" "}
                  <strong>{deleteTarget?.name}</strong>? This action cannot be
                  undone.
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
              onClick={() => {
                handleDeleteConfirm().then(() => {
                  bulkClearRef.current?.()
                  bulkClearRef.current = null
                })
              }}
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
