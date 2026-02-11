"use client"

import { useState, useEffect } from "react"
import { Loader2, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#10b981", "#14b8a6",
  "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
  "#f43f5e", "#78716c", "#64748b", "#1e293b",
]
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
  attachmentPrompt?: boolean
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
  const [attachmentPrompt, setAttachmentPrompt] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return

    if (category) {
      setName(category.name)
      setColor(category.color)
      setIsGroup(category.isGroup)
      setParentId(category.parentId ? String(category.parentId) : "")
      setAttachmentPrompt(category.attachmentPrompt ?? false)
    } else {
      setName("")
      setColor("#3b82f6")
      setIsGroup(false)
      setParentId("")
      setAttachmentPrompt(false)
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
          attachmentPrompt: isGroup ? false : attachmentPrompt,
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
            <Label>Color *</Label>
            <div className="grid grid-cols-10 gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={cn(
                    "size-7 rounded-md transition-transform hover:scale-110 flex items-center justify-center",
                    color === c && "ring-2 ring-ring ring-offset-1"
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                >
                  {color === c && (
                    <Check className="size-3.5 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]" />
                  )}
                </button>
              ))}
            </div>
            {color && (
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setColor("")}
              >
                <X className="size-3" />
                Remove color
              </button>
            )}
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

          {!isGroup && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="cat-attachment-prompt"
                checked={attachmentPrompt}
                onCheckedChange={(checked) => setAttachmentPrompt(checked === true)}
              />
              <div>
                <Label htmlFor="cat-attachment-prompt" className="cursor-pointer">
                  Prompt for attachments
                </Label>
                <p className="text-xs text-muted-foreground">
                  Remind to attach receipts when this category is used
                </p>
              </div>
            </div>
          )}

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
