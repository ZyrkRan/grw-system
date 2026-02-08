"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Plus,
  ChevronUp,
  ChevronDown,
  Pencil,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ServiceTypeDialog } from "@/components/services/service-type-dialog"
import { LucideIcon } from "@/components/ui/lucide-icon"

interface ServiceType {
  id: number
  name: string
  slug: string
  description: string | null
  icon: string | null
  position: number
  _count: {
    serviceLogs: number
  }
}

export function ServiceTypes() {
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingType, setEditingType] = useState<ServiceType | undefined>(
    undefined
  )
  const [deleteTarget, setDeleteTarget] = useState<ServiceType | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [isReordering, setIsReordering] = useState(false)

  const fetchServiceTypes = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/service-types")
      const result = await res.json()
      if (result.success) {
        setServiceTypes(result.data)
      }
    } catch (error) {
      console.error("Failed to fetch service types:", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchServiceTypes()
  }, [fetchServiceTypes])

  function handleAdd() {
    setEditingType(undefined)
    setDialogOpen(true)
  }

  function handleEdit(st: ServiceType) {
    setEditingType(st)
    setDialogOpen(true)
  }

  function handleDeleteClick(st: ServiceType) {
    setDeleteTarget(st)
    setDeleteError("")
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setIsDeleting(true)
    setDeleteError("")

    try {
      const res = await fetch(`/api/service-types/${deleteTarget.id}`, {
        method: "DELETE",
      })
      const result = await res.json()

      if (result.success) {
        setDeleteTarget(null)
        fetchServiceTypes()
      } else {
        setDeleteError(result.error || "Failed to delete service type.")
      }
    } catch {
      setDeleteError("Failed to delete service type. Please try again.")
    } finally {
      setIsDeleting(false)
    }
  }

  async function handleReorder(id: number, direction: "up" | "down") {
    const currentIndex = serviceTypes.findIndex((st) => st.id === id)
    if (currentIndex === -1) return
    if (direction === "up" && currentIndex === 0) return
    if (direction === "down" && currentIndex === serviceTypes.length - 1) return

    const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1

    // Optimistically reorder in UI
    const newTypes = [...serviceTypes]
    const temp = newTypes[currentIndex]
    newTypes[currentIndex] = newTypes[swapIndex]
    newTypes[swapIndex] = temp
    setServiceTypes(newTypes)

    setIsReordering(true)
    try {
      const items = newTypes.map((st, index) => ({
        id: st.id,
        position: index,
      }))

      const res = await fetch("/api/service-types/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      })

      const result = await res.json()
      if (!result.success) {
        // Revert on failure
        fetchServiceTypes()
      }
    } catch {
      fetchServiceTypes()
    } finally {
      setIsReordering(false)
    }
  }

  function handleDialogSuccess() {
    fetchServiceTypes()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Service Types</h2>
        <Button onClick={handleAdd}>
          <Plus className="mr-2 size-4" />
          Add Service Type
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-md border p-4"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="size-4 rounded-full" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Skeleton className="h-8 w-8" />
                <Skeleton className="h-8 w-8" />
                <Skeleton className="h-8 w-8" />
                <Skeleton className="h-8 w-8" />
              </div>
            </div>
          ))}
        </div>
      ) : serviceTypes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12">
          <p className="text-muted-foreground mb-4">
            No service types yet. Create your first one to categorize services.
          </p>
          <Button variant="outline" onClick={handleAdd}>
            <Plus className="mr-2 size-4" />
            Add Service Type
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {serviceTypes.map((st, index) => (
            <div
              key={st.id}
              className="flex items-center justify-between rounded-md border px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                {st.icon ? (
                  <LucideIcon
                    name={st.icon}
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                ) : (
                  <span className="inline-block size-4 shrink-0 rounded-full bg-muted-foreground/40" />
                )}
                <div className="min-w-0">
                  <div className="font-medium">{st.name}</div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {st.description && (
                      <span className="truncate max-w-[300px]">
                        {st.description}
                      </span>
                    )}
                    <span className="shrink-0">
                      {st._count.serviceLogs}{" "}
                      {st._count.serviceLogs === 1 ? "service" : "services"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  disabled={index === 0 || isReordering}
                  onClick={() => handleReorder(st.id, "up")}
                >
                  <ChevronUp className="size-4" />
                  <span className="sr-only">Move up</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  disabled={
                    index === serviceTypes.length - 1 || isReordering
                  }
                  onClick={() => handleReorder(st.id, "down")}
                >
                  <ChevronDown className="size-4" />
                  <span className="sr-only">Move down</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => handleEdit(st)}
                >
                  <Pencil className="size-4" />
                  <span className="sr-only">Edit</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive hover:text-destructive"
                  onClick={() => handleDeleteClick(st)}
                >
                  <Trash2 className="size-4" />
                  <span className="sr-only">Delete</span>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ServiceTypeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        serviceType={editingType}
        onSuccess={handleDialogSuccess}
      />

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Service Type</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <strong>{deleteTarget?.name}</strong>? This will not delete
              associated service logs, but they will no longer be categorized.
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
