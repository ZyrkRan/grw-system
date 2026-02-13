"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Plus, MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react"
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
import { RouteDialog } from "@/components/routes/route-dialog"

interface Route {
  id: number
  name: string
  description: string | null
  color: string | null
  date: string | null
  customerNames: string[]
  estimatedRevenue: number
  _count: {
    customers: number
  }
}

export default function RoutesPage() {
  const router = useRouter()
  const [routes, setRoutes] = useState<Route[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRoute, setEditingRoute] = useState<Route | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<Route | null>(null)
  const [bulkDeleteTargets, setBulkDeleteTargets] = useState<Route[]>([])
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  const bulkClearRef = useRef<(() => void) | null>(null)

  const fetchRoutes = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/routes")
      const result = await res.json()
      if (result.success) {
        setRoutes(result.data)
      }
    } catch (error) {
      console.error("Failed to fetch routes:", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRoutes()
  }, [fetchRoutes])

  function handleAddRoute() {
    setEditingRoute(undefined)
    setDialogOpen(true)
  }

  function handleEditRoute(route: Route) {
    setEditingRoute(route)
    setDialogOpen(true)
  }

  function handleDeleteClick(route: Route) {
    setDeleteTarget(route)
    setDeleteError("")
  }

  async function handleDeleteConfirm() {
    const targets =
      bulkDeleteTargets.length > 0
        ? bulkDeleteTargets
        : deleteTarget
          ? [deleteTarget]
          : []
    if (targets.length === 0) return

    setIsDeleting(true)
    setDeleteError("")

    try {
      const results = await Promise.all(
        targets.map((r) =>
          fetch(`/api/routes/${r.id}`, { method: "DELETE" }).then((res) =>
            res.json()
          )
        )
      )

      const failed = results.filter((r) => !r.success)
      if (failed.length > 0) {
        setDeleteError(`Failed to delete ${failed.length} route(s).`)
      } else {
        setDeleteTarget(null)
        setBulkDeleteTargets([])
        bulkClearRef.current?.()
        bulkClearRef.current = null
        fetchRoutes()
      }
    } catch {
      setDeleteError("Failed to delete. Please try again.")
    } finally {
      setIsDeleting(false)
    }
  }

  function handleBulkDelete(selected: Route[], clearSelection: () => void) {
    setBulkDeleteTargets(selected)
    bulkClearRef.current = clearSelection
    setDeleteError("")
  }

  const routeColumns: ColumnDef<Route>[] = [
    {
      key: "color",
      label: "",
      pinnedStart: true,
      className: "w-10 px-0 text-center",
      render: (_, route) =>
        route.color ? (
          <span
            className="inline-block size-3 rounded-full"
            style={{ backgroundColor: route.color }}
          />
        ) : (
          <span className="inline-block size-3 rounded-full bg-muted" />
        ),
    },
    {
      key: "name",
      label: "Name",
      searchValue: (row) => `${row.name} ${row.customerNames.join(" ")}`,
      render: (_, route) => (
        <div>
          <span className="font-medium">{route.name}</span>
          {route.customerNames.length > 0 && (
            <p className="text-xs text-foreground/50 truncate max-w-64">
              {route.customerNames.join(", ")}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "description",
      label: "Description",
      render: (v) =>
        v ? (
          <span className="max-w-48 truncate block">{v as string}</span>
        ) : (
          <span className="text-muted-foreground">--</span>
        ),
    },
    {
      key: "date",
      label: "Date",
      sortValue: (row) => (row.date ? new Date(row.date).getTime() : 0),
      render: (_, route) =>
        route.date ? (
          new Date(route.date).toLocaleDateString()
        ) : (
          <Badge variant="secondary" className="text-xs">
            Template
          </Badge>
        ),
    },
    {
      key: "_count",
      label: "Customers",
      sortValue: (row) => row._count.customers,
      render: (_, row) => row._count.customers,
    },
    {
      key: "estimatedRevenue",
      label: "Est. Revenue",
      sortValue: (row) => row.estimatedRevenue,
      render: (_, row) =>
        row.estimatedRevenue > 0 ? (
          <span>~${row.estimatedRevenue.toFixed(2)}</span>
        ) : (
          <span className="text-muted-foreground">--</span>
        ),
    },
    {
      key: "_actions",
      label: "",
      pinned: true,
      className: "w-12",
      render: (_, route) => (
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
                handleEditRoute(route)
              }}
            >
              <Pencil className="mr-2 size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation()
                handleDeleteClick(route)
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
        <h1 className="text-3xl font-bold">Routes</h1>
        <Button onClick={handleAddRoute}>
          <Plus className="mr-2 size-4" />
          Add Route
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable
          storageKey="routes"
          columns={routeColumns}
          data={routes}
          rowKey="id"
          searchable
          searchPlaceholder="Search by name or description..."
          selectable
          onRowClick={(route) => router.push(`/routes/${route.id}`)}
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
          emptyMessage="No routes yet. Click 'Add Route' to get started."
        />
      )}

      <RouteDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        route={editingRoute}
        onSuccess={fetchRoutes}
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
                ? `Delete ${bulkDeleteTargets.length} Routes`
                : "Delete Route"}
            </DialogTitle>
            <DialogDescription>
              {bulkDeleteTargets.length > 1 ? (
                <>
                  Are you sure you want to delete{" "}
                  <strong>{bulkDeleteTargets.length} routes</strong>? This action
                  cannot be undone.
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
