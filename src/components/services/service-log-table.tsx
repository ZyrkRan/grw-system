"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
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
import { ServiceFormDialog } from "@/components/services/service-form-dialog"
import { ServiceDetailDialog } from "@/components/services/service-detail-dialog"

interface ServiceLog {
  id: number
  customerId: number
  serviceName: string
  serviceDate: string
  priceCharged: number | string
  notes: string | null
  status: string
  paymentStatus: string
  amountPaid: number | string | null
  paymentDate: string | null
  serviceTypeId: number | null
  totalDurationMinutes: number | null
  customer: { id: number; name: string }
  serviceType: { id: number; name: string; color: string | null } | null
  timeEntries: Array<{
    id: number
    date: string
    durationMinutes: number
    description: string | null
  }>
  _count: { timeEntries: number }
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

function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "\u2014"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`
}

export function ServiceLogTable() {
  const [services, setServices] = useState<ServiceLog[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Dialogs
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [editingService, setEditingService] = useState<ServiceLog | undefined>(
    undefined
  )
  const [detailService, setDetailService] = useState<ServiceLog | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ServiceLog | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  const fetchServices = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/services")
      const result = await res.json()

      if (result.success) {
        setServices(result.data)
      }
    } catch (error) {
      console.error("Failed to fetch services:", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchServices()
  }, [fetchServices])

  function handleAddService() {
    setEditingService(undefined)
    setFormDialogOpen(true)
  }

  function handleEditService(service: ServiceLog) {
    setEditingService(service)
    setFormDialogOpen(true)
  }

  function handleViewService(service: ServiceLog) {
    setDetailService(service)
  }

  function handleDeleteClick(service: ServiceLog) {
    setDeleteTarget(service)
    setDeleteError("")
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setIsDeleting(true)
    setDeleteError("")

    try {
      const res = await fetch(`/api/services/${deleteTarget.id}`, {
        method: "DELETE",
      })
      const result = await res.json()

      if (result.success) {
        setDeleteTarget(null)
        fetchServices()
      } else {
        setDeleteError(result.error || "Failed to delete service.")
      }
    } catch {
      setDeleteError("Failed to delete service. Please try again.")
    } finally {
      setIsDeleting(false)
    }
  }

  function handleFormSuccess() {
    fetchServices()
  }

  const serviceColumns: ColumnDef<ServiceLog>[] = [
    {
      key: "serviceDate",
      label: "Date",
      sortValue: (row) => new Date(row.serviceDate).getTime(),
      render: (_, row) => (
        <span className="whitespace-nowrap">{formatDate(row.serviceDate)}</span>
      ),
    },
    {
      key: "customer",
      label: "Customer",
      filterable: true,
      sortValue: (row) => row.customer.name,
      filterValue: (row) => row.customer.name,
      render: (_, row) => (
        <span className="font-medium">{row.customer.name}</span>
      ),
    },
    {
      key: "serviceName",
      label: "Service",
      render: (_, row) => (
        <span className="flex items-center gap-2">
          {row.serviceType?.color && (
            <span
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: row.serviceType.color }}
            />
          )}
          {row.serviceName}
        </span>
      ),
    },
    {
      key: "serviceType",
      label: "Type",
      filterable: true,
      filterValue: (row) => row.serviceType?.name ?? "None",
      visible: false,
      render: () => null,
    },
    {
      key: "status",
      label: "Status",
      filterable: true,
      filterValue: (row) => (row.status === "COMPLETE" ? "Complete" : "Pending"),
      render: (_, row) => (
        <Badge
          variant={row.status === "COMPLETE" ? "default" : "outline"}
          className={
            row.status === "COMPLETE"
              ? "bg-green-600 text-white"
              : "border-amber-500 text-amber-600"
          }
        >
          {row.status === "COMPLETE" ? "Complete" : "Pending"}
        </Badge>
      ),
    },
    {
      key: "paymentStatus",
      label: "Payment",
      filterable: true,
      filterValue: (row) =>
        row.paymentStatus === "PAID" ? "Paid" : "Unpaid",
      render: (_, row) => (
        <Badge
          variant={row.paymentStatus === "PAID" ? "default" : "destructive"}
          className={
            row.paymentStatus === "PAID" ? "bg-green-600 text-white" : ""
          }
        >
          {row.paymentStatus === "PAID" ? "Paid" : "Unpaid"}
        </Badge>
      ),
    },
    {
      key: "priceCharged",
      label: "Price",
      className: "text-right",
      sortValue: (row) => Number(row.priceCharged),
      render: (_, row) => (
        <span className="whitespace-nowrap">
          {formatCurrency(row.priceCharged)}
        </span>
      ),
    },
    {
      key: "amountPaid",
      label: "Paid",
      className: "text-right",
      sortValue: (row) => Number(row.amountPaid ?? 0),
      render: (_, row) => (
        <span className="whitespace-nowrap">
          {formatCurrency(row.amountPaid)}
        </span>
      ),
    },
    {
      key: "totalDurationMinutes",
      label: "Duration",
      sortValue: (row) => row.totalDurationMinutes ?? 0,
      render: (_, row) => (
        <span className="whitespace-nowrap">
          {formatDuration(row.totalDurationMinutes)}
        </span>
      ),
    },
    {
      key: "_actions",
      label: "",
      pinned: true,
      className: "w-12",
      render: (_, service) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontal className="size-4" />
              <span className="sr-only">Actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleViewService(service)}>
              <Eye className="mr-2 size-4" />
              View
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleEditService(service)}>
              <Pencil className="mr-2 size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => handleDeleteClick(service)}
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
        <h2 className="text-xl font-semibold">Service Log</h2>
        <Button onClick={handleAddService}>
          <Plus className="mr-2 size-4" />
          Add Service
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable
          storageKey="service-log"
          columns={serviceColumns}
          data={services}
          rowKey="id"
          searchable
          searchPlaceholder="Search by service name or customer..."
          emptyMessage="No services yet. Click 'Add Service' to log your first service."
        />
      )}

      {/* Form Dialog */}
      <ServiceFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        service={editingService}
        onSuccess={handleFormSuccess}
      />

      {/* Detail Dialog */}
      <ServiceDetailDialog
        open={!!detailService}
        onOpenChange={(open) => {
          if (!open) setDetailService(null)
        }}
        service={detailService}
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
            <DialogTitle>Delete Service</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the service{" "}
              <strong>{deleteTarget?.serviceName}</strong>? This action cannot
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
