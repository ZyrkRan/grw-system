"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

interface CategoryRef {
  id: number
  name: string
  color: string
}

interface RuleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: CategoryRef[]
  onSuccess: () => void
}

export function RuleDialog({
  open,
  onOpenChange,
  categories,
  onSuccess,
}: RuleDialogProps) {
  const [pattern, setPattern] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    setPattern("")
    setCategoryId("")
    setError("")
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!pattern.trim()) {
      setError("Pattern is required.")
      return
    }
    if (!categoryId) {
      setError("Category is required.")
      return
    }

    setIsSubmitting(true)

    try {
      const res = await fetch("/api/finances/categorization-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern: pattern.trim(),
          categoryId: parseInt(categoryId, 10),
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
      setError("Failed to create rule. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Categorization Rule</DialogTitle>
          <DialogDescription>
            Create a rule to automatically categorize transactions based on
            their description or merchant name.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="rule-pattern">Pattern *</Label>
            <Input
              id="rule-pattern"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="e.g. Amazon, Walmart, Home Depot"
              required
            />
            <p className="text-xs text-muted-foreground">
              Matches against transaction description and merchant name
              (case-insensitive).
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rule-category">Category *</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="rule-category" className="w-full">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Add Rule
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
