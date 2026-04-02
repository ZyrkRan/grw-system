"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Briefcase,
  User,
  TrendingUp,
  BookMarked,
  Sparkles,
  Check,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { type CategoryOption } from "./transaction-table"

interface MatchTransaction {
  id: number
  date: string
  description: string
  merchantName: string | null
  amount: number
  type: string
}

interface MatchGroup {
  pattern: string
  categoryId: number | null
  taxType: string
  category: { id: number; name: string; color: string } | null
  matchSource: "rule" | "history"
  ruleId?: number
  transactions: MatchTransaction[]
}

interface TxOverride {
  categoryId: number | null
  taxType: string
  category: { id: number; name: string; color: string } | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  month: string // "YYYY-MM"
  categories: CategoryOption[]
  onApply: (updates: { ids: number[]; categoryId: number | null; taxType: string; saveRule?: { pattern: string; categoryId: number | null; taxType: string } }[]) => Promise<void>
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n)
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

export function SmartCategorizeDialog({ open, onOpenChange, month, categories, onApply }: Props) {
  const [groups, setGroups] = useState<MatchGroup[]>([])
  const [unmatchedCount, setUnmatchedCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [confirmed, setConfirmed] = useState<Set<number>>(new Set())
  const [skipped, setSkipped] = useState<Set<number>>(new Set())
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [categoryOverrides, setCategoryOverrides] = useState<Map<number, { categoryId: number | null; taxType: string; category: { id: number; name: string; color: string } | null }>>(new Map())
  const [txOverrides, setTxOverrides] = useState<Map<number, TxOverride>>(new Map())
  const [saveRulesPrompt, setSaveRulesPrompt] = useState(false)
  const [rulesToSave, setRulesToSave] = useState<Set<number>>(new Set())
  const [done, setDone] = useState(false)
  const [debugInfo, setDebugInfo] = useState<Record<string, unknown> | null>(null)

  const businessCats = useMemo(() => categories.filter((c) => c.taxType === "business"), [categories])
  const personalCats = useMemo(() => categories.filter((c) => c.taxType === "personal"), [categories])

  async function fetchMatches() {
    setLoading(true)
    setConfirmed(new Set())
    setSkipped(new Set())
    setExpanded(new Set())
    setCategoryOverrides(new Map())
    setTxOverrides(new Map())
    setSaveRulesPrompt(false)
    setDone(false)
    try {
      const res = await fetch("/api/tax/smart-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      })
      const data = await res.json()
      if (data.success) {
        setGroups(data.data.groups)
        setUnmatchedCount(data.data.unmatchedCount)
        if (data.data._debug) {
          console.log("[smart-match debug]", data.data._debug)
          setDebugInfo(data.data._debug)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  // Fetch when dialog opens — useEffect is needed because Radix controlled
  // Dialog does not call onOpenChange when the open prop changes from the parent.
  const prevOpen = useRef(false)
  useEffect(() => {
    if (open && !prevOpen.current) {
      fetchMatches()
    }
    prevOpen.current = open
  }, [open])

  const confirmedCount = confirmed.size
  const totalGroups = groups.length
  const confirmedTxCount = groups
    .filter((_, i) => confirmed.has(i))
    .reduce((sum, g) => sum + g.transactions.length, 0)
  // Count tx overrides that belong to skipped/unconfirmed groups (individual confirms)
  const pendingGroups = groups.filter((_, i) => !confirmed.has(i) && !skipped.has(i))

  function toggleExpand(idx: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function confirmGroup(idx: number) {
    setConfirmed((prev) => new Set(prev).add(idx))
    setSkipped((prev) => {
      const next = new Set(prev)
      next.delete(idx)
      return next
    })
  }

  function skipGroup(idx: number) {
    setSkipped((prev) => new Set(prev).add(idx))
    setConfirmed((prev) => {
      const next = new Set(prev)
      next.delete(idx)
      return next
    })
  }

  function overrideGroupCategory(idx: number, catId: number | null, taxType: string, category: { id: number; name: string; color: string } | null) {
    setCategoryOverrides((prev) => {
      const next = new Map(prev)
      next.set(idx, { categoryId: catId, taxType, category })
      return next
    })
  }

  function overrideTxCategory(txId: number, catId: number | null, taxType: string, category: { id: number; name: string; color: string } | null) {
    setTxOverrides((prev) => {
      const next = new Map(prev)
      next.set(txId, { categoryId: catId, taxType, category })
      return next
    })
  }

  function clearTxOverride(txId: number) {
    setTxOverrides((prev) => {
      const next = new Map(prev)
      next.delete(txId)
      return next
    })
  }

  function confirmAll() {
    const all = new Set<number>()
    groups.forEach((_, i) => { if (!skipped.has(i)) all.add(i) })
    setConfirmed(all)
  }

  async function applyConfirmed() {
    setApplying(true)
    try {
      const updates: { ids: number[]; categoryId: number | null; taxType: string; saveRule?: { pattern: string; categoryId: number | null; taxType: string } }[] = []

      for (let i = 0; i < groups.length; i++) {
        if (!confirmed.has(i)) continue
        const group = groups[i]
        const override = categoryOverrides.get(i)
        const catId = override?.categoryId ?? group.categoryId
        const taxType = override?.taxType ?? group.taxType

        // Transactions without individual overrides
        const groupTxIds = group.transactions
          .filter((tx) => !txOverrides.has(tx.id))
          .map((tx) => tx.id)

        if (groupTxIds.length > 0) {
          updates.push({
            ids: groupTxIds,
            categoryId: catId,
            taxType,
            ...(rulesToSave.has(i) && group.matchSource === "history"
              ? { saveRule: { pattern: group.pattern, categoryId: catId, taxType } }
              : {}),
          })
        }

        // Individual overrides within this group
        for (const tx of group.transactions) {
          const txOv = txOverrides.get(tx.id)
          if (txOv) {
            updates.push({
              ids: [tx.id],
              categoryId: txOv.categoryId,
              taxType: txOv.taxType,
            })
          }
        }
      }

      if (updates.length > 0) {
        await onApply(updates)
      }

      setDone(true)
    } finally {
      setApplying(false)
    }
  }

  function handleApplyClick() {
    // Check if there are history-based groups that could be saved as rules
    const historyConfirmed = groups
      .map((g, i) => ({ g, i }))
      .filter(({ g, i }) => confirmed.has(i) && g.matchSource === "history")

    if (historyConfirmed.length > 0 && !saveRulesPrompt) {
      setSaveRulesPrompt(true)
      // Pre-select all by default
      setRulesToSave(new Set(historyConfirmed.map(({ i }) => i)))
      return
    }

    applyConfirmed()
  }

  function getEffectiveCategory(idx: number): { categoryId: number | null; taxType: string; category: { id: number; name: string; color: string } | null } {
    const override = categoryOverrides.get(idx)
    if (override) return override
    const g = groups[idx]
    return { categoryId: g.categoryId, taxType: g.taxType, category: g.category }
  }

  function CategoryPicker({ value, onChange, size = "sm" }: {
    value: { categoryId: number | null; taxType: string }
    onChange: (catId: number | null, taxType: string, category: { id: number; name: string; color: string } | null) => void
    size?: "sm" | "xs"
  }) {
    return (
      <Select
        value={value.categoryId !== null ? String(value.categoryId) : value.taxType === "service_income" ? "service_income" : "none"}
        onValueChange={(v) => {
          if (v === "service_income") {
            onChange(null, "service_income", null)
          } else {
            const cat = categories.find((c) => c.id === Number(v))
            if (cat) onChange(cat.id, cat.taxType, { id: cat.id, name: cat.name, color: cat.color })
          }
        }}
      >
        <SelectTrigger className={cn(size === "xs" ? "h-6 text-xs" : "h-7 text-xs", "w-[160px]")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="service_income">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-3 text-emerald-500" />
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">Service Income</span>
            </div>
          </SelectItem>
          {businessCats.length > 0 && (
            <div className="px-2 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1">
              <Briefcase className="size-3" /> Business
            </div>
          )}
          {businessCats.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                {c.name}
              </div>
            </SelectItem>
          ))}
          {personalCats.length > 0 && (
            <div className="px-2 py-1 text-xs font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1">
              <User className="size-3" /> Personal
            </div>
          )}
          {personalCats.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                {c.name}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (done) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-green-500" /> Done
            </DialogTitle>
            <DialogDescription>
              {confirmedTxCount} transactions categorized across {confirmedCount} groups.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  if (saveRulesPrompt) {
    const historyConfirmed = groups
      .map((g, i) => ({ g, i }))
      .filter(({ g, i }) => confirmed.has(i) && g.matchSource === "history")

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookMarked className="size-5" /> Save as Rules?
            </DialogTitle>
            <DialogDescription>
              These patterns were matched from history. Save them as permanent rules so they auto-apply on future imports?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[300px] overflow-y-auto py-2">
            {historyConfirmed.map(({ g, i }) => {
              const eff = getEffectiveCategory(i)
              return (
                <label key={i} className="flex items-center gap-3 p-2 rounded-md border bg-muted/20 cursor-pointer hover:bg-muted/40">
                  <input
                    type="checkbox"
                    checked={rulesToSave.has(i)}
                    onChange={(e) => {
                      setRulesToSave((prev) => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(i)
                        else next.delete(i)
                        return next
                      })
                    }}
                    className="rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded truncate block max-w-[280px]">{g.pattern}</code>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="size-2 rounded-full" style={{ backgroundColor: eff.category?.color ?? "#10b981" }} />
                      <span className="text-xs text-muted-foreground">{eff.category?.name ?? "Service Income"}</span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{g.transactions.length} tx</span>
                </label>
              )
            })}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setRulesToSave(new Set()); applyConfirmed() }} disabled={applying}>
              Skip, just apply
            </Button>
            <Button onClick={() => applyConfirmed()} disabled={applying}>
              {applying ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Save {rulesToSave.size} rules & apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5" /> Smart Categorize — {monthLabel(month)}
          </DialogTitle>
          <DialogDescription>
            {loading
              ? "Scanning transaction history..."
              : groups.length === 0
                ? "No matches found."
                : `${groups.length} pattern groups, ${groups.reduce((s, g) => s + g.transactions.length, 0)} transactions matched`
            }
            {!loading && unmatchedCount > 0 && ` · ${unmatchedCount} unmatched`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 py-2 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">
              <Sparkles className="size-8 mx-auto mb-2 opacity-30" />
              No patterns found. Categorize some transactions first to build history.
              {debugInfo && (
                <pre className="mt-4 text-left text-xs bg-muted/50 p-3 rounded max-h-40 overflow-auto">
                  {JSON.stringify(debugInfo, null, 2)}
                </pre>
              )}
            </div>
          ) : (
            groups.map((group, idx) => {
              const isConfirmed = confirmed.has(idx)
              const isSkipped = skipped.has(idx)
              const isExpanded = expanded.has(idx)
              const eff = getEffectiveCategory(idx)

              return (
                <div
                  key={idx}
                  className={cn(
                    "rounded-lg border transition-all",
                    isConfirmed && "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20",
                    isSkipped && "border-muted bg-muted/20 opacity-50",
                    !isConfirmed && !isSkipped && "border-border bg-card",
                  )}
                >
                  {/* Group header */}
                  <div className="flex items-center gap-3 p-3">
                    <button onClick={() => toggleExpand(idx)} className="shrink-0 text-muted-foreground hover:text-foreground">
                      {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate max-w-[250px]">{group.pattern}</span>
                        <Badge variant="outline" className={cn(
                          "text-xs h-5 px-1.5 shrink-0",
                          group.matchSource === "rule"
                            ? "border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400"
                            : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400"
                        )}>
                          {group.matchSource === "rule" ? "Rule" : "History"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className="size-2 rounded-full shrink-0"
                          style={{ backgroundColor: eff.category?.color ?? (eff.taxType === "service_income" ? "#10b981" : "#6b7280") }}
                        />
                        <span className="text-xs text-muted-foreground">
                          {eff.category?.name ?? (eff.taxType === "service_income" ? "Service Income" : "General")}
                        </span>
                        <span className="text-xs text-muted-foreground">· {group.transactions.length} transactions</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {!isConfirmed && !isSkipped && (
                        <CategoryPicker
                          value={{ categoryId: eff.categoryId, taxType: eff.taxType }}
                          onChange={(catId, taxType, cat) => overrideGroupCategory(idx, catId, taxType, cat)}
                        />
                      )}
                      {isConfirmed ? (
                        <Button variant="ghost" size="sm" className="h-7 text-green-600" onClick={() => { setConfirmed((p) => { const n = new Set(p); n.delete(idx); return n }) }}>
                          <CheckCircle2 className="size-4 mr-1" /> Confirmed
                        </Button>
                      ) : isSkipped ? (
                        <Button variant="ghost" size="sm" className="h-7 text-muted-foreground" onClick={() => { setSkipped((p) => { const n = new Set(p); n.delete(idx); return n }) }}>
                          <XCircle className="size-4 mr-1" /> Skipped
                        </Button>
                      ) : (
                        <>
                          <Button variant="outline" size="icon" className="size-7 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950" onClick={() => confirmGroup(idx)}>
                            <Check className="size-4" />
                          </Button>
                          <Button variant="outline" size="icon" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => skipGroup(idx)}>
                            <X className="size-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expanded transaction list */}
                  {isExpanded && (
                    <div className="border-t px-3 pb-3">
                      <div className="space-y-1 pt-2">
                        {group.transactions.map((tx) => {
                          const txOv = txOverrides.get(tx.id)
                          return (
                            <div key={tx.id} className={cn(
                              "flex items-center gap-2 py-1.5 px-2 rounded text-xs",
                              txOv ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800" : "bg-muted/30"
                            )}>
                              <span className="text-muted-foreground w-[70px] shrink-0">{tx.date}</span>
                              <span className="flex-1 truncate">{tx.description}</span>
                              <span className={cn("w-[80px] text-right shrink-0 font-mono", tx.type === "INFLOW" ? "text-green-600" : "text-red-600")}>
                                {tx.type === "INFLOW" ? "+" : "-"}{fmt(Math.abs(tx.amount))}
                              </span>
                              {txOv ? (
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className="size-2 rounded-full" style={{ backgroundColor: txOv.category?.color ?? "#10b981" }} />
                                  <span className="text-xs">{txOv.category?.name ?? "Service Income"}</span>
                                  <Button variant="ghost" size="icon" className="size-5" onClick={() => clearTxOverride(tx.id)}>
                                    <X className="size-3" />
                                  </Button>
                                </div>
                              ) : (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-5 text-xs text-muted-foreground hover:text-foreground px-1">
                                      Override
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-[200px] p-2" align="end">
                                    <div className="space-y-1">
                                      <div className="text-xs font-medium text-muted-foreground mb-1">Set different category</div>
                                      <CategoryPicker
                                        value={{ categoryId: eff.categoryId, taxType: eff.taxType }}
                                        onChange={(catId, taxType, cat) => overrideTxCategory(tx.id, catId, taxType, cat)}
                                        size="xs"
                                      />
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {!loading && groups.length > 0 && (
          <DialogFooter className="border-t pt-3 gap-2 flex-row justify-between items-center">
            <div className="text-xs text-muted-foreground">
              {confirmedCount} confirmed · {skipped.size} skipped · {pendingGroups.length} pending
            </div>
            <div className="flex items-center gap-2">
              {pendingGroups.length > 0 && (
                <Button variant="outline" size="sm" onClick={confirmAll}>
                  Confirm all {pendingGroups.length}
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleApplyClick}
                disabled={confirmedCount === 0 || applying}
              >
                {applying ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                Apply {confirmedCount} groups ({confirmedTxCount} tx)
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
