"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Upload, BookMarked, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

import { MonthSidebar, type MonthStat } from "@/components/tax/month-sidebar"
import { TransactionTable, type TaxTx, type CategoryOption } from "@/components/tax/transaction-table"
import { MonthlyReport, type ReportData } from "@/components/tax/monthly-report"
import { CsvUploadDialog } from "@/components/tax/csv-upload-dialog"
import { RuleManagerSheet } from "@/components/tax/rule-manager-sheet"
import { SmartCategorizeDialog } from "@/components/tax/smart-categorize-dialog"

type StatusFilter = "all" | "uncategorized" | "business" | "personal"
type DirectionFilter = "all" | "inflow" | "outflow"

function formatMonthLabel(m: string) {
  const [y, mo] = m.split("-").map(Number)
  return new Date(y, mo - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" })
}

export default function TaxReviewPage() {
  // ── State ──────────────────────────────────────────────────────
  const [customerPhoneMap, setCustomerPhoneMap] = useState<Map<string, string>>(new Map()) // last4 → customer name
  const [months, setMonths] = useState<MonthStat[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<TaxTx[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("tax-review-status-filter")
      if (saved === "all" || saved === "uncategorized" || saved === "business" || saved === "personal") return saved
    }
    return "all"
  })
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("tax-review-direction-filter")
      if (saved === "all" || saved === "inflow" || saved === "outflow") return saved
    }
    return "all"
  })
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalTx, setTotalTx] = useState(0)

  const [categorySortActive, setCategorySortActive] = useState(false)

  const [loadingMonths, setLoadingMonths] = useState(true)
  const [loadingTx, setLoadingTx] = useState(false)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [smartCategorizeOpen, setSmartCategorizeOpen] = useState(false)

  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [loadingReport, setLoadingReport] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const [importBanner, setImportBanner] = useState<string | null>(null)
  const [rules, setRules] = useState<{ pattern: string; categoryId: number | null; taxType: string; category: { id: number; name: string; color: string } | null }[]>([])

  // ── Fetch months summary ───────────────────────────────────────
  const fetchSummary = useCallback(async () => {
    setLoadingMonths(true)
    try {
      const res = await fetch("/api/tax/summary")
      const data = await res.json()
      if (data.success) {
        setMonths(data.data.months)
        // Auto-select first incomplete month or first month
        if (!selectedMonth && data.data.months.length > 0) {
          const firstIncomplete = data.data.months.find((m: MonthStat) => m.progress < 100)
          setSelectedMonth((firstIncomplete ?? data.data.months[0]).month)
        }
      }
    } finally {
      setLoadingMonths(false)
    }
  }, [selectedMonth])

  // ── Fetch transactions for selected month ──────────────────────
  const fetchTransactions = useCallback(async () => {
    if (!selectedMonth) return
    setLoadingTx(true)
    try {
      const params = new URLSearchParams({ month: selectedMonth, status: statusFilter, direction: directionFilter, page: categorySortActive ? "1" : String(page), pageSize: categorySortActive ? "200" : "50" })
      const res = await fetch(`/api/tax/transactions?${params}`)
      const data = await res.json()
      if (data.success) {
        setTransactions(data.data.transactions)
        setTotalPages(data.data.pages)
        setTotalTx(data.data.total)
      }
    } finally {
      setLoadingTx(false)
    }
  }, [selectedMonth, statusFilter, directionFilter, page, categorySortActive])

  // ── Fetch rules (for pre-check in transaction table) ────────────
  const fetchRules = useCallback(async () => {
    const res = await fetch("/api/tax/rules")
    const data = await res.json()
    if (data.success) setRules(data.data.rules)
  }, [])

  // ── Fetch categories ────────────────────────────────────────────
  const fetchCategories = useCallback(async () => {
    const res = await fetch("/api/finances/categories?lean=1")
    const data = await res.json()
    if (data.success) {
      // data.data is an array of top-level category nodes (with nested children)
      // Flatten to leaf categories with taxType derived from the root system group
      type CatNode = {
        id: number; name: string; color: string; slug: string
        isGroup: boolean; isSystemGroup: boolean
        children?: CatNode[]
      }
      const flat: CategoryOption[] = []

      function walk(node: CatNode, rootTaxType: "business" | "personal" | null) {
        // Determine taxType from root system group
        const taxType: "business" | "personal" | null =
          node.isSystemGroup
            ? node.slug === "business" ? "business" : "personal"
            : rootTaxType

        if (node.isSystemGroup && taxType !== null) {
          // System groups (Business/Personal) are assignable as "General" categories
          flat.push({ id: node.id, name: "General", color: node.color, groupName: taxType === "business" ? "Business" : "Personal", taxType })
        } else if (!node.isGroup && !node.isSystemGroup && taxType !== null) {
          flat.push({ id: node.id, name: node.name, color: node.color, groupName: taxType === "business" ? "Business" : "Personal", taxType })
        }
        if (node.children) {
          node.children.forEach((c) => walk(c, taxType))
        }
      }

      for (const root of data.data as CatNode[]) {
        walk(root, null)
      }
      setCategories(flat)
    }
  }, [])

  // ── Fetch report for current month ────────────────────────────
  const fetchReport = useCallback(async () => {
    if (!selectedMonth) return
    setLoadingReport(true)
    try {
      const res = await fetch(`/api/tax/report?month=${selectedMonth}`)
      const data = await res.json()
      if (data.success) setReportData(data.data)
    } finally {
      setLoadingReport(false)
    }
  }, [selectedMonth])

  // ── Fetch customers for ATH MOVIL phone matching ────────────────
  useEffect(() => {
    fetch("/api/customers?pageSize=500")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          const map = new Map<string, string>()
          for (const c of (Array.isArray(data.data) ? data.data : [])) {
            const digits = c.phone?.replace(/\D/g, "")
            if (digits && digits.length >= 4) {
              const last4 = digits.slice(-4)
              const existing = map.get(last4)
              map.set(last4, existing ? `${existing} / ${c.name}` : c.name)
            }
          }
          setCustomerPhoneMap(map)
        }
      })
      .catch(() => {/* non-critical */})
  }, [])

  // Initial load: fetch summary, categories, and rules in parallel
  useEffect(() => { Promise.all([fetchSummary(), fetchCategories(), fetchRules()]) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Fetch transactions whenever deps change (month, filters, page, sort mode)
  useEffect(() => { fetchTransactions() }, [fetchTransactions])
  useEffect(() => { localStorage.setItem("tax-review-status-filter", statusFilter) }, [statusFilter])
  useEffect(() => { localStorage.setItem("tax-review-direction-filter", directionFilter) }, [directionFilter])
  useEffect(() => { if (selectedMonth) fetchReport() }, [selectedMonth, fetchReport])

  // ── Month selection ─────────────────────────────────────────────
  function handleSelectMonth(m: string) {
    setSelectedMonth(m)
    setPage(1)
  }

  // ── Helper: build category object from categories list ──────────
  function buildCategoryObj(catId: number | null, txTaxType: string | null) {
    if (!catId) return null
    const cat = categories.find((c) => c.id === catId)
    if (!cat) return null
    return {
      id: cat.id,
      name: cat.name,
      color: cat.color,
      parent: { id: 0, name: cat.groupName, isSystemGroup: true },
    }
  }

  // ── Helper: update month stats after local category changes ─────
  function updateMonthStats(changes: { wasCategorized: boolean; nowCategorized: boolean }[]) {
    if (!selectedMonth) return
    let delta = 0
    for (const c of changes) {
      if (!c.wasCategorized && c.nowCategorized) delta++
      else if (c.wasCategorized && !c.nowCategorized) delta--
    }
    if (delta === 0) return
    setMonths((prev) =>
      prev.map((m) => {
        if (m.month !== selectedMonth) return m
        const newCategorized = m.categorized + delta
        return { ...m, categorized: newCategorized, progress: m.total > 0 ? Math.round((newCategorized / m.total) * 100) : 0 }
      })
    )
  }

  // ── Update single transaction ────────────────────────────────────
  async function handleUpdate(
    id: number,
    categoryId: number | null,
    taxType: string | null,
    saveRule?: { pattern: string; categoryId: number | null; taxType: string }
  ) {
    const res = await fetch(`/api/tax/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, taxType, isReviewed: true, saveRule }),
    })
    if (res.ok) {
      const data = await res.json()
      if (saveRule) fetchRules()
      // Update transaction in local state using API response
      const updatedTx = data.data
      const oldTx = transactions.find((tx) => tx.id === id)
      const wasCategorized = oldTx ? (oldTx.categoryId !== null || oldTx.taxType !== null) : false
      setTransactions((prev) =>
        prev.map((tx) =>
          tx.id !== id ? tx : { ...tx, categoryId: updatedTx.categoryId, taxType: updatedTx.taxType, isReviewed: true, category: updatedTx.category }
        )
      )
      updateMonthStats([{ wasCategorized, nowCategorized: true }])
      // Background refresh for report (non-blocking)
      fetchReport()
    }
  }

  // ── Update notes ────────────────────────────────────────────────
  async function handleUpdateNotes(id: number, notes: string) {
    const res = await fetch(`/api/tax/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    })
    if (res.ok) {
      setTransactions((prev) => prev.map((tx) => tx.id !== id ? tx : { ...tx, notes }))
    }
  }

  // ── Bulk update ──────────────────────────────────────────────────
  async function handleBulkUpdate(ids: number[], categoryId: number | null, taxType: string | null) {
    const res = await fetch("/api/tax/transactions/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, categoryId, taxType }),
    })
    if (res.ok) {
      const catObj = buildCategoryObj(categoryId, taxType)
      const idSet = new Set(ids)
      const changes = transactions
        .filter((tx) => idSet.has(tx.id))
        .map((tx) => ({ wasCategorized: tx.categoryId !== null || tx.taxType !== null, nowCategorized: true }))
      setTransactions((prev) =>
        prev.map((tx) =>
          !idSet.has(tx.id) ? tx : { ...tx, categoryId: categoryId ?? null, taxType: taxType ?? null, isReviewed: true, category: catObj }
        )
      )
      updateMonthStats(changes)
      fetchReport()
    }
  }

  // ── Smart Categorize apply ──────────────────────────────────────
  async function handleSmartApply(updates: { ids: number[]; categoryId: number | null; taxType: string; saveRule?: { pattern: string; categoryId: number | null; taxType: string } }[]) {
    for (const batch of updates) {
      const res = await fetch("/api/tax/transactions/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      })
      if (res.ok) {
        const idSet = new Set(batch.ids)
        const catObj = buildCategoryObj(batch.categoryId, batch.taxType)
        const changes = transactions
          .filter((tx) => idSet.has(tx.id))
          .map((tx) => ({ wasCategorized: tx.categoryId !== null || tx.taxType !== null, nowCategorized: true }))
        setTransactions((prev) =>
          prev.map((tx) =>
            !idSet.has(tx.id) ? tx : { ...tx, categoryId: batch.categoryId, taxType: batch.taxType, isReviewed: true, category: catObj }
          )
        )
        updateMonthStats(changes)
      }
    }
    fetchReport()
    fetchRules()
  }

  // ── Download report ──────────────────────────────────────────────
  async function handleDownloadReport() {
    if (!selectedMonth) return
    setDownloading(true)
    try {
      const res = await fetch(`/api/tax/report?month=${selectedMonth}&format=csv`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `tax-report-${selectedMonth}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  // ── Upload success ───────────────────────────────────────────────
  async function handleUploadSuccess(stats: { imported: number; autoCategorized: number }) {
    setImportBanner(`✓ ${stats.imported} transactions imported. ${stats.autoCategorized} auto-categorized by saved rules.`)
    setTimeout(() => setImportBanner(null), 6000)
    await fetchSummary()
    if (selectedMonth) await fetchTransactions()
  }

  const currentMonthStat = months.find((m) => m.month === selectedMonth)
  const monthIdx = months.findIndex((m) => m.month === selectedMonth)
  const isComplete = currentMonthStat ? currentMonthStat.progress === 100 : false

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Tax Review 2025</h1>
          <p className="text-sm text-muted-foreground">Categorize all transactions for tax purposes</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setRulesOpen(true)}>
            <BookMarked className="size-4 mr-1.5" /> Rules
          </Button>
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="size-4 mr-1.5" />
            {months.length > 0 ? "Re-upload CSV" : "Upload CSV"}
          </Button>
        </div>
      </div>

      {/* Import banner */}
      {importBanner && (
        <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-md px-3 py-2">
          <AlertCircle className="size-4 shrink-0" />
          {importBanner}
        </div>
      )}

      {/* Main layout */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Sidebar */}
        <div className="w-52 shrink-0">
          <Card className="sticky top-4">
            <CardContent className="p-2">
              {loadingMonths ? (
                <div className="space-y-2 p-2">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded" />)}
                </div>
              ) : (
                <MonthSidebar months={months} selected={selectedMonth} onSelect={handleSelectMonth} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-4">
          {loadingMonths ? (
            <div className="space-y-4">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-32 w-full rounded-lg" />
              <Skeleton className="h-64 w-full rounded-lg" />
            </div>
          ) : !selectedMonth ? (
            <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground">
              <Upload className="size-10 mb-3 opacity-30" />
              <p className="font-medium">No data yet</p>
              <p className="text-sm mt-1">Upload your 2025 bank export CSV to get started.</p>
              <Button className="mt-4" onClick={() => setUploadOpen(true)}>Upload CSV</Button>
            </div>
          ) : (
            <>
              {/* Month header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      disabled={monthIdx <= 0}
                      onClick={() => handleSelectMonth(months[monthIdx - 1].month)}
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      disabled={monthIdx >= months.length - 1}
                      onClick={() => handleSelectMonth(months[monthIdx + 1].month)}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                  <h2 className="font-semibold">{formatMonthLabel(selectedMonth)}</h2>
                  {currentMonthStat && (
                    <span className="text-xs text-muted-foreground">
                      {currentMonthStat.categorized}/{currentMonthStat.total} categorized
                      {isComplete && " ✓"}
                    </span>
                  )}
                </div>
              </div>

              {/* Monthly report */}
              {reportData && (
                <Card>
                  <CardContent className="p-3">
                    <MonthlyReport
                      data={reportData}
                      onDownload={handleDownloadReport}
                      downloading={downloading}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Transaction table */}
              <Card>
                <CardContent className="p-4">
                  <TransactionTable
                    transactions={transactions}
                    categories={categories}
                    loading={loadingTx}
                    statusFilter={statusFilter}
                    directionFilter={directionFilter}
                    onStatusFilterChange={(f) => { setStatusFilter(f); setPage(1) }}
                    onDirectionFilterChange={(f) => { setDirectionFilter(f); setPage(1) }}
                    onUpdate={handleUpdate}
                    onUpdateNotes={handleUpdateNotes}
                    onBulkUpdate={handleBulkUpdate}
                    onSmartCategorize={() => setSmartCategorizeOpen(true)}
                    onCategorySortChange={setCategorySortActive}
                    customerPhoneMap={customerPhoneMap}
                    existingRules={rules}
                  />

                  {/* Pagination */}
                  {!categorySortActive && totalPages > 1 && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t text-xs text-muted-foreground">
                      <span>{totalTx} transactions</span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={page <= 1}
                          onClick={() => setPage((p) => p - 1)}
                        >
                          <ChevronLeft className="size-3" /> Prev
                        </Button>
                        <span>{page}/{totalPages}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={page >= totalPages}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          Next <ChevronRight className="size-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <CsvUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        hasExistingData={months.length > 0}
        onSuccess={handleUploadSuccess}
      />

      <RuleManagerSheet open={rulesOpen} onOpenChange={setRulesOpen} />

      {selectedMonth && (
        <SmartCategorizeDialog
          open={smartCategorizeOpen}
          onOpenChange={setSmartCategorizeOpen}
          month={selectedMonth}
          categories={categories}
          onApply={handleSmartApply}
        />
      )}
    </div>
  )
}
