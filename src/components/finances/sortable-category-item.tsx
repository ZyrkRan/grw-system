"use client"

import { forwardRef, useState } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Pencil, Trash2, FolderOpen, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#10b981", "#14b8a6",
  "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
  "#f43f5e", "#78716c", "#64748b", "#1e293b",
]

interface CategoryData {
  id: number
  name: string
  color: string
  isDefault: boolean
  isGroup: boolean
  parentId: number | null
  _count: { transactions: number }
}

interface SortableCategoryItemProps {
  category: CategoryData
  isChild?: boolean
  parentColor?: string
  isOverGroup?: boolean
  onEdit: (category: CategoryData) => void
  onDelete: (category: CategoryData) => void
  onColorChange: (categoryId: number, color: string) => void
  children?: React.ReactNode
}

export function SortableCategoryItem({
  category,
  isChild,
  parentColor,
  isOverGroup,
  onEdit,
  onDelete,
  onColorChange,
  children,
}: SortableCategoryItemProps) {
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={cn(
          "flex items-center gap-3 rounded-md border p-3 hover:bg-muted/50",
          isChild && "ml-8 border-l-2 border-b",
          isDragging && "opacity-50",
          isOverGroup && "ring-2 ring-primary ring-offset-1"
        )}
        style={isChild && parentColor ? { borderLeftColor: parentColor } : undefined}
        data-category-id={category.id}
      >
        <button
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <Popover open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-block shrink-0 rounded-full cursor-pointer ring-offset-background transition-shadow hover:ring-2 hover:ring-ring hover:ring-offset-1",
                isChild ? "size-3" : "size-4"
              )}
              style={{ backgroundColor: category.color }}
              onClick={(e) => e.stopPropagation()}
            />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-3" onClick={(e) => e.stopPropagation()}>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Pick a color</p>
            <div className="grid grid-cols-5 gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={cn(
                    "size-7 rounded-md transition-transform hover:scale-110 flex items-center justify-center",
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => {
                    onColorChange(category.id, c)
                    setColorPickerOpen(false)
                  }}
                >
                  {category.color === c && (
                    <Check className="size-3.5 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]" />
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => {
                onColorChange(category.id, "")
                setColorPickerOpen(false)
              }}
            >
              <X className="size-3" />
              Remove color
            </button>
          </PopoverContent>
        </Popover>
        <span className={cn(isChild ? "text-sm" : "font-medium")}>
          {category.name}
        </span>
        {category.isGroup && (
          <Badge variant="secondary" className="text-xs">
            <FolderOpen className="mr-1 size-3" />
            Group
          </Badge>
        )}
        <span className="ml-auto text-sm text-muted-foreground">
          {category._count.transactions} txn{category._count.transactions !== 1 ? "s" : ""}
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => onEdit(category)}
          >
            <Pencil className="size-3.5" />
            <span className="sr-only">Edit</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => onDelete(category)}
          >
            <Trash2 className="size-3.5" />
            <span className="sr-only">Delete</span>
          </Button>
        </div>
      </div>
      {children}
    </div>
  )
}

// Static preview for the drag overlay (no dnd hooks)
export const CategoryDragOverlay = forwardRef<
  HTMLDivElement,
  { category: CategoryData }
>(function CategoryDragOverlay({ category }, ref) {
  return (
    <div
      ref={ref}
      className="flex items-center gap-3 rounded-md border bg-background p-3 shadow-lg"
    >
      <GripVertical className="size-4 text-muted-foreground" />
      <span
        className="inline-block size-4 shrink-0 rounded-full"
        style={{ backgroundColor: category.color }}
      />
      <span className="font-medium">{category.name}</span>
      {category.isGroup && (
        <Badge variant="secondary" className="text-xs">
          <FolderOpen className="mr-1 size-3" />
          Group
        </Badge>
      )}
    </div>
  )
})
