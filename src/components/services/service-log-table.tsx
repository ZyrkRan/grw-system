"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
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
import { ServiceFormDialog } from "@/components/services/service-form-dialog"
import { ServiceDetailDialog } from "@/components/services/service-detail-dialog"

interface Customer {
  id: number
  name: string
}

interface ServiceType {
  id: number
  name: string
  color: string | null
}

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
  const [customers, setCustomers] = useState<Customer[]>([])
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState("")
  const [filterCustomerId, setFilterCustomerId] = useState("")
  const [filterServiceTypeId, setFilterServiceTypeId] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [filterPaymentStatus, setFilterPaymentStatus] = useState("")
  const [filterDateFrom, setFilterDateFrom] = useState("")
  const [filterDateTo, setFilterDateTo] = useState("")

  // Dialogs
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [editingService, setEditingService] = useState<ServiceLog | undefined>(
    undefined
  )
  const [detailService, setDetailService] = useState<ServiceLog | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ServiceLog | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch dropdown data on mount
  useEffect(() => {
    Promise.all([
      fetch("/api/customers").then((r) => r.json()),
      fetch("/api/service-types").then((r) => r.json()),
    ])
      .then(([custResult, stResult]) => {
        if (custResult.success) setCustomers(custResult.data)
        if (stResult.success) setServiceTypes(stResult.data)
      })
      .catch((err) => console.error("Failed to load filter data:", err))
  }, [])

  const fetchServices = useCallback(
    async (searchTerm: string) => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams()
        if (searchTerm) params.set("search", searchTerm)
        if (filterCustomerId) params.set("customerId", filterCustomerId)
        if (filterServiceTypeId)
          params.set("serviceTypeId", filterServiceTypeId)
        if (filterStatus) params.set("status", filterStatus)
        if (filterPaymentStatus)
          params.set("paymentStatus", filterPaymentStatus)
        if (filterDateFrom) params.set("dateFrom", filterDateFrom)
        if (filterDateTo) params.set("dateTo", filterDateTo)

        const res = await fetch(`/api/services?${params.toString()}`)
        const result = await res.json()

        if (result.success) {
          setServices(result.data)
        }
      } catch (error) {
        console.error("Failed to fetch services:", error)
      } finally {
        setIsLoading(false)
      }
    },
    [
      filterCustomerId,
      filterServiceTypeId,
      filterStatus,
      filterPaymentStatus,
      filterDateFrom,
      filterDateTo,
    ]
  )

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchServices(search)
  }, [fetchServices]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearchChange(value: string) {
    setSearch(value)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      fetchServices(value)
    }, 300)
  }

  function handleFilterChange() {
    // Triggers re-fetch via useEffect on dependency change
  }

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
        fetchServices(search)
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
    fetchServices(search)
  }

  // Use void to suppress the lint warning for the unused function
  void handleFilterChange

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Service Log</h2>
        <Button onClick={handleAddService}>
          <Plus className="mr-2 size-4" />
          Add Service
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative w-full">
          <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search services..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={filterCustomerId} onValueChange={setFilterCustomerId}>
          <SelectTrigger className="w-full">
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

        <Select
          value={filterServiceTypeId}
          onValueChange={setFilterServiceTypeId}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {serviceTypes.map((st) => (
              <SelectItem key={st.id} value={String(st.id)}>
                {st.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="COMPLETE">Complete</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filterPaymentStatus}
          onValueChange={setFilterPaymentStatus}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All Payment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payment</SelectItem>
            <SelectItem value="UNPAID">Unpaid</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 w-full">
          <Input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            className="w-full"
            placeholder="From"
          />
          <span className="text-muted-foreground text-sm">to</span>
          <Input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            className="w-full"
            placeholder="To"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead>Duration</TableHead>
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
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-14" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-14" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-8" />
                  </TableCell>
                </TableRow>
              ))
            ) : services.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center">
                  {search ||
                  filterCustomerId ||
                  filterServiceTypeId ||
                  filterStatus ||
                  filterPaymentStatus ||
                  filterDateFrom ||
                  filterDateTo
                    ? "No services match your filters. Try adjusting your search criteria."
                    : "No services yet. Click 'Add Service' to log your first service."}
                </TableCell>
              </TableRow>
            ) : (
              services.map((service) => (
                <TableRow key={service.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(service.serviceDate)}
                  </TableCell>
                  <TableCell className="font-medium">
                    {service.customer.name}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      {service.serviceType?.color && (
                        <span
                          className="inline-block size-2.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor: service.serviceType.color,
                          }}
                        />
                      )}
                      {service.serviceName}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        service.status === "COMPLETE" ? "default" : "outline"
                      }
                      className={
                        service.status === "COMPLETE"
                          ? "bg-green-600 text-white"
                          : "border-amber-500 text-amber-600"
                      }
                    >
                      {service.status === "COMPLETE" ? "Complete" : "Pending"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        service.paymentStatus === "PAID"
                          ? "default"
                          : "destructive"
                      }
                      className={
                        service.paymentStatus === "PAID"
                          ? "bg-green-600 text-white"
                          : ""
                      }
                    >
                      {service.paymentStatus === "PAID" ? "Paid" : "Unpaid"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {formatCurrency(service.priceCharged)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {formatCurrency(service.amountPaid)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDuration(service.totalDurationMinutes)}
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
                          onClick={() => handleViewService(service)}
                        >
                          <Eye className="mr-2 size-4" />
                          View
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleEditService(service)}
                        >
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
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
