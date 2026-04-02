"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Trash2, Loader2, Briefcase, User, BookMarked, Pencil, Check, X, TrendingUp, Plus, ChevronDown, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

interface TaxRule {
  id: number
  pattern: string
  taxType: string
  applyCount: number
  category: { id: number; name: string; color: string } | null
}

interface CategoryOption {
  id: number
  name: string
  color: string
  groupName: string
  taxType: "business" | "personal"
}

interface EditState {
  pattern: string
  categoryId: number | null
  taxType: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RuleManagerSheet({ open, onOpenChange }: Props) {
  const [rules, setRules] = useState<TaxRule[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editState, setEditState] = useState<EditState>({ pattern: "", categoryId: 0, taxType: "" })
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newRule, setNewRule] = useState<EditState>({ pattern: "", categoryId: null, taxType: "" })
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [closedGroups, setClosedGroups] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("tax-rule-closed-groups")
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch { return new Set() }
  })

  function toggleGroup(key: string) {
    setClosedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      localStorage.setItem("tax-rule-closed-groups", JSON.stringify([...next]))
      return next
    })
  }

  const fetchCategories = useCallback(async () => {
    const res = await fetch("/api/finances/categories")
    const data = await res.json()
    if (data.success) {
      type CatNode = {
        id: number; name: string; color: string; slug: string
        isGroup: boolean; isSystemGroup: boolean
        children?: CatNode[]
      }
      const flat: CategoryOption[] = []
      function walk(node: CatNode, rootTaxType: "business" | "personal" | null) {
        const taxType: "business" | "personal" | null =
          node.isSystemGroup
            ? node.slug === "business" ? "business" : "personal"
            : rootTaxType
        if (node.isSystemGroup && taxType !== null) {
          flat.push({ id: node.id, name: "General", color: node.color, groupName: taxType === "business" ? "Business" : "Personal", taxType })
        } else if (!node.isGroup && !node.isSystemGroup && taxType !== null) {
          flat.push({ id: node.id, name: node.name, color: node.color, groupName: taxType === "business" ? "Business" : "Personal", taxType })
        }
        if (node.children) node.children.forEach((c) => walk(c, taxType))
      }
      for (const root of data.data as CatNode[]) walk(root, null)
      setCategories(flat)
    }
  }, [])

  async function fetchRules() {
    setLoading(true)
    try {
      const res = await fetch("/api/tax/rules")
      const data = await res.json()
      if (data.success) setRules(data.data.rules)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      fetchRules()
      fetchCategories()
    } else {
      setEditingId(null)
      setAdding(false)
    }
  }, [open, fetchCategories])

  function startEdit(rule: TaxRule) {
    setEditingId(rule.id)
    setEditState({ pattern: rule.pattern, categoryId: rule.category?.id ?? null, taxType: rule.taxType })
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function saveEdit(id: number) {
    setSaving(true)
    try {
      const res = await fetch(`/api/tax/rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editState),
      })
      const data = await res.json()
      if (data.success) {
        setRules((prev) => prev.map((r) => r.id === id ? { ...r, ...data.data.rule } : r))
        setEditingId(null)
      }
    } finally {
      setSaving(false)
    }
  }

  async function createRule() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/tax/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRule),
      })
      const data = await res.json()
      if (data.success) {
        setRules((prev) => [data.data.rule, ...prev])
        setAdding(false)
        setNewRule({ pattern: "", categoryId: null, taxType: "" })
      } else {
        setError(data.error || "Failed to create rule")
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id)
    try {
      await fetch(`/api/tax/rules/${id}`, { method: "DELETE" })
      setRules((prev) => prev.filter((r) => r.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  const businessCats = categories.filter((c) => c.taxType === "business")
  const personalCats = categories.filter((c) => c.taxType === "personal")

  // Group rules by category name for collapsible display
  const groupedRules = useMemo(() => {
    const q = search.toLowerCase().trim()
    const filtered = q
      ? rules.filter((r) => r.pattern.toLowerCase().includes(q) || (r.category?.name || "").toLowerCase().includes(q))
      : rules

    const groups: { key: string; label: string; color: string; taxType: string; rules: TaxRule[] }[] = []
    const groupMap = new Map<string, typeof groups[number]>()

    for (const rule of filtered) {
      const catName = rule.category?.name || (rule.taxType === "service_income" ? "Service Income" : "Uncategorized")
      const taxLabel = rule.taxType === "service_income" ? "Income" : rule.taxType === "business" ? "Business" : "Personal"
      const key = `${catName}:${rule.taxType}`
      const color = rule.category?.color || (rule.taxType === "service_income" ? "#10b981" : "#6b7280")
      if (!groupMap.has(key)) {
        const label = `${catName} (${taxLabel})`
        const group = { key, label, color, taxType: rule.taxType, rules: [] as TaxRule[] }
        groupMap.set(key, group)
        groups.push(group)
      }
      groupMap.get(key)!.rules.push(rule)
    }

    return groups
  }, [rules, search])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] sm:max-w-[420px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookMarked className="size-4" /> Categorization Rules
          </SheetTitle>
          <SheetDescription>
            Rules are automatically applied when you upload a CSV or process a new month. They match transaction descriptions using regex patterns.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 shrink-0">
          {!adding && (
            <Button variant="outline" size="sm" className="w-full" onClick={() => { setAdding(true); setEditingId(null) }}>
              <Plus className="size-3.5 mr-1.5" /> Add Rule
            </Button>
          )}
          {adding && (
            <div className="p-3 rounded-md border border-primary/30 bg-muted/30 space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Pattern (regex)</label>
                <Input
                  value={newRule.pattern}
                  onChange={(e) => setNewRule((s) => ({ ...s, pattern: e.target.value }))}
                  className="h-8 text-xs font-mono"
                  placeholder="e.g. Shell|Exxon"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Category</label>
                <Select
                  value={newRule.categoryId !== null ? String(newRule.categoryId) : newRule.taxType === "service_income" ? "service_income" : ""}
                  onValueChange={(v) => {
                    if (v === "service_income") {
                      setNewRule((s) => ({ ...s, categoryId: null, taxType: "service_income" }))
                    } else {
                      const cat = categories.find((c) => c.id === Number(v))
                      if (cat) setNewRule((s) => ({ ...s, categoryId: cat.id, taxType: cat.taxType }))
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="service_income">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="size-3 text-emerald-500 shrink-0" />
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
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" className="h-7 text-xs" onClick={createRule} disabled={saving || !newRule.pattern.trim() || !newRule.taxType}>
                  {saving ? <Loader2 className="size-3 animate-spin mr-1" /> : <Plus className="size-3 mr-1" />}
                  Add
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setAdding(false); setNewRule({ pattern: "", categoryId: null, taxType: "" }); setError(null) }} disabled={saving}>
                  <X className="size-3 mr-1" /> Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {rules.length > 0 && (
          <div className="px-4 mt-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search rules..."
                className="h-8 text-xs pl-8 pr-7"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="mt-3 px-4 flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : rules.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              <BookMarked className="size-8 mx-auto mb-2 opacity-30" />
              No rules saved yet. Categorize transactions and choose to save the pattern as a rule.
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground mb-3">{rules.length} rules across {groupedRules.length} categories</div>
              {groupedRules.map((group) => (
                <Collapsible key={group.key} open={!closedGroups.has(group.key)} onOpenChange={() => toggleGroup(group.key)}>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors group/trigger">
                    <ChevronDown className="size-3 text-muted-foreground transition-transform group-data-[state=closed]/trigger:-rotate-90" />
                    <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                    <span className="text-xs font-medium truncate">{group.label}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{group.rules.length}</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-1.5 pl-3 mt-1 mb-2">
                      {group.rules.map((rule) => (
                        <div key={rule.id}>
                          {editingId === rule.id ? (
                            <div className="p-3 rounded-md border border-primary/30 bg-muted/30 space-y-3">
                              <div className="space-y-1.5">
                                <label className="text-xs text-muted-foreground font-medium">Pattern (regex)</label>
                                <Input
                                  value={editState.pattern}
                                  onChange={(e) => setEditState((s) => ({ ...s, pattern: e.target.value }))}
                                  className="h-8 text-xs font-mono"
                                  placeholder="e.g. Shell|Exxon"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-xs text-muted-foreground font-medium">Category</label>
                                <Select
                                  value={editState.categoryId !== null ? String(editState.categoryId) : "service_income"}
                                  onValueChange={(v) => {
                                    if (v === "service_income") {
                                      setEditState((s) => ({ ...s, categoryId: null, taxType: "service_income" }))
                                    } else {
                                      const cat = categories.find((c) => c.id === Number(v))
                                      if (cat) setEditState((s) => ({ ...s, categoryId: cat.id, taxType: cat.taxType }))
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="service_income">
                                      <div className="flex items-center gap-2">
                                        <TrendingUp className="size-3 text-emerald-500 shrink-0" />
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
                              </div>
                              <div className="flex items-center gap-2 pt-1">
                                <Button size="sm" className="h-7 text-xs" onClick={() => saveEdit(rule.id)} disabled={saving || !editState.pattern.trim()}>
                                  {saving ? <Loader2 className="size-3 animate-spin mr-1" /> : <Check className="size-3 mr-1" />}
                                  Save
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={cancelEdit} disabled={saving}>
                                  <X className="size-3 mr-1" /> Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 px-2.5 py-2 rounded-md border bg-muted/20 group">
                              <div className="flex-1 min-w-0 flex items-center gap-2">
                                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono truncate">
                                  {rule.pattern}
                                </code>
                                {rule.applyCount > 0 && (
                                  <span className="text-xs text-muted-foreground ml-auto shrink-0">{rule.applyCount}×</span>
                                )}
                              </div>

                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-muted-foreground hover:text-foreground"
                                  onClick={() => startEdit(rule)}
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-muted-foreground hover:text-destructive"
                                  onClick={() => handleDelete(rule.id)}
                                  disabled={deletingId === rule.id}
                                >
                                  {deletingId === rule.id
                                    ? <Loader2 className="size-3.5 animate-spin" />
                                    : <Trash2 className="size-3.5" />
                                  }
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
