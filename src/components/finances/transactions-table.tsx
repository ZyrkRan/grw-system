"use client"

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react"
import {
  Loader2,
  ChevronDown,
  Briefcase,
  User,
  Circle,
  CheckCircle2,
  ChevronsUpDown,
  TrendingUp,
  Search,
  ArrowUp,
  ArrowDown,
  X,
  Columns3,
  GripVertical,
  RotateCcw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { Separator } from "@/components/ui/separator"
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
import { cleanPattern, matchesRule } from "@/lib/categorization-rules"
import { parseDateQuery } from "@/lib/parse-date-query"
import { CategoryPickerContent, type CategoryOption as SharedCategoryOption } from "@/components/finances/category-picker"

export interface TaxTx {
  id: number
  date: string
  description: string
  merchantName: string | null
  amount: number
  type: string
  categoryId: number | null
  taxType: string | null
  isReviewed: boolean
  notes: string | null
  category: {
    id: number
    name: string
    color: string
    parent: { id: number; name: string; isSystemGroup: boolean } | null
  } | null
}

export type CategoryOption = SharedCategoryOption

type StatusFilter = "all" | "uncategorized" | "business" | "personal" | "mismatched"
type DirectionFilter = "all" | "inflow" | "outflow"

interface Props {
  transactions: TaxTx[]
  categories: CategoryOption[]
  loading: boolean
  statusFilter: StatusFilter
  directionFilter: DirectionFilter
  onStatusFilterChange: (f: StatusFilter) => void
  onDirectionFilterChange: (f: DirectionFilter) => void
  onUpdate: (id: number, categoryId: number | null, taxType: string | null, saveRule?: { pattern: string; categoryId: number | null; taxType: string }) => Promise<void>
  onUpdateNotes: (id: number, notes: string) => Promise<void>
  onBulkUpdate: (ids: number[], categoryId: number | null, taxType: string | null) => Promise<void>
  onCategorySortChange?: (active: boolean) => void
  customerPhoneMap?: Map<string, string>
  existingRules?: TaxRule[]
  globalSearch?: string | null
  onSearchAllMonths?: (query: string | null) => void
  searchText?: string
  onSearchTextChange?: (text: string) => void
  categoryFilter?: number | "__uncategorized__" | null
  onCategoryFilterChange?: (f: number | "__uncategorized__" | null) => void
}

export interface TaxRule {
  pattern: string
  categoryId: number | null
  taxType: string
  category: { id: number; name: string; color: string } | null
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n)
}

// Local-time YYYY-MM-DD for comparing against tx.date strings (which are
// also local-day ISO strings, not UTC).
function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// ── Column reorder types & helpers ──────────────────────────────────

interface ColumnState {
  key: string
  visible: boolean
}

const STORAGE_KEY = "tax-review-columns"
const TAX_COLUMN_KEYS = ["date", "description", "amount", "category", "notes"] as const

function loadColumnState(): ColumnState[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveColumnState(state: ColumnState[]) {
  if (typeof window === "undefined") return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {}
}

const defaultColumnOrder: ColumnState[] = TAX_COLUMN_KEYS.map((key) => ({ key, visible: true }))

const columnLabels: Record<string, string> = {
  date: "Date",
  description: "Description",
  amount: "Amount",
  category: "Category",
  notes: "Notes",
}

// ── Column resize types & helpers ──────────────────────────────────

const COL_WIDTHS_KEY = "tax-review-col-widths"
const DEFAULT_COL_WIDTHS: Record<string, number> = {
  date: 96,
  description: 0, // 0 = flexible, no fixed width
  amount: 112,
  category: 192,
  notes: 160,
}
const MIN_COL_WIDTH = 60

function loadColWidths(): Record<string, number> | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(COL_WIDTHS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveColWidths(widths: Record<string, number>) {
  if (typeof window === "undefined") return
  try { localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(widths)) } catch {}
}

function ResizeHandle({ columnKey, onResize, onDoubleClick }: {
  columnKey: string
  onResize: (key: string, delta: number) => void
  onDoubleClick: (key: string) => void
}) {
  const startXRef = useRef(0)
  const accumulatedRef = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    startXRef.current = e.clientX
    accumulatedRef.current = 0

    const handleMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startXRef.current
      const incrementalDelta = delta - accumulatedRef.current
      accumulatedRef.current = delta
      onResize(columnKey, incrementalDelta)
    }

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }

    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
  }, [columnKey, onResize])

  return (
    <div
      className="absolute right-0 top-0 bottom-0 w-[5px] cursor-col-resize z-10 group/resize"
      onMouseDown={handleMouseDown}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(columnKey) }}
    >
      <div className="absolute right-0 top-1 bottom-1 w-[2px] rounded bg-border opacity-0 transition-opacity group-hover/resize:opacity-100" />
    </div>
  )
}

function SortableColumnItem({ id, label, checked, onToggle }: {
  id: string; label: string; checked: boolean; onToggle: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div ref={setNodeRef} style={style} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm", isDragging && "z-50 bg-accent shadow-sm")}>
      <button type="button" className="cursor-grab touch-none text-muted-foreground hover:text-foreground" {...attributes} {...listeners}>
        <GripVertical className="size-4" />
      </button>
      <Checkbox checked={checked} onCheckedChange={onToggle} id={`tax-col-${id}`} />
      <label htmlFor={`tax-col-${id}`} className="flex-1 cursor-pointer select-none truncate">{label}</label>
    </div>
  )
}

function ColumnsDropdown({ columnOrder, onColumnOrderChange, onReset }: {
  columnOrder: ColumnState[]
  onColumnOrderChange: (order: ColumnState[]) => void
  onReset: () => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = columnOrder.findIndex((c) => c.key === active.id)
    const newIndex = columnOrder.findIndex((c) => c.key === over.id)
    onColumnOrderChange(arrayMove(columnOrder, oldIndex, newIndex))
  }

  function handleToggle(key: string) {
    onColumnOrderChange(columnOrder.map((c) => c.key === key ? { ...c, visible: !c.visible } : c))
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Columns3 className="size-4" /> Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <div className="flex items-center justify-between px-2 pb-2">
          <p className="text-xs font-medium text-muted-foreground">Toggle &amp; reorder</p>
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={onReset}>
            <RotateCcw className="size-3" /> Reset
          </Button>
        </div>
        <Separator className="mb-1" />
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={columnOrder.map((c) => c.key)} strategy={verticalListSortingStrategy}>
            {columnOrder.map((col) => (
              <SortableColumnItem
                key={col.key}
                id={col.key}
                label={columnLabels[col.key] ?? col.key}
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

export function TransactionTable({
  transactions,
  categories,
  loading,
  statusFilter,
  directionFilter,
  onStatusFilterChange,
  onDirectionFilterChange,
  onUpdate,
  onUpdateNotes,
  onBulkUpdate,
  onCategorySortChange,
  customerPhoneMap,
  existingRules,
  globalSearch,
  onSearchAllMonths,
  searchText: controlledSearch,
  onSearchTextChange,
  categoryFilter: controlledCategoryFilter,
  onCategoryFilterChange,
}: Props) {

  // ATH MOVIL matching — memoized for all visible transactions
  const athMovilMatches = useMemo(() => {
    const map = new Map<number, string>()
    if (!customerPhoneMap?.size) return map
    for (const tx of transactions) {
      const desc = (tx.description + " " + (tx.merchantName || "")).toUpperCase()
      if (!desc.includes("ATH MOVIL") && !desc.includes("ATH_MOVIL") && !desc.includes("ATHMOVIL")) continue
      const m = desc.match(/\b(\d{4})\b/)
      if (!m) continue
      const customer = customerPhoneMap.get(m[1])
      if (customer) map.set(tx.id, customer)
    }
    return map
  }, [transactions, customerPhoneMap])
  // Column reorder state
  const [columnOrder, setColumnOrder] = useState<ColumnState[]>(() => {
    const saved = loadColumnState()
    if (saved) {
      // Merge: add any new columns not in saved state, remove stale ones
      const savedKeys = new Set(saved.map((c) => c.key))
      const merged = [...saved.filter((c) => TAX_COLUMN_KEYS.includes(c.key as typeof TAX_COLUMN_KEYS[number]))]
      for (const key of TAX_COLUMN_KEYS) {
        if (!savedKeys.has(key)) merged.push({ key, visible: true })
      }
      return merged
    }
    return defaultColumnOrder
  })

  useEffect(() => { saveColumnState(columnOrder) }, [columnOrder])

  const visibleColumns = useMemo(() => columnOrder.filter((c) => c.visible).map((c) => c.key), [columnOrder])

  // Column resize state
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    return loadColWidths() ?? { ...DEFAULT_COL_WIDTHS }
  })

  useEffect(() => { saveColWidths(colWidths) }, [colWidths])

  const handleColResize = useCallback((key: string, delta: number) => {
    setColWidths((prev) => {
      const currentWidth = prev[key] || DEFAULT_COL_WIDTHS[key] || 120
      // For flexible columns (description), compute from actual element if width is 0
      const effectiveWidth = currentWidth === 0 ? 300 : currentWidth
      const newWidth = Math.max(MIN_COL_WIDTH, effectiveWidth + delta)
      return { ...prev, [key]: newWidth }
    })
  }, [])

  const handleColResetWidth = useCallback((key: string) => {
    setColWidths((prev) => ({ ...prev, [key]: DEFAULT_COL_WIDTHS[key] ?? 120 }))
  }, [])

  const [localSearch, setLocalSearch] = useState("")
  const search = controlledSearch ?? localSearch
  const setSearch = onSearchTextChange ?? setLocalSearch
  const [amountSort, setAmountSort] = useState<"asc" | "desc" | null>(null)
  const [categorySort, setCategorySort] = useState<"asc" | "desc" | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [dismissedMatches, setDismissedMatches] = useState<Set<number>>(new Set())
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [openPopoverId, setOpenPopoverId] = useState<number | null>(null)
  const [bulkPopoverOpen, setBulkPopoverOpen] = useState(false)
  const [localCategoryFilter, setLocalCategoryFilter] = useState<number | "__uncategorized__" | null>(null)
  const categoryFilter = controlledCategoryFilter ?? localCategoryFilter
  const setCategoryFilter = onCategoryFilterChange ?? setLocalCategoryFilter
  const [categoryFilterOpen, setCategoryFilterOpen] = useState(false)

  // Expense categories exclude anything under the Income subgroups.
  // Income categories are everything under Business > Income / Personal > Income
  // (the walker in page.tsx maps Business-Income leaves to taxType="service_income").
  const businessExpenseCats = categories.filter(
    (c) => !c.isIncome && c.taxType === "business" && c.name.toLowerCase() !== "service income"
  )
  const personalExpenseCats = categories.filter((c) => !c.isIncome && c.taxType === "personal")
  const businessIncomeCats = categories.filter((c) => c.isIncome && c.taxType === "service_income")
  const personalIncomeCats = categories.filter((c) => c.isIncome && c.taxType === "personal")
  // Legacy aliases used by the two picker callers — default to the expense view
  // (most common) and are overridden per-direction inside the picker itself.
  const businessCats = businessExpenseCats
  const personalCats = personalExpenseCats

  // Pre-compile rule regex (only recomputes when rules change, not on every transaction update)
  const compiledRules = useMemo(() =>
    (existingRules || [])
      .map((r) => { try { return { ...r, regex: new RegExp(r.pattern, "i") } } catch { return null } })
      .filter((r): r is NonNullable<typeof r> => r !== null),
    [existingRules]
  )

  // Match uncategorized transactions against compiled rules (collect ALL matches)
  const ruleMatches = useMemo(() => {
    if (!compiledRules.length) return new Map<number, TaxRule[]>()
    const map = new Map<number, TaxRule[]>()
    for (const tx of transactions) {
      if (tx.taxType !== null) continue
      const text = `${tx.description} ${tx.merchantName || ""}`.trim()
      for (const rule of compiledRules) {
        if (matchesRule(text, rule.regex, rule.pattern)) {
          if (!map.has(tx.id)) map.set(tx.id, [])
          map.get(tx.id)!.push(rule)
        }
      }
    }
    return map
  }, [transactions, compiledRules])

  const filtered = useMemo(() => {
    let result = transactions
    // Skip client-side search when server is filtering (cross-month search)
    if (search.trim() && globalSearch === null) {
      const q = search.toLowerCase()
      const dateMatch = parseDateQuery(search)
      const isoGte = dateMatch?.kind === "range" ? toIsoDate(dateMatch.gte) : null
      const isoLt = dateMatch?.kind === "range" ? toIsoDate(dateMatch.lt) : null
      const monthOnly = dateMatch?.kind === "monthOnly" ? String(dateMatch.month).padStart(2, "0") : null
      const monthDay = dateMatch?.kind === "monthDay"
        ? `${String(dateMatch.month).padStart(2, "0")}-${String(dateMatch.day).padStart(2, "0")}`
        : null
      result = result.filter((tx) => {
        const dateHit =
          (isoGte && isoLt && tx.date >= isoGte && tx.date < isoLt) ||
          (monthOnly && tx.date.slice(5, 7) === monthOnly) ||
          (monthDay && tx.date.slice(5, 10) === monthDay)
        return (
          dateHit ||
          tx.description.toLowerCase().includes(q) ||
          tx.merchantName?.toLowerCase().includes(q) ||
          tx.category?.name.toLowerCase().includes(q) ||
          String(tx.amount).includes(q) ||
          Math.abs(tx.amount).toFixed(2).includes(q)
        )
      })
    }
    if (categoryFilter) {
      result = result.filter((tx) => {
        if (categoryFilter === "__uncategorized__") return !tx.category
        return tx.categoryId === categoryFilter
      })
    }
    if (amountSort) {
      result = [...result].sort((a, b) => amountSort === "asc" ? a.amount - b.amount : b.amount - a.amount)
    }
    if (categorySort) {
      result = [...result].sort((a, b) => {
        const aMatches = ruleMatches.get(a.id)
        const bMatches = ruleMatches.get(b.id)
        const aSuggested = !a.category && !!aMatches?.length
        const bSuggested = !b.category && !!bMatches?.length
        // Suggested (unconfirmed) always sort to top
        if (aSuggested !== bSuggested) return aSuggested ? -1 : 1
        const aName = a.category?.name || aMatches?.[0]?.category?.name || ""
        const bName = b.category?.name || bMatches?.[0]?.category?.name || ""
        return categorySort === "asc" ? aName.localeCompare(bName) : bName.localeCompare(aName)
      })
    }
    return result
  }, [transactions, search, globalSearch, amountSort, categorySort, ruleMatches, categoryFilter])

  const allSelected = filtered.length > 0 && selected.size === filtered.length
  const someSelected = selected.size > 0 && !allSelected

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(filtered.map((t) => t.id)))
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCategorySelect = useCallback(async (tx: TaxTx, cat: CategoryOption) => {
    setOpenPopoverId(null)
    setUpdatingId(tx.id)
    // Sentinel IDs (< 0) = quick-assign taxType only, no specific sub-category
    const categoryId = cat.id < 0 ? null : cat.id
    try {
      await onUpdate(tx.id, categoryId, cat.taxType, undefined)

      // Offer to save a rule via non-blocking toast
      {
        const raw = tx.merchantName?.trim() || tx.description.trim()
        if (raw) {
          const fullText = `${tx.description} ${tx.merchantName || ""}`.trim()
          const alreadyCovered = existingRules?.some((r) => {
            if (r.categoryId !== categoryId || r.taxType !== cat.taxType) return false
            try { return matchesRule(fullText, new RegExp(r.pattern, "i"), r.pattern) } catch { return false }
          })
          if (!alreadyCovered) {
            const pattern = cleanPattern(raw)
            const ruleCategoryId = cat.id > 0 ? cat.id : null
            const ruleTaxType = cat.taxType
            toast.custom((id) => (
              <RuleToast
                toastId={id}
                initialPattern={pattern}
                categoryName={cat.name}
                taxType={ruleTaxType}
                onSave={(finalPattern) => {
                  onUpdate(tx.id, ruleCategoryId, ruleTaxType, { pattern: finalPattern, categoryId: ruleCategoryId, taxType: ruleTaxType })
                  toast.dismiss(id)
                }}
              />
            ), { duration: 8000, dismissible: false })
          }
        }
      }
    } finally {
      setUpdatingId(null)
    }
  }, [onUpdate, existingRules])

  async function handleBulkApply(cat: CategoryOption) {
    if (selected.size === 0) return
    setBulkPopoverOpen(false)
    const categoryId = cat.id < 0 ? null : cat.id
    await onBulkUpdate(Array.from(selected), categoryId, cat.taxType)
    setSelected(new Set())
  }

  const statusFilters: { label: string; value: StatusFilter }[] = [
    { label: "All", value: "all" },
    { label: "Uncategorized", value: "uncategorized" },
    { label: "Business", value: "business" },
    { label: "Personal", value: "personal" },
  ]

  const directionFilters: { label: string; value: DirectionFilter }[] = [
    { label: "All", value: "all" },
    { label: "Inflow", value: "inflow" },
    { label: "Outflow", value: "outflow" },
  ]

  return (
    <div className="flex flex-col gap-3">
      {/* Search + Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={globalSearch !== null ? "Search all months or dates…" : "Search transactions or dates…"}
            className="h-8 text-xs pl-8 pr-7"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        {onSearchAllMonths && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer select-none">
            <Checkbox
              checked={globalSearch !== null}
              onCheckedChange={(checked) => {
                if (checked) {
                  onSearchAllMonths(search.trim() || "")
                } else {
                  onSearchAllMonths(null)
                }
              }}
              className="size-3.5"
            />
            All months
          </label>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-muted/40 rounded-md p-0.5">
            {statusFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => { onStatusFilterChange(f.value); setSelected(new Set()) }}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded transition-colors",
                  statusFilter === f.value
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-muted/40 rounded-md p-0.5">
            {directionFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => { onDirectionFilterChange(f.value); setSelected(new Set()) }}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded transition-colors",
                  directionFilter === f.value
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Popover open={categoryFilterOpen} onOpenChange={setCategoryFilterOpen}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "flex items-center gap-1 px-3 py-1 text-xs font-medium rounded transition-colors",
                  categoryFilter
                    ? "bg-background shadow-sm text-foreground ring-1 ring-border"
                    : "bg-muted/40 text-muted-foreground hover:text-foreground"
                )}
              >
                {categoryFilter
                  ? categoryFilter === "__uncategorized__"
                    ? "Uncategorized"
                    : categories.find((c) => c.id === categoryFilter)?.name ?? "Category"
                  : "Category"}
                <ChevronDown className="size-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1.5 max-h-72 overflow-y-auto" align="start">
              <button
                onClick={() => { setCategoryFilter(null); setCategoryFilterOpen(false); setSelected(new Set()) }}
                className={cn(
                  "w-full text-left px-2.5 py-1.5 text-xs rounded transition-colors",
                  !categoryFilter ? "bg-muted font-medium" : "hover:bg-muted/50"
                )}
              >
                All Categories
              </button>
              <button
                onClick={() => { setCategoryFilter("__uncategorized__"); setCategoryFilterOpen(false); setSelected(new Set()) }}
                className={cn(
                  "w-full text-left px-2.5 py-1.5 text-xs rounded transition-colors",
                  categoryFilter === "__uncategorized__" ? "bg-muted font-medium" : "hover:bg-muted/50"
                )}
              >
                Uncategorized
              </button>
              {businessCats.length > 0 && (
                <>
                  <div className="px-2.5 pt-2 pb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Business</div>
                  {businessCats.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setCategoryFilter(c.id); setCategoryFilterOpen(false); setSelected(new Set()) }}
                      className={cn(
                        "w-full text-left px-2.5 py-1.5 text-xs rounded transition-colors flex items-center gap-2",
                        categoryFilter === c.id ? "bg-muted font-medium" : "hover:bg-muted/50"
                      )}
                    >
                      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </button>
                  ))}
                </>
              )}
              {personalCats.length > 0 && (
                <>
                  <div className="px-2.5 pt-2 pb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Personal</div>
                  {personalCats.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setCategoryFilter(c.id); setCategoryFilterOpen(false); setSelected(new Set()) }}
                      className={cn(
                        "w-full text-left px-2.5 py-1.5 text-xs rounded transition-colors flex items-center gap-2",
                        categoryFilter === c.id ? "bg-muted font-medium" : "hover:bg-muted/50"
                      )}
                    >
                      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </button>
                  ))}
                </>
              )}
              {businessIncomeCats.length > 0 && (
                <>
                  <div className="px-2.5 pt-2 pb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Business Income</div>
                  {businessIncomeCats.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setCategoryFilter(c.id); setCategoryFilterOpen(false); setSelected(new Set()) }}
                      className={cn(
                        "w-full text-left px-2.5 py-1.5 text-xs rounded transition-colors flex items-center gap-2",
                        categoryFilter === c.id ? "bg-muted font-medium" : "hover:bg-muted/50"
                      )}
                    >
                      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </button>
                  ))}
                </>
              )}
              {personalIncomeCats.length > 0 && (
                <>
                  <div className="px-2.5 pt-2 pb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Personal Income</div>
                  {personalIncomeCats.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setCategoryFilter(c.id); setCategoryFilterOpen(false); setSelected(new Set()) }}
                      className={cn(
                        "w-full text-left px-2.5 py-1.5 text-xs rounded transition-colors flex items-center gap-2",
                        categoryFilter === c.id ? "bg-muted font-medium" : "hover:bg-muted/50"
                      )}
                    >
                      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </button>
                  ))}
                </>
              )}
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Popover open={bulkPopoverOpen} onOpenChange={setBulkPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  Apply to {selected.size} selected <ChevronDown className="size-3 ml-1" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-2" align="end">
                <CategoryPickerContent
                  categories={categories}
                  onSelect={handleBulkApply}
                />
              </PopoverContent>
            </Popover>
          )}

          <ColumnsDropdown
            columnOrder={columnOrder}
            onColumnOrderChange={setColumnOrder}
            onReset={() => setColumnOrder(defaultColumnOrder)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-auto">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <thead className="bg-muted/40 border-b">
            <tr>
              <th className="px-3 py-2" style={{ width: 40 }}>
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                />
              </th>
              {visibleColumns.map((key) => {
                const w = colWidths[key] || DEFAULT_COL_WIDTHS[key]
                const widthStyle: React.CSSProperties = w ? { width: w, minWidth: MIN_COL_WIDTH } : { minWidth: MIN_COL_WIDTH }
                const thClass = "relative px-3 py-2 text-xs font-medium text-muted-foreground"

                if (key === "date") return (
                  <th key={key} className={cn(thClass, "text-left")} style={widthStyle}>
                    Date
                    <ResizeHandle columnKey={key} onResize={handleColResize} onDoubleClick={handleColResetWidth} />
                  </th>
                )
                if (key === "description") return (
                  <th key={key} className={cn(thClass, "text-left")} style={widthStyle}>
                    Description
                    <ResizeHandle columnKey={key} onResize={handleColResize} onDoubleClick={handleColResetWidth} />
                  </th>
                )
                if (key === "amount") return (
                  <th key={key} className={cn(thClass, "text-right")} style={widthStyle}>
                    <button className="inline-flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => { setAmountSort((s) => s === "asc" ? "desc" : s === "desc" ? null : "asc"); setCategorySort(null) }}>
                      Amount
                      {amountSort === "asc" ? <ArrowUp className="size-3" /> : amountSort === "desc" ? <ArrowDown className="size-3" /> : null}
                    </button>
                    <ResizeHandle columnKey={key} onResize={handleColResize} onDoubleClick={handleColResetWidth} />
                  </th>
                )
                if (key === "category") return (
                  <th key={key} className={cn(thClass, "text-left")} style={widthStyle}>
                    <button className="inline-flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => { const next = categorySort === "asc" ? "desc" : categorySort === "desc" ? null : "asc"; setCategorySort(next); setAmountSort(null); onCategorySortChange?.(next !== null) }}>
                      Category
                      {categorySort === "asc" ? <ArrowUp className="size-3" /> : categorySort === "desc" ? <ArrowDown className="size-3" /> : null}
                    </button>
                    <ResizeHandle columnKey={key} onResize={handleColResize} onDoubleClick={handleColResetWidth} />
                  </th>
                )
                if (key === "notes") return (
                  <th key={key} className={cn(thClass, "text-left")} style={widthStyle}>
                    Notes
                    <ResizeHandle columnKey={key} onResize={handleColResize} onDoubleClick={handleColResetWidth} />
                  </th>
                )
                return null
              })}
              <th className="px-3 py-2" style={{ width: 64 }}></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={visibleColumns.length + 2} className="py-12 text-center text-muted-foreground text-sm">
                <Loader2 className="size-5 animate-spin mx-auto mb-2" />Loading transactions…
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={visibleColumns.length + 2} className="py-12 text-center text-muted-foreground text-sm">
                {search.trim() ? "No matching transactions" : "No transactions for this filter"}
              </td></tr>
            ) : filtered.map((tx) => {
              const isCategorized = tx.taxType !== null
              const isUpdating = updatingId === tx.id
              const matchedRules = !isCategorized && !dismissedMatches.has(tx.id) ? ruleMatches.get(tx.id) : undefined
              const hasConflict = (matchedRules?.length ?? 0) > 1
              const matchedRule = hasConflict ? undefined : matchedRules?.[0]
              const displayTaxType = tx.taxType ?? matchedRule?.taxType ?? null
              const displayCategory = tx.category ?? matchedRule?.category ?? null
              const isMismatched = tx.type === "OUTFLOW" && tx.taxType === "service_income"

              return (
                <tr key={tx.id} className={cn(
                  "transition-colors",
                  selected.has(tx.id) ? "bg-primary/5" : "hover:bg-muted/30",
                  isMismatched ? "bg-orange-100/60 dark:bg-orange-950/30 ring-1 ring-inset ring-orange-300 dark:ring-orange-800"
                    : hasConflict ? "bg-orange-50/40 dark:bg-orange-950/10"
                    : matchedRule ? "bg-blue-50/40 dark:bg-blue-950/10"
                    : !isCategorized && "bg-amber-50/30 dark:bg-amber-950/10"
                )}>
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={selected.has(tx.id)}
                      onCheckedChange={() => toggleOne(tx.id)}
                    />
                  </td>
                  {visibleColumns.map((key) => {
                    if (key === "date") return (
                      <td key={key} className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(tx.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                    )
                    if (key === "description") return (
                      <td key={key} className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-sm truncate max-w-xs">
                            {tx.merchantName || tx.description}
                          </div>
                          {athMovilMatches.get(tx.id) && (
                            <span className="shrink-0 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                              → {athMovilMatches.get(tx.id)}
                            </span>
                          )}
                        </div>
                        {tx.merchantName && (
                          <div className="text-xs text-muted-foreground truncate max-w-xs">{tx.description}</div>
                        )}
                      </td>
                    )
                    if (key === "amount") return (
                      <td key={key} className="px-3 py-2 text-right font-mono text-sm">
                        <span className={tx.type === "INFLOW" ? "text-emerald-600 dark:text-emerald-400" : ""}>
                          {tx.type === "INFLOW" ? "+" : "-"}{fmt(tx.amount)}
                        </span>
                      </td>
                    )
                    if (key === "category") return (
                      <td key={key} className="px-3 py-2">
                        <Popover open={openPopoverId === tx.id} onOpenChange={(v) => setOpenPopoverId(v ? tx.id : null)}>
                          <PopoverTrigger asChild>
                            <button
                              className={cn(
                                "flex items-center gap-1.5 text-xs px-2 py-1 rounded border transition-colors w-full max-w-[200px]",
                                isCategorized
                                  ? "border-transparent bg-muted/40 hover:bg-muted"
                                  : hasConflict
                                    ? "border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20 hover:bg-orange-50 dark:hover:bg-orange-950/30"
                                    : matchedRule
                                      ? "border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                                      : "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                              )}
                              disabled={isUpdating}
                            >
                              {isUpdating
                                ? <Loader2 className="size-3 animate-spin shrink-0" />
                                : hasConflict
                                  ? <ChevronsUpDown className="size-3 text-orange-500 shrink-0" />
                                  : (isCategorized || matchedRule)
                                    ? <span
                                        className="size-2 rounded-full shrink-0"
                                        style={{
                                          backgroundColor: displayCategory?.color ||
                                            (displayTaxType === "service_income" ? "#10b981" : displayTaxType === "business" ? "#3b82f6" : "#8b5cf6")
                                        }}
                                      />
                                    : <Circle className="size-3 text-amber-500 shrink-0" />
                              }
                              <div className="flex flex-col items-start min-w-0">
                                {hasConflict ? (
                                  <>
                                    <span className="text-[10px] leading-tight text-orange-500">{matchedRules!.length} rules match</span>
                                    <span className="truncate leading-tight">Pick one</span>
                                  </>
                                ) : displayTaxType ? (
                                  <>
                                    {matchedRule && <span className="text-[10px] leading-tight text-blue-500">Rule match</span>}
                                    {!matchedRule && (
                                      <span className={cn(
                                        "text-[10px] leading-tight",
                                        displayTaxType === "personal" ? "text-purple-500" : "text-blue-500"
                                      )}>
                                        {displayTaxType === "service_income" ? "Service Income" : displayTaxType === "business" ? "Business" : "Personal"}
                                      </span>
                                    )}
                                    <span className="truncate leading-tight">
                                      {displayCategory?.name || (displayTaxType === "service_income" ? "Service Income" : "General")}
                                    </span>
                                  </>
                                ) : (
                                  <span className="truncate leading-tight">Uncategorized</span>
                                )}
                              </div>
                              <ChevronDown className="size-3 ml-auto shrink-0 text-muted-foreground" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80 p-2" align="start">
                            {hasConflict && (
                              <>
                                <div className="px-2 py-1.5 text-xs font-semibold text-orange-600 dark:text-orange-400">
                                  {matchedRules!.length} rules match — pick one
                                </div>
                                {matchedRules!.map((rule, ri) => (
                                  <button
                                    key={`${rule.pattern}:${rule.taxType}:${ri}`}
                                    onClick={() => {
                                      const cat: CategoryOption = rule.category
                                        ? { id: rule.category.id, name: rule.category.name, color: rule.category.color, groupName: rule.taxType === "business" ? "Business" : "Personal", taxType: rule.taxType as "business" | "personal", isIncome: rule.taxType === "service_income" }
                                        : { id: -3, name: "Service Income", color: "#10b981", groupName: "Business", taxType: "business" as const, isIncome: false }
                                      handleCategorySelect(tx, cat)
                                    }}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
                                  >
                                    <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: rule.category?.color || "#10b981" }} />
                                    <span className="truncate">{rule.category?.name || "Service Income"}</span>
                                    <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                                      {rule.taxType === "service_income" ? "Income" : rule.taxType === "business" ? "Biz" : "Personal"}
                                    </span>
                                  </button>
                                ))}
                                <div className="my-1.5 border-t" />
                              </>
                            )}
                            <CategoryPickerContent
                              categories={categories}
                              selectedId={tx.categoryId}
                              selectedTaxType={tx.taxType}
                              txType={tx.type}
                              onSelect={(cat) => handleCategorySelect(tx, cat)}
                              onClear={async () => {
                                setOpenPopoverId(null)
                                setUpdatingId(tx.id)
                                setDismissedMatches((prev) => new Set(prev).add(tx.id))
                                try {
                                  await onUpdate(tx.id, null, null)
                                } finally {
                                  setUpdatingId(null)
                                }
                              }}
                            />
                          </PopoverContent>
                        </Popover>
                      </td>
                    )
                    if (key === "notes") return (
                      <td key={key} className="px-3 py-2">
                        <InlineNotes
                          value={tx.notes ?? ""}
                          onSave={(notes) => onUpdateNotes(tx.id, notes)}
                        />
                      </td>
                    )
                    return null
                  })}
                  <td className="px-3 py-2">
                    {hasConflict ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 text-muted-foreground hover:text-destructive"
                        onClick={() => setDismissedMatches((prev) => new Set(prev).add(tx.id))}
                      >
                        <X className="size-4" />
                      </Button>
                    ) : matchedRule ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                          disabled={isUpdating}
                          onClick={() => onUpdate(tx.id, matchedRule.categoryId, matchedRule.taxType)}
                        >
                          <CheckCircle2 className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 text-muted-foreground hover:text-destructive"
                          onClick={() => setDismissedMatches((prev) => new Set(prev).add(tx.id))}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

    </div>
  )
}

function RuleToast({
  toastId,
  initialPattern,
  categoryName,
  taxType,
  onSave,
}: {
  toastId: string | number
  initialPattern: string
  categoryName: string
  taxType: string
  onSave: (pattern: string) => void
}) {
  const [pattern, setPattern] = useState(initialPattern)
  const [editing, setEditing] = useState(false)
  const label = taxType === "service_income" ? "Service Income" : taxType === "business" ? "Business" : "Personal"

  return (
    <div
      className="bg-background border rounded-lg shadow-lg p-3 w-[356px] space-y-2"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
    >
      <div className="text-sm font-medium">Save as rule?</div>
      <div className="text-xs text-muted-foreground">
        → {categoryName} ({label})
      </div>
      {editing ? (
        <Input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") setEditing(false); if (e.key === "Escape") { setPattern(initialPattern); setEditing(false) } }}
          onBlur={() => setEditing(false)}
          className="h-9 text-sm font-mono"
          autoFocus
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="w-full text-left text-sm font-mono bg-muted/50 rounded px-2 py-2 hover:bg-muted transition-colors truncate"
          title="Click to edit pattern"
        >
          {pattern}
        </button>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toast.dismiss(toastId)}>
          Dismiss
        </Button>
        <Button size="sm" className="h-7 text-xs" onClick={() => onSave(pattern)}>
          Save Rule
        </Button>
      </div>
    </div>
  )
}

function InlineNotes({ value, onSave }: { value: string; onSave: (notes: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  function startEdit() {
    setDraft(value)
    setEditing(true)
  }

  function save() {
    const trimmed = draft.trim()
    if (trimmed !== value) onSave(trimmed)
    setEditing(false)
  }

  if (editing) {
    return (
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save()
          if (e.key === "Escape") setEditing(false)
        }}
        className="h-6 text-xs px-1.5"
        autoFocus
      />
    )
  }

  return (
    <button
      onClick={startEdit}
      className="text-xs text-muted-foreground hover:text-foreground truncate max-w-[150px] block text-left"
      title={value || "Add note"}
    >
      {value || <span className="italic opacity-50">—</span>}
    </button>
  )
}

