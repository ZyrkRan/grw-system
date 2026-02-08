"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { IconPicker } from "@/components/ui/icon-picker"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface ServiceTypeData {
  id?: number
  name: string
  description: string | null
  icon: string | null
}

interface ServiceTypeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  serviceType?: ServiceTypeData
  onSuccess: () => void
}

export function ServiceTypeDialog({
  open,
  onOpenChange,
  serviceType,
  onSuccess,
}: ServiceTypeDialogProps) {
  const isEditing = !!serviceType?.id

  const [name, setName] = useState(serviceType?.name ?? "")
  const [description, setDescription] = useState(
    serviceType?.description ?? ""
  )
  const [icon, setIcon] = useState(serviceType?.icon ?? "")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (open) {
      setName(serviceType?.name ?? "")
      setDescription(serviceType?.description ?? "")
      setIcon(serviceType?.icon ?? "")
      setError("")
    }
  }, [open, serviceType])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!name.trim()) {
      setError("Name is required.")
      return
    }

    setIsSubmitting(true)

    try {
      const url = isEditing
        ? `/api/service-types/${serviceType.id}`
        : "/api/service-types"

      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          icon: icon.trim() || null,
        }),
      })

      const result = await res.json()

      if (!result.success) {
        setError(result.error || "Something went wrong.")
        return
      }

      onOpenChange(false)
      onSuccess()
    } catch {
      setError("Failed to save service type. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Service Type" : "Add Service Type"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the service type details below."
              : "Fill in the details to add a new service type."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="st-name">Name *</Label>
            <Input
              id="st-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lawn Mowing"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="st-description">Description</Label>
            <Textarea
              id="st-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of this service type"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Icon</Label>
            <IconPicker value={icon} onChange={setIcon} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {isEditing ? "Save Changes" : "Add Service Type"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
