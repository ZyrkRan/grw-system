"use client"

import * as React from "react"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  GripVertical,
  RotateCcw,
} from "lucide-react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ColumnDef<T> {
  key: string
  label: string
  visible?: boolean
  render?: (value: unknown, row: T) => React.ReactNode
  sortable?: boolean
  className?: string
}

type SortDirection = "asc" | "desc"

interface SortState {
  key: string
  direction: SortDirection
}

interface ColumnState {
  key: string
  visible: boolean
}

export interface DataTableProps<T> {
  /** Unique key used for localStorage persistence */
  storageKey?: string
  columns: ColumnDef<T>[]
  data: T[]
  /** Unique key accessor for each row — defaults to "id" */
  rowKey?: keyof T | ((row: T) => string | number)
  onRowClick?: (row: T) => void
  emptyMessage?: string
  className?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRowId<T>(row: T, rowKey: DataTableProps<T>["rowKey"]): string {
  if (typeof rowKey === "function") return String(rowKey(row))
  return String((row as Record<string, unknown>)[rowKey as string] ?? "")
}

function getNestedValue(obj: unknown, path: string): unknown {
  return (obj as Record<string, unknown>)[path]
}

function loadColumnState(storageKey: string): ColumnState[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(`dt-columns-${storageKey}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveColumnState(storageKey: string, state: ColumnState[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(`dt-columns-${storageKey}`, JSON.stringify(state))
  } catch {
    // ignore quota errors
  }
}

// ---------------------------------------------------------------------------
// SortableColumnItem — a single draggable row inside the Columns dropdown
// ---------------------------------------------------------------------------

function SortableColumnItem({
  id,
  label,
  checked,
  onToggle,
}: {
  id: string
  label: string
  checked: boolean
  onToggle: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
        isDragging && "z-50 bg-accent shadow-sm"
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        id={`col-toggle-${id}`}
      />
      <label
        htmlFor={`col-toggle-${id}`}
        className="flex-1 cursor-pointer select-none truncate"
      >
        {label}
      </label>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ColumnsDropdown — Popover with drag-to-reorder + checkbox toggles
// ---------------------------------------------------------------------------

function ColumnsDropdown<T>({
  columns,
  columnOrder,
  onColumnOrderChange,
  onReset,
}: {
  columns: ColumnDef<T>[]
  columnOrder: ColumnState[]
  onColumnOrderChange: (order: ColumnState[]) => void
  onReset: () => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = columnOrder.findIndex((c) => c.key === active.id)
    const newIndex = columnOrder.findIndex((c) => c.key === over.id)
    onColumnOrderChange(arrayMove(columnOrder, oldIndex, newIndex))
  }

  function handleToggle(key: string) {
    onColumnOrderChange(
      columnOrder.map((c) =>
        c.key === key ? { ...c, visible: !c.visible } : c
      )
    )
  }

  // Map key to label
  const labelMap = new Map(columns.map((c) => [c.key, c.label]))

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Columns3 className="size-4" />
          Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <div className="flex items-center justify-between px-2 pb-2">
          <p className="text-xs font-medium text-muted-foreground">
            Toggle &amp; reorder
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={onReset}
          >
            <RotateCcw className="size-3" />
            Reset
          </Button>
        </div>
        <Separator className="mb-1" />
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={columnOrder.map((c) => c.key)}
            strategy={verticalListSortingStrategy}
          >
            {columnOrder.map((col) => (
              <SortableColumnItem
                key={col.key}
                id={col.key}
                label={labelMap.get(col.key) ?? col.key}
                checked={col.visible}
                onToggle={() => handleToggle(col.key)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// DataTable — main component
// ---------------------------------------------------------------------------

export function DataTable<T>({
  storageKey,
  columns,
  data,
  rowKey = "id" as keyof T,
  onRowClick,
  emptyMessage = "No data.",
  className,
}: DataTableProps<T>) {
  // ---- Column order + visibility state ----
  const defaultOrder: ColumnState[] = columns.map((c) => ({
    key: c.key,
    visible: c.visible !== false,
  }))

  const [columnOrder, setColumnOrder] = React.useState<ColumnState[]>(() => {
    if (storageKey) {
      const saved = loadColumnState(storageKey)
      if (saved) {
        // Merge saved with current columns (handles added/removed cols)
        const savedMap = new Map(saved.map((s) => [s.key, s]))
        const merged: ColumnState[] = []
        // Keep saved order for existing columns
        for (const s of saved) {
          if (columns.some((c) => c.key === s.key)) {
            merged.push(s)
          }
        }
        // Append any new columns not in saved
        for (const c of columns) {
          if (!savedMap.has(c.key)) {
            merged.push({ key: c.key, visible: c.visible !== false })
          }
        }
        return merged
      }
    }
    return defaultOrder
  })

  // Persist on change
  React.useEffect(() => {
    if (storageKey) saveColumnState(storageKey, columnOrder)
  }, [storageKey, columnOrder])

  function handleReset() {
    setColumnOrder(defaultOrder)
    if (storageKey) {
      localStorage.removeItem(`dt-columns-${storageKey}`)
    }
  }

  // ---- Sorting state ----
  const [sort, setSort] = React.useState<SortState | null>(null)

  function handleSort(key: string) {
    setSort((prev) => {
      if (prev?.key === key) {
        return prev.direction === "asc"
          ? { key, direction: "desc" }
          : null
      }
      return { key, direction: "asc" }
    })
  }

  // ---- Derived visible columns in order ----
  const colMap = new Map(columns.map((c) => [c.key, c]))

  const visibleColumns = columnOrder
    .filter((c) => c.visible)
    .map((c) => colMap.get(c.key)!)
    .filter(Boolean)

  // ---- Sorted data ----
  const sortedData = React.useMemo(() => {
    if (!sort) return data
    const col = colMap.get(sort.key)
    if (!col) return data

    return [...data].sort((a, b) => {
      const aVal = getNestedValue(a, sort.key)
      const bVal = getNestedValue(b, sort.key)

      // Handle nulls
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      let cmp = 0
      if (typeof aVal === "number" && typeof bVal === "number") {
        cmp = aVal - bVal
      } else {
        cmp = String(aVal).localeCompare(String(bVal))
      }

      return sort.direction === "asc" ? cmp : -cmp
    })
  }, [data, sort]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Render ----
  return (
    <div className={cn("space-y-2", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-end">
        <ColumnsDropdown
          columns={columns}
          columnOrder={columnOrder}
          onColumnOrderChange={setColumnOrder}
          onReset={handleReset}
        />
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {visibleColumns.map((col) => {
                const isSorted = sort?.key === col.key
                const sortable = col.sortable !== false

                return (
                  <TableHead
                    key={col.key}
                    className={cn(col.className, sortable && "cursor-pointer select-none")}
                    onClick={sortable ? () => handleSort(col.key) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {sortable && (
                        <span className="text-muted-foreground">
                          {isSorted ? (
                            sort.direction === "asc" ? (
                              <ArrowUp className="size-3.5" />
                            ) : (
                              <ArrowDown className="size-3.5" />
                            )
                          ) : (
                            <ArrowUpDown className="size-3.5 opacity-40" />
                          )}
                        </span>
                      )}
                    </span>
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={visibleColumns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              sortedData.map((row) => (
                <TableRow
                  key={getRowId(row, rowKey)}
                  className={cn(onRowClick && "cursor-pointer")}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {visibleColumns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      {col.render
                        ? col.render(getNestedValue(row, col.key), row)
                        : (String(getNestedValue(row, col.key) ?? ""))}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
