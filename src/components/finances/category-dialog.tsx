"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface CategoryGroup {
  id: number
  name: string
  color: string
}

interface CategoryData {
  id?: number
  name: string
  color: string
  isGroup: boolean
  parentId: number | null
}

interface CategoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: CategoryData
  groups: CategoryGroup[]
  onSuccess: () => void
}

export function CategoryDialog({
  open,
  onOpenChange,
  category,
  groups,
  onSuccess,
}: CategoryDialogProps) {
  const isEditing = !!category?.id

  const [name, setName] = useState("")
  const [color, setColor] = useState("#3b82f6")
  const [isGroup, setIsGroup] = useState(false)
  const [parentId, setParentId] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return

    if (category) {
      setName(category.name)
      setColor(category.color)
      setIsGroup(category.isGroup)
      setParentId(category.parentId ? String(category.parentId) : "")
    } else {
      setName("")
      setColor("#3b82f6")
      setIsGroup(false)
      setParentId("")
    }
    setError("")
  }, [open, category])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!name.trim()) {
      setError("Name is required.")
      return
    }
    if (!color.trim()) {
      setError("Color is required.")
      return
    }

    setIsSubmitting(true)

    try {
      const url = isEditing
        ? `/api/finances/categories/${category.id}`
        : "/api/finances/categories"

      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          color: color.trim(),
          isGroup,
          parentId:
            parentId && parentId !== "none"
              ? parseInt(parentId, 10)
              : null,
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
      setError("Failed to save category. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Filter out current category from groups (can't be own parent)
  const availableGroups = groups.filter((g) => g.id !== category?.id)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Category" : "Add Category"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the category details below."
              : "Create a new transaction category."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="cat-name">Name *</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Office Supplies"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cat-color">Color *</Label>
            <div className="flex items-center gap-2">
              <div
                className="size-8 shrink-0 rounded-md border"
                style={{ backgroundColor: color || "#3b82f6" }}
              />
              <Input
                id="cat-color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#3b82f6"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="cat-is-group"
              checked={isGroup}
              onCheckedChange={(checked) => setIsGroup(checked === true)}
            />
            <Label htmlFor="cat-is-group" className="cursor-pointer">
              This is a category group (parent)
            </Label>
          </div>

          {!isGroup && availableGroups.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="cat-parent">Parent Group</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger id="cat-parent" className="w-full">
                  <SelectValue placeholder="No parent (top-level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No parent (top-level)</SelectItem>
                  {availableGroups.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: g.color }}
                        />
                        {g.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {isEditing ? "Save Changes" : "Add Category"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
