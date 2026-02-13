"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#10b981", "#14b8a6",
  "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
]

interface RouteData {
  id?: number
  name: string
  description: string | null
  color: string | null
  date: string | null
}

interface RouteFormProps {
  route?: RouteData
  onSuccess: () => void
}

export function RouteForm({ route, onSuccess }: RouteFormProps) {
  const [name, setName] = useState(route?.name ?? "")
  const [description, setDescription] = useState(route?.description ?? "")
  const [color, setColor] = useState(route?.color ?? "")
  const [date, setDate] = useState(
    route?.date ? new Date(route.date).toISOString().split("T")[0] : ""
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  const isEditing = !!route?.id

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
        ? `/api/routes/${route.id}`
        : "/api/routes"

      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          color: color || null,
          date: date || null,
        }),
      })

      const result = await res.json()

      if (!result.success) {
        setError(result.error || "Something went wrong.")
        return
      }

      onSuccess()
    } catch {
      setError("Failed to save route. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Monday Route, North Side"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional notes about this route"
        />
      </div>

      <div className="space-y-2">
        <Label>Color</Label>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={cn(
                "size-7 rounded-md transition-transform hover:scale-110 flex items-center justify-center",
              )}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
            >
              {color === c && (
                <Check className="size-3.5 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]" />
              )}
            </button>
          ))}
          {color && (
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-md border border-dashed text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setColor("")}
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="date">Date (optional)</Label>
        <Input
          id="date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Leave empty to use as a reusable template.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
          {isEditing ? "Save Changes" : "Add Route"}
        </Button>
      </div>
    </form>
  )
}
