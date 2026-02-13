"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Plus, MoreHorizontal, Pencil, Trash2, Loader2, Star, Check, Route as RouteIcon, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { Badge } from "@/components/ui/badge"
import { DueStatusBadge } from "@/components/ui/due-status-badge"
import { cn } from "@/lib/utils"
import { CustomerDialog } from "@/components/customers/customer-dialog"
import { ServiceFormDialog } from "@/components/services/service-form-dialog"
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
  routes: { id: number; name: string; color: string | null }[]
  lastService: {
    serviceName: string
    priceCharged: number
    serviceTypeId: number | null
    serviceType: { id: number; name: string; icon: string | null } | null
  } | null
}

interface RouteOption {
  id: number
  name: string
  color: string | null
}

export default function CustomersPage() {
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [allRoutes, setAllRoutes] = useState<RouteOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | undefined>(
    undefined
  )
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)
  const [bulkDeleteTargets, setBulkDeleteTargets] = useState<Customer[]>([])
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false)
  const [quickAddService, setQuickAddService] = useState<
    { customerId: number; serviceTypeId: number | null; serviceName: string; serviceDate: string; priceCharged: number | string; notes: null; status: string; paymentStatus: string; amountPaid: null; paymentDate: null } | undefined
  >(undefined)

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

  const fetchRoutes = useCallback(async () => {
    try {
      const res = await fetch("/api/routes")
      const result = await res.json()
      if (result.success) {
        setAllRoutes(result.data.map((r: RouteOption) => ({ id: r.id, name: r.name, color: r.color })))
      }
    } catch {
      console.error("Failed to fetch routes")
    }
  }, [])

  useEffect(() => {
    fetchCustomers()
    fetchRoutes()
  }, [fetchCustomers, fetchRoutes])

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

  function handleQuickAdd(customer: Customer) {
    const ls = customer.lastService
    setQuickAddService({
      customerId: customer.id,
      serviceTypeId: ls?.serviceTypeId ?? null,
      serviceName: ls?.serviceName ?? "",
      serviceDate: new Date().toISOString(),
      priceCharged: ls ? ls.priceCharged : "",
      notes: null,
      status: "PENDING",
      paymentStatus: "UNPAID",
      amountPaid: null,
      paymentDate: null,
    })
    setServiceDialogOpen(true)
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

  async function toggleRoute(customer: Customer, route: RouteOption) {
    const isAssigned = customer.routes.some((r) => r.id === route.id)
    const prevRoutes = customer.routes

    // Optimistic update
    setCustomers((cs) =>
      cs.map((c) =>
        c.id === customer.id
          ? {
              ...c,
              routes: isAssigned
                ? c.routes.filter((r) => r.id !== route.id)
                : [...c.routes, { id: route.id, name: route.name, color: route.color }],
            }
          : c
      )
    )

    try {
      const res = isAssigned
        ? await fetch(`/api/routes/${route.id}/customers/${customer.id}`, { method: "DELETE" })
        : await fetch(`/api/routes/${route.id}/customers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ customerId: customer.id }),
          })
      const result = await res.json()
      if (!result.success) {
        setCustomers((cs) =>
          cs.map((c) => (c.id === customer.id ? { ...c, routes: prevRoutes } : c))
        )
      }
    } catch {
      setCustomers((cs) =>
        cs.map((c) => (c.id === customer.id ? { ...c, routes: prevRoutes } : c))
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
      render: (_, customer) => (
        <div className="min-w-0">
          <span className="font-medium">{customer.name}</span>
          <p className="text-xs text-muted-foreground truncate max-w-64">{customer.address}</p>
        </div>
      ),
    },
    {
      key: "routes",
      label: "Routes",
      filterable: true,
      filterValue: (row) => row.routes.length > 0 ? row.routes.map((r) => r.name).join(", ") : "None",
      render: (_, customer) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            {customer.routes.length > 0 ? (
              <button type="button" className="flex items-center gap-1.5 flex-wrap cursor-pointer hover:opacity-80 transition-opacity">
                {customer.routes.map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium w-32 bg-secondary text-secondary-foreground border border-foreground/10 dark:border-foreground/15"
                  >
                    <RouteIcon className="size-3 shrink-0" style={r.color ? { color: r.color } : undefined} />
                    <span className="truncate">{r.name}</span>
                  </span>
                ))}
              </button>
            ) : (
              <button type="button" className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">No route</button>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
            {allRoutes.length === 0 ? (
              <DropdownMenuItem disabled>No routes available</DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem
                  onClick={() => customer.routes.forEach((r) => toggleRoute(customer, r))}
                  disabled={customer.routes.length === 0}
                >
                  <span className="flex items-center gap-2 w-full">
                    <span className="flex-1 text-muted-foreground">No route</span>
                    {customer.routes.length === 0 && <Check className="size-4 text-primary" />}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {allRoutes.map((route) => {
                  const isAssigned = customer.routes.some((r) => r.id === route.id)
                  return (
                    <DropdownMenuItem
                      key={route.id}
                      onClick={() => toggleRoute(customer, route)}
                    >
                      <span className="flex items-center gap-2 w-full">
                        <span
                          className="inline-block size-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: route.color || "var(--muted)" }}
                        />
                        <span className="flex-1">{route.name}</span>
                        {isAssigned && <Check className="size-4 text-primary" />}
                      </span>
                    </DropdownMenuItem>
                  )
                })}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
    { key: "phone", label: "Phone", render: (v) => <span className="tabular-nums">{v as string}</span> },
    { key: "email", label: "Email", render: (v) => (v as string) || <span className="text-muted-foreground">--</span> },
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
                <button type="button" className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors">--</button>
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
      render: (_, row) => (
        <Badge variant="secondary">{row._count.serviceLogs}</Badge>
      ),
    },
    {
      key: "_actions",
      label: "",
      pinned: true,
      className: "w-20",
      render: (_, customer) => (
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={(e) => {
              e.stopPropagation()
              handleQuickAdd(customer)
            }}
            title="Quick-add service"
          >
            <Zap className="size-4" />
            <span className="sr-only">Quick-add service</span>
          </Button>
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
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl sm:text-3xl font-bold">Customers</h1>
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

      <ServiceFormDialog
        open={serviceDialogOpen}
        onOpenChange={setServiceDialogOpen}
        service={quickAddService}
        onSuccess={fetchCustomers}
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
