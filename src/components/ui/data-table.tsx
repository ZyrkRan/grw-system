"use client"

import * as React from "react"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Filter,
  GripVertical,
  RotateCcw,
  Search,
  Trash2,
  X,
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  /** Column is always visible and stays at the end — excluded from columns dropdown */
  pinned?: boolean
  /** Column is always visible and stays at the start (after checkbox) — excluded from columns dropdown */
  pinnedStart?: boolean
  render?: (value: unknown, row: T) => React.ReactNode
  /** Custom sort value extractor for nested/computed fields */
  sortValue?: (row: T) => string | number | null
  sortable?: boolean
  /** Show a filter dropdown for this column with unique values from the data */
  filterable?: boolean
  /** Custom filter value extractor — defaults to the raw cell value stringified */
  filterValue?: (row: T) => string
  /** Custom icon for the filter button — defaults to Filter icon */
  filterIcon?: React.ReactNode
  /** Label shown on the filter button — defaults to column label */
  filterLabel?: string
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

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const

export interface DataTableProps<T> {
  /** Unique key used for localStorage persistence */
  storageKey?: string
  columns: ColumnDef<T>[]
  data: T[]
  /** Unique key accessor for each row — defaults to "id" */
  rowKey?: keyof T | ((row: T) => string | number)
  onRowClick?: (row: T) => void
  /** Enable checkbox row selection */
  selectable?: boolean
  /** Called with currently selected rows when selection changes */
  onSelectionChange?: (selected: T[]) => void
  /** Render bulk action buttons when rows are selected */
  renderBulkActions?: (selected: T[], clearSelection: () => void) => React.ReactNode
  /** Show a search input in the toolbar */
  searchable?: boolean
  searchPlaceholder?: string
  /** Default rows per page — defaults to 10 */
  defaultPageSize?: number
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

  // Map key to label — only non-pinned columns
  const labelMap = new Map(
    columns.filter((c) => !c.pinned && !c.pinnedStart).map((c) => [c.key, c.label])
  )

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
  selectable = false,
  onSelectionChange,
  renderBulkActions,
  searchable = false,
  searchPlaceholder = "Search...",
  defaultPageSize = 10,
  emptyMessage = "No data.",
  className,
}: DataTableProps<T>) {
  // Split columns into pinned-start, movable, and pinned-end
  const pinnedStartColumns = columns.filter((c) => c.pinnedStart)
  const movableColumns = columns.filter((c) => !c.pinned && !c.pinnedStart)
  const pinnedColumns = columns.filter((c) => c.pinned)
  const filterableColumns = columns.filter((c) => c.filterable)

  // ---- Column order + visibility state (only for movable columns) ----
  const defaultOrder: ColumnState[] = movableColumns.map((c) => ({
    key: c.key,
    visible: c.visible !== false,
  }))

  const [columnOrder, setColumnOrder] = React.useState<ColumnState[]>(() => {
    if (storageKey) {
      const saved = loadColumnState(storageKey)
      if (saved) {
        const savedMap = new Map(saved.map((s) => [s.key, s]))
        const merged: ColumnState[] = []
        for (const s of saved) {
          if (movableColumns.some((c) => c.key === s.key)) {
            merged.push(s)
          }
        }
        for (const c of movableColumns) {
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

  // ---- Column map (used by filters, sort, render) ----
  const colMap = new Map(columns.map((c) => [c.key, c]))

  // ---- Search + column filter state ----
  const [searchQuery, setSearchQuery] = React.useState("")
  const [columnFilters, setColumnFilters] = React.useState<Record<string, Set<string>>>({})

  function getFilterDisplayValue(col: ColumnDef<T>, row: T): string {
    if (col.filterValue) return col.filterValue(row)
    const raw = getNestedValue(row, col.key)
    if (raw == null || raw === "") return ""
    return String(raw)
  }

  // Unique values per filterable column (computed from raw data)
  const filterOptions = React.useMemo(() => {
    const result: Record<string, string[]> = {}
    for (const col of filterableColumns) {
      const values = new Set<string>()
      for (const row of data) {
        const v = getFilterDisplayValue(col, row)
        if (v) values.add(v)
      }
      result[col.key] = Array.from(values).sort((a, b) => a.localeCompare(b))
    }
    return result
  }, [data, filterableColumns]) // eslint-disable-line react-hooks/exhaustive-deps

  // Filtered data (search + column filters applied before sort)
  const filteredData = React.useMemo(() => {
    let result = data

    // Apply column filters
    const activeFilters = Object.entries(columnFilters).filter(
      ([, values]) => values.size > 0
    )
    if (activeFilters.length > 0) {
      result = result.filter((row) =>
        activeFilters.every(([key]) => {
          const col = colMap.get(key)
          if (!col) return true
          const val = getFilterDisplayValue(col, row)
          return columnFilters[key].has(val)
        })
      )
    }

    // Apply search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((row) =>
        movableColumns.some((col) => {
          const val = col.filterValue
            ? col.filterValue(row)
            : getNestedValue(row, col.key)
          return val != null && String(val).toLowerCase().includes(q)
        })
      )
    }

    return result
  }, [data, searchQuery, columnFilters]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleColumnFilter(colKey: string, value: string) {
    setColumnFilters((prev) => {
      const current = prev[colKey] ?? new Set<string>()
      const next = new Set(current)
      if (next.has(value)) {
        next.delete(value)
      } else {
        next.add(value)
      }
      return { ...prev, [colKey]: next }
    })
  }

  function clearColumnFilter(colKey: string) {
    setColumnFilters((prev) => {
      const next = { ...prev }
      delete next[colKey]
      return next
    })
  }

  function clearAllFilters() {
    setSearchQuery("")
    setColumnFilters({})
  }

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    Object.values(columnFilters).some((s) => s.size > 0)

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

  // ---- Selection state ----
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())

  // Clear selection when data changes
  React.useEffect(() => {
    setSelectedIds(new Set())
  }, [data])

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function toggleAll() {
    const pageIds = paginatedData.map((row) => getRowId(row, rowKey))
    const allPageSelected = pageIds.every((id) => selectedIds.has(id))
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        pageIds.forEach((id) => next.delete(id))
        return next
      })
    } else {
      setSelectedIds((prev) => new Set([...prev, ...pageIds]))
    }
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  const selectedRows = React.useMemo(
    () => data.filter((row) => selectedIds.has(getRowId(row, rowKey))),
    [data, selectedIds, rowKey]
  )

  // Notify parent of selection changes
  React.useEffect(() => {
    onSelectionChange?.(selectedRows)
  }, [selectedRows]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Derived visible columns in order ----
  const visibleColumns = [
    ...pinnedStartColumns,
    ...columnOrder
      .filter((c) => c.visible)
      .map((c) => colMap.get(c.key)!)
      .filter(Boolean),
    ...pinnedColumns,
  ]

  // Total columns including selection checkbox
  const totalColSpan = visibleColumns.length + (selectable ? 1 : 0)

  // ---- Sorted data ----
  const sortedData = React.useMemo(() => {
    if (!sort) return filteredData
    const col = colMap.get(sort.key)
    if (!col) return filteredData

    return [...filteredData].sort((a, b) => {
      const aVal = col.sortValue ? col.sortValue(a) : getNestedValue(a, sort.key)
      const bVal = col.sortValue ? col.sortValue(b) : getNestedValue(b, sort.key)

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
  }, [filteredData, sort]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Pagination state ----
  const [pageSize, setPageSize] = React.useState(defaultPageSize)
  const [page, setPage] = React.useState(0)

  // Reset to first page when data, filters, or sort changes
  React.useEffect(() => {
    setPage(0)
  }, [filteredData, sort])

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize))
  const paginatedData = sortedData.slice(page * pageSize, (page + 1) * pageSize)

  // ---- Render ----
  const hasSelection = selectedIds.size > 0

  return (
    <div className={cn("space-y-2", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        {searchable && (
          <div className="relative w-full sm:w-auto sm:min-w-56">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9 pr-8"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Column filter dropdowns */}
        {filterableColumns.map((col) => {
          const options = filterOptions[col.key] ?? []
          const activeSet = columnFilters[col.key]
          const activeCount = activeSet?.size ?? 0
          if (options.length === 0) return null

          return (
            <Popover key={col.key}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("gap-1.5", activeCount > 0 && "border-primary")}
                >
                  {col.filterIcon ?? <Filter className="size-3.5" />}
                  {col.filterLabel ?? col.label}
                  {activeCount > 0 && (
                    <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-xs">
                      {activeCount}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-52 p-2">
                <div className="flex items-center justify-between px-2 pb-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Filter by {(col.filterLabel ?? col.label).toLowerCase()}
                  </p>
                  {activeCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => clearColumnFilter(col.key)}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <Separator className="mb-1" />
                <div className="max-h-48 overflow-y-auto">
                  {options.map((value) => {
                    const isActive = activeSet?.has(value) ?? false
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => toggleColumnFilter(col.key, value)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        <div
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                            isActive
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/25"
                          )}
                        >
                          {isActive && <Check className="size-3" />}
                        </div>
                        <span className="truncate">{value}</span>
                      </button>
                    )
                  })}
                </div>
              </PopoverContent>
            </Popover>
          )
        })}

        {/* Clear all filters */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 px-2"
            onClick={clearAllFilters}
          >
            <X className="size-3.5" />
            Clear filters
          </Button>
        )}

        {/* Bulk actions */}
        {hasSelection && renderBulkActions && (
          <div className="flex items-center gap-2">
            <Separator orientation="vertical" className="h-5" />
            <span className="text-sm text-muted-foreground">
              {selectedIds.size} selected
            </span>
            {renderBulkActions(selectedRows, clearSelection)}
          </div>
        )}

        {/* Columns dropdown — pinned to end */}
        <div className="ml-auto">
          <ColumnsDropdown
            columns={movableColumns}
            columnOrder={columnOrder}
            onColumnOrderChange={setColumnOrder}
            onReset={handleReset}
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      paginatedData.length > 0 &&
                      paginatedData.every((row) =>
                        selectedIds.has(getRowId(row, rowKey))
                      )
                    }
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                  />
                </TableHead>
              )}
              {visibleColumns.map((col) => {
                const isSorted = sort?.key === col.key
                const sortable = col.sortable !== false && !col.pinned

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
            {paginatedData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={totalColSpan}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((row) => {
                const id = getRowId(row, rowKey)
                const isSelected = selectedIds.has(id)

                return (
                  <TableRow
                    key={id}
                    data-state={isSelected ? "selected" : undefined}
                    className={cn(onRowClick && "cursor-pointer")}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {selectable && (
                      <TableCell className="w-10">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleRow(id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select row ${id}`}
                        />
                      </TableCell>
                    )}
                    {visibleColumns.map((col) => (
                      <TableCell key={col.key} className={col.className}>
                        {col.render
                          ? col.render(getNestedValue(row, col.key), row)
                          : (String(getNestedValue(row, col.key) ?? ""))}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Rows per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v))
              setPage(0)
            }}
          >
            <SelectTrigger className="h-8 w-18">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 0}
            >
              <ChevronLeft className="size-4" />
              <span className="sr-only">Previous page</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="size-4" />
              <span className="sr-only">Next page</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
