"use client"

import { useMemo, useState } from "react"
import { Briefcase, User, CheckCircle2, X, ChevronDown, TrendingUp } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────

export interface CategoryOption {
  id: number
  name: string
  color: string
  groupName: string // "Business" or "Personal"
  taxType: "business" | "personal" | "service_income"
  // true when this category lives under a reserved Income subgroup
  // (Business > Income or Personal > Income). Used by the picker to show
  // different options for INFLOW vs OUTFLOW transactions.
  isIncome: boolean
  // Optional flag — propagated from the category record so the finances
  // transaction dialog can remind the user to attach a receipt.
  attachmentPrompt?: boolean
}

export interface CategoryNodeWithPrompt extends CategoryNode {
  attachmentPrompt?: boolean
}

// Nested shape returned by /api/finances/categories
export interface CategoryNode {
  id: number
  name: string
  color: string
  slug: string
  isGroup: boolean
  isSystemGroup: boolean
  children?: CategoryNode[]
}

// ── Walker: tree → flat CategoryOption[] ──────────────────────────

/**
 * Walks the nested category tree returned by /api/finances/categories and
 * produces a flat list of CategoryOption entries. Used by every caller so
 * all three pickers in the app share one source of truth.
 *
 * Rules:
 * - Root system groups (Business/Personal) appear as "General" expense options.
 * - The reserved `business-income` / `personal-income` subgroups appear as
 *   "General Income" options and flag their descendants as isIncome=true.
 * - Leaves under Business > Income get taxType="service_income"; all other
 *   business leaves keep taxType="business"; personal leaves keep
 *   taxType="personal" regardless of income-ness.
 */
export function flattenCategoryTree(roots: CategoryNodeWithPrompt[]): CategoryOption[] {
  const flat: CategoryOption[] = []

  function walk(node: CategoryNodeWithPrompt, rootTaxType: "business" | "personal" | null, insideIncome: boolean) {
    const taxType: "business" | "personal" | null =
      node.isSystemGroup
        ? node.slug === "business" ? "business" : "personal"
        : rootTaxType

    const isIncomeSubgroup = node.slug === "business-income" || node.slug === "personal-income"
    const nowInsideIncome = insideIncome || isIncomeSubgroup

    if (node.isSystemGroup && taxType !== null) {
      flat.push({
        id: node.id, name: "General", color: node.color,
        groupName: taxType === "business" ? "Business" : "Personal",
        taxType, isIncome: false,
        attachmentPrompt: node.attachmentPrompt,
      })
    } else if (isIncomeSubgroup && taxType !== null) {
      flat.push({
        id: node.id, name: "General Income", color: node.color,
        groupName: taxType === "business" ? "Business" : "Personal",
        taxType: taxType === "business" ? "service_income" : "personal",
        isIncome: true,
        attachmentPrompt: node.attachmentPrompt,
      })
    } else if (!node.isGroup && !node.isSystemGroup && taxType !== null) {
      flat.push({
        id: node.id, name: node.name, color: node.color,
        groupName: taxType === "business" ? "Business" : "Personal",
        taxType: nowInsideIncome && taxType === "business" ? "service_income" : taxType,
        isIncome: nowInsideIncome,
        attachmentPrompt: node.attachmentPrompt,
      })
    }
    node.children?.forEach((c) => walk(c as CategoryNodeWithPrompt, taxType, nowInsideIncome))
  }

  roots.forEach((r) => walk(r, null, false))
  return flat
}

// ── Inner picker content (two-column layout) ──────────────────────

interface CategoryPickerContentProps {
  categories: CategoryOption[]
  selectedId?: number | null
  selectedTaxType?: string | null
  /** Unused for layout — kept for API compatibility with legacy callers. */
  txType?: string
  onSelect: (cat: CategoryOption) => void
  onClear?: () => void
}

/**
 * Two-column picker used inside a Popover. Shared by the transaction table,
 * the rule manager, and the finances transaction dialog.
 */
export function CategoryPickerContent({
  categories,
  selectedId,
  selectedTaxType,
  onSelect,
  onClear,
}: CategoryPickerContentProps) {
  const { businessCats, personalCats, businessIncomeCats, personalIncomeCats } = useMemo(() => {
    return {
      businessCats: categories.filter(
        (c) => !c.isIncome && c.taxType === "business" && c.name.toLowerCase() !== "service income"
      ),
      personalCats: categories.filter((c) => !c.isIncome && c.taxType === "personal"),
      businessIncomeCats: categories.filter((c) => c.isIncome && c.taxType === "service_income"),
      personalIncomeCats: categories.filter((c) => c.isIncome && c.taxType === "personal"),
    }
  }, [categories])

  const isSelected = (c: CategoryOption) =>
    selectedId === c.id ||
    (selectedId == null &&
      selectedTaxType &&
      !selectedTaxType.startsWith("service") &&
      c.name === "General" &&
      c.taxType === selectedTaxType)

  const hasCurrent = selectedId != null || selectedTaxType != null

  const renderCat = (c: CategoryOption) => (
    <button
      type="button"
      key={c.id}
      onClick={() => onSelect(c)}
      className={cn(
        "w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors",
        isSelected(c) && "bg-muted font-medium"
      )}
    >
      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
      <span className="truncate">{c.name}</span>
      {isSelected(c) && <CheckCircle2 className="size-3 shrink-0 text-primary" />}
    </button>
  )

  // Always render all four sections: expense (top) and income (bottom) for
  // both Business and Personal columns. This keeps the picker identical in
  // every context — bulk apply, per-row, rule manager, and finances dialog.
  return (
    <div className="flex flex-col min-w-0">
      {onClear && hasCurrent && (
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors mb-0.5"
        >
          <X className="size-3" />
          Clear category
        </button>
      )}
      <div className="flex gap-0.5 min-w-0">
        {/* Business column — income on top, expense below */}
        <div className="flex-1 min-w-0">
          <div className="px-2 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <TrendingUp className="size-3" /> Business Income
          </div>
          {businessIncomeCats.length === 0 && (
            <div className="px-2 py-1 text-[10px] text-muted-foreground italic">
              No income sources
            </div>
          )}
          {businessIncomeCats.map(renderCat)}
          <div className="mt-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
            <Briefcase className="size-3" /> Business
          </div>
          {businessCats.map(renderCat)}
        </div>
        <div className="w-px bg-border shrink-0" />
        {/* Personal column — income on top, expense below */}
        <div className="flex-1 min-w-0">
          <div className="px-2 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <TrendingUp className="size-3" /> Personal Income
          </div>
          {personalIncomeCats.length === 0 && (
            <div className="px-2 py-1 text-[10px] text-muted-foreground italic">
              No income sources
            </div>
          )}
          {personalIncomeCats.map(renderCat)}
          <div className="mt-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
            <User className="size-3" /> Personal
          </div>
          {personalCats.map(renderCat)}
        </div>
      </div>
    </div>
  )
}

// ── Form-field wrapper (button + popover) ─────────────────────────

interface CategoryPickerButtonProps {
  categories: CategoryOption[]
  value: number | null
  onChange: (categoryId: number | null, taxType: string | null, isIncome: boolean) => void
  /** Direction hint — when "INFLOW" the picker shows income categories. */
  txType?: string
  placeholder?: string
  id?: string
  className?: string
  allowClear?: boolean
}

/**
 * Button + popover wrapper that acts as a form field. Used wherever the old
 * <Select>-based category picker used to live.
 */
export function CategoryPickerButton({
  categories,
  value,
  onChange,
  txType,
  placeholder = "Select category...",
  id,
  className,
  allowClear = true,
}: CategoryPickerButtonProps) {
  const [open, setOpen] = useState(false)
  const selected = useMemo(
    () => (value != null ? categories.find((c) => c.id === value) : null),
    [categories, value]
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md border bg-transparent px-3 text-sm shadow-sm transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        >
          {selected ? (
            <>
              <span
                className="size-2.5 rounded-full shrink-0"
                style={{ backgroundColor: selected.color }}
              />
              <span className="truncate">{selected.name}</span>
              <span className="text-[10px] text-muted-foreground ml-1 shrink-0">
                {selected.groupName}
                {selected.isIncome ? " · Income" : ""}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground truncate">{placeholder}</span>
          )}
          <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <CategoryPickerContent
          categories={categories}
          selectedId={value}
          txType={txType}
          onSelect={(cat) => {
            onChange(cat.id, cat.taxType, cat.isIncome)
            setOpen(false)
          }}
          onClear={
            allowClear
              ? () => {
                  onChange(null, null, false)
                  setOpen(false)
                }
              : undefined
          }
        />
      </PopoverContent>
    </Popover>
  )
}
