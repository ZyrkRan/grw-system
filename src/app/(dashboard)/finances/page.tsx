"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  Upload,
  BookMarked,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  CalendarDays,
  ReceiptText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

import {
  YearMonthSidebar,
  type YearGroup,
  type MonthStat,
} from "@/components/finances/year-month-sidebar"
import {
  TransactionTable,
  type TaxTx,
  type CategoryOption,
} from "@/components/finances/transactions-table"
import { MonthlyReport, type ReportData } from "@/components/finances/monthly-report"
import { AnnualSummary } from "@/components/finances/annual-summary"
import { RuleManagerSheet } from "@/components/finances/rule-manager-sheet"
import { BillsPanel } from "@/components/finances/bills-panel"
import { AccountSwitcher } from "@/components/finances/account-switcher"

type StatusFilter = "all" | "uncategorized" | "business" | "personal" | "mismatched"
type DirectionFilter = "all" | "inflow" | "outflow"

function formatMonthLabel(m: string) {
  const [y, mo] = m.split("-").map(Number)
  return new Date(y, mo - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" })
}

const LS_SELECTED_MONTH = "finances-v2-selected-month"
const LS_EXPANDED_YEARS = "finances-v2-expanded-years"
const LS_STATUS = "finances-v2-status-filter"
const LS_DIRECTION = "finances-v2-direction-filter"
const LS_ACCOUNT = "finances-selected-account"

export default function FinancesV2Page() {
  const [customerPhoneMap, setCustomerPhoneMap] = useState<Map<string, string>>(new Map())
  const [years, setYears] = useState<YearGroup[]>([])
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set())
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<TaxTx[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])

  const [accountId, setAccountId] = useState<string>(() => {
    if (typeof window !== "undefined") return localStorage.getItem(LS_ACCOUNT) || "all"
    return "all"
  })
  const [syncVersion, setSyncVersion] = useState(0)

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(LS_STATUS)
      if (
        saved === "all" ||
        saved === "uncategorized" ||
        saved === "business" ||
        saved === "personal" ||
        saved === "mismatched"
      )
        return saved
    }
    return "all"
  })
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(LS_DIRECTION)
      if (saved === "all" || saved === "inflow" || saved === "outflow") return saved
    }
    return "all"
  })

  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalTx, setTotalTx] = useState(0)

  const [categorySortActive, setCategorySortActive] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<number | "__uncategorized__" | null>(null)
  const [mismatchedCount, setMismatchedCount] = useState(0)
  const [uncategorizedIncomeCount, setUncategorizedIncomeCount] = useState(0)

  const [loadingSidebar, setLoadingSidebar] = useState(true)
  const [loadingTx, setLoadingTx] = useState(false)

  const [rulesOpen, setRulesOpen] = useState(false)
  const [showAnnualSummary, setShowAnnualSummary] = useState(false)
  const [annualYear, setAnnualYear] = useState<number>(new Date().getFullYear())
  const [monthsSheetOpen, setMonthsSheetOpen] = useState(false)
  const [billsSheetOpen, setBillsSheetOpen] = useState(false)

  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [loadingReport, setLoadingReport] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const [rules, setRules] = useState<
    {
      pattern: string
      categoryId: number | null
      taxType: string
      category: { id: number; name: string; color: string } | null
    }[]
  >([])
  const [globalSearch, setGlobalSearch] = useState<string | null>(null)
  const [searchText, setSearchText] = useState("")

  // Flat month list derived from years — used by prev/next buttons and auto-select
  const flatMonths = useMemo<MonthStat[]>(() => {
    const flat: MonthStat[] = []
    for (const y of years) flat.push(...y.months)
    // Sort ascending by month for navigation
    return flat.sort((a, b) => a.month.localeCompare(b.month))
  }, [years])

  const accountIdNumber = accountId !== "all" ? accountId : null

  // ── Fetch sidebar summary (years + months + flags) ─────────────
  const fetchSidebar = useCallback(async () => {
    setLoadingSidebar(true)
    try {
      const params = new URLSearchParams({ view: "sidebar" })
      if (accountIdNumber) params.set("accountId", accountIdNumber)
      const res = await fetch(`/api/finances/analytics/summary?${params}`)
      const data: {
        success: boolean
        data?: { years?: YearGroup[]; mismatchedCount?: number; uncategorizedIncomeCount?: number }
        error?: string
      } = await res.json()
      if (data.success && data.data) {
        const dataYears = (data.data.years ?? []) as YearGroup[]
        setYears(dataYears)
        setMismatchedCount(data.data.mismatchedCount ?? 0)
        setUncategorizedIncomeCount(data.data.uncategorizedIncomeCount ?? 0)

        // First load: restore expanded years + select something sensible
        setExpandedYears((prev) => {
          if (prev.size > 0) return prev
          const stored = localStorage.getItem(LS_EXPANDED_YEARS)
          if (stored) {
            try {
              return new Set(JSON.parse(stored) as number[])
            } catch {
              // fall through
            }
          }
          return new Set(dataYears[0] ? [dataYears[0].year] : [])
        })

        setSelectedMonth((current) => {
          if (current) return current
          const savedMonth = localStorage.getItem(LS_SELECTED_MONTH)
          const allMonths: MonthStat[] = []
          for (const y of dataYears) allMonths.push(...y.months)
          if (savedMonth && allMonths.some((m) => m.month === savedMonth)) return savedMonth
          const recent = dataYears[0]
          if (!recent) return null
          const firstIncomplete = recent.months.find((m: MonthStat) => m.progress < 100)
          return (firstIncomplete ?? recent.months[recent.months.length - 1])?.month ?? null
        })
      }
    } finally {
      setLoadingSidebar(false)
    }
  }, [accountIdNumber])

  // ── Fetch transactions ─────────────────────────────────────────
  const fetchTransactions = useCallback(async () => {
    const hasCategoryFilter = categoryFilter !== null
    const hasSpecificStatus = statusFilter !== "all"
    const hasSpecificDirection = directionFilter !== "all"
    const hasStandaloneCriteria =
      statusFilter === "mismatched" ||
      statusFilter === "uncategorized" ||
      hasCategoryFilter ||
      (hasSpecificStatus && hasSpecificDirection)

    if (globalSearch === "" && !hasStandaloneCriteria) {
      setTransactions([])
      setTotalTx(0)
      setTotalPages(1)
      setLoadingTx(false)
      return
    }
    if (!selectedMonth && !globalSearch && !hasStandaloneCriteria) return

    setLoadingTx(true)
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        direction: directionFilter,
        page: categorySortActive ? "1" : String(page),
        pageSize: categorySortActive ? "200" : "50",
      })
      if (globalSearch) {
        params.set("search", globalSearch)
      } else if (globalSearch === null && selectedMonth) {
        params.set("monthKey", selectedMonth)
      }
      if (categoryFilter && categoryFilter !== "__uncategorized__") {
        params.set("categoryFilter", String(categoryFilter))
      } else if (categoryFilter === "__uncategorized__") {
        params.set("categoryFilter", "none")
      }
      if (accountIdNumber) params.set("accountId", accountIdNumber)

      const res = await fetch(`/api/finances/transactions?${params}`)
      const data: {
        success: boolean
        data?: unknown[]
        error?: string
        pagination?: { total: number; totalPages: number }
      } = await res.json()
      if (data.success && Array.isArray(data.data)) {
        // Normalize to TaxTx shape — convert Decimal amount → number, keep
        // only the fields the table/picker care about.
        type RawTxn = {
          id: number
          date: string
          description: string
          merchantName: string | null
          amount: number | string
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
        const rows = data.data as RawTxn[]
        const normalized: TaxTx[] = rows.map((r) => ({
          id: r.id,
          date: typeof r.date === "string" ? r.date : new Date(r.date).toISOString(),
          description: r.description,
          merchantName: r.merchantName,
          amount: Number(r.amount),
          type: r.type,
          categoryId: r.categoryId,
          taxType: r.taxType,
          isReviewed: r.isReviewed,
          notes: r.notes,
          category: r.category
            ? {
                id: r.category.id,
                name: r.category.name,
                color: r.category.color,
                parent: r.category.parent,
              }
            : null,
        }))
        setTransactions(normalized)
        setTotalTx(data.pagination?.total ?? normalized.length)
        setTotalPages(data.pagination?.totalPages ?? 1)
      }
    } finally {
      setLoadingTx(false)
    }
  }, [
    selectedMonth,
    globalSearch,
    statusFilter,
    directionFilter,
    page,
    categorySortActive,
    categoryFilter,
    accountIdNumber,
  ])

  // ── Rules (for inline rule-preview in the table) ───────────────
  const fetchRules = useCallback(async () => {
    const res = await fetch("/api/finances/categorization-rules")
    const data = await res.json()
    if (data.success) {
      const arr = Array.isArray(data.data) ? data.data : data.data.rules
      setRules(
        arr
          .filter((r: { taxType: string | null }) => r.taxType !== null)
          .map(
            (r: {
              pattern: string
              categoryId: number | null
              taxType: string
              category: { id: number; name: string; color: string } | null
            }) => ({
              pattern: r.pattern,
              categoryId: r.categoryId,
              taxType: r.taxType,
              category: r.category,
            })
          )
      )
    }
  }, [])

  // ── Categories (flattened + annotated with taxType/isIncome) ───
  const fetchCategories = useCallback(async () => {
    const res = await fetch("/api/finances/categories?lean=1")
    const data = await res.json()
    if (!data.success) return

    type CatNode = {
      id: number
      name: string
      color: string
      slug: string
      isGroup: boolean
      isSystemGroup: boolean
      children?: CatNode[]
    }
    const flat: CategoryOption[] = []
    function walk(
      node: CatNode,
      rootTaxType: "business" | "personal" | null,
      insideIncome: boolean
    ) {
      const taxType: "business" | "personal" | null = node.isSystemGroup
        ? node.slug === "business"
          ? "business"
          : "personal"
        : rootTaxType

      const isIncomeSubgroup =
        node.slug === "business-income" || node.slug === "personal-income"
      const nowInsideIncome = insideIncome || isIncomeSubgroup

      if (node.isSystemGroup && taxType !== null) {
        flat.push({
          id: node.id,
          name: "General",
          color: node.color,
          groupName: taxType === "business" ? "Business" : "Personal",
          taxType,
          isIncome: false,
        })
      } else if (isIncomeSubgroup && taxType !== null) {
        flat.push({
          id: node.id,
          name: "General Income",
          color: node.color,
          groupName: taxType === "business" ? "Business" : "Personal",
          taxType: taxType === "business" ? "service_income" : "personal",
          isIncome: true,
        })
      } else if (!node.isGroup && !node.isSystemGroup && taxType !== null) {
        flat.push({
          id: node.id,
          name: node.name,
          color: node.color,
          groupName: taxType === "business" ? "Business" : "Personal",
          taxType: nowInsideIncome && taxType === "business" ? "service_income" : taxType,
          isIncome: nowInsideIncome,
        })
      }
      if (node.children) node.children.forEach((c) => walk(c, taxType, nowInsideIncome))
    }
    for (const root of data.data as CatNode[]) walk(root, null, false)
    setCategories(flat)
  }, [])

  // ── Monthly report ─────────────────────────────────────────────
  const fetchReport = useCallback(async () => {
    if (!selectedMonth) return
    setLoadingReport(true)
    try {
      const params = new URLSearchParams({ month: selectedMonth })
      if (accountIdNumber) params.set("accountId", accountIdNumber)
      const res = await fetch(`/api/finances/report?${params}`)
      const data = await res.json()
      if (data.success) setReportData(data.data)
    } finally {
      setLoadingReport(false)
    }
  }, [selectedMonth, accountIdNumber])

  // ── Customers (ATH MOVIL phone matching) ───────────────────────
  useEffect(() => {
    fetch("/api/customers?pageSize=500")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          const map = new Map<string, string>()
          for (const c of Array.isArray(data.data) ? data.data : []) {
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
      .catch(() => {
        /* non-critical */
      })
  }, [])

  // Initial load + deps-triggered refetches
  useEffect(() => {
    Promise.all([fetchSidebar(), fetchCategories(), fetchRules()])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountIdNumber, syncVersion])
  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])
  useEffect(() => {
    localStorage.setItem(LS_STATUS, statusFilter)
  }, [statusFilter])
  useEffect(() => {
    localStorage.setItem(LS_DIRECTION, directionFilter)
  }, [directionFilter])
  useEffect(() => {
    if (selectedMonth) {
      localStorage.setItem(LS_SELECTED_MONTH, selectedMonth)
      fetchReport()
    }
  }, [selectedMonth, fetchReport])
  useEffect(() => {
    localStorage.setItem(LS_ACCOUNT, accountId)
  }, [accountId])
  useEffect(() => {
    localStorage.setItem(LS_EXPANDED_YEARS, JSON.stringify(Array.from(expandedYears)))
  }, [expandedYears])

  // Debounced cross-month search (mirror of tax-review behavior)
  useEffect(() => {
    if (globalSearch === null) return
    if (!searchText.trim()) {
      setGlobalSearch("")
      return
    }
    const timer = setTimeout(() => {
      setGlobalSearch(searchText.trim())
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [searchText]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelectMonth(m: string) {
    setGlobalSearch(null)
    setSelectedMonth(m)
    setSearchText("")
    setPage(1)
    // Expand the owning year if collapsed
    const [y] = m.split("-").map(Number)
    setExpandedYears((prev) => (prev.has(y) ? prev : new Set([...prev, y])))
    setMonthsSheetOpen(false)
  }

  function handleToggleYear(y: number) {
    setExpandedYears((prev) => {
      const next = new Set(prev)
      if (next.has(y)) next.delete(y)
      else next.add(y)
      return next
    })
  }

  function buildCategoryObj(catId: number | null) {
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

  function updateMonthStats(changes: { wasCategorized: boolean; nowCategorized: boolean }[]) {
    if (!selectedMonth) return
    let delta = 0
    for (const c of changes) {
      if (!c.wasCategorized && c.nowCategorized) delta++
      else if (c.wasCategorized && !c.nowCategorized) delta--
    }
    if (delta === 0) return
    setYears((prev) =>
      prev.map((yg) => {
        if (!yg.months.some((m) => m.month === selectedMonth)) return yg
        const months = yg.months.map((m) => {
          if (m.month !== selectedMonth) return m
          const newCategorized = m.categorized + delta
          return {
            ...m,
            categorized: newCategorized,
            progress: m.total > 0 ? Math.round((newCategorized / m.total) * 100) : 0,
          }
        })
        const newCategorized = yg.categorized + delta
        return {
          ...yg,
          months,
          categorized: newCategorized,
          progress: yg.total > 0 ? Math.round((newCategorized / yg.total) * 100) : 0,
        }
      })
    )
  }

  async function handleUpdate(
    id: number,
    categoryId: number | null,
    taxType: string | null,
    saveRule?: { pattern: string; categoryId: number | null; taxType: string }
  ) {
    const res = await fetch(`/api/finances/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, taxType, isReviewed: true, saveRule }),
    })
    if (res.ok) {
      const data = await res.json()
      if (saveRule) fetchRules()
      const updatedTx = data.data
      const oldTx = transactions.find((tx) => tx.id === id)
      const wasCategorized = oldTx
        ? oldTx.categoryId !== null || oldTx.taxType !== null
        : false
      const nowCategorized = updatedTx.categoryId !== null || updatedTx.taxType !== null
      setTransactions((prev) =>
        prev.map((tx) =>
          tx.id !== id
            ? tx
            : {
                ...tx,
                categoryId: updatedTx.categoryId,
                taxType: updatedTx.taxType,
                isReviewed: nowCategorized,
                category: updatedTx.category,
              }
        )
      )
      updateMonthStats([{ wasCategorized, nowCategorized }])
      fetchReport()
    }
  }

  async function handleUpdateNotes(id: number, notes: string) {
    const res = await fetch(`/api/finances/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    })
    if (res.ok) {
      setTransactions((prev) => prev.map((tx) => (tx.id !== id ? tx : { ...tx, notes })))
    }
  }

  async function handleBulkUpdate(
    ids: number[],
    categoryId: number | null,
    taxType: string | null
  ) {
    const res = await fetch("/api/finances/transactions/batch", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, categoryId, taxType }),
    })
    if (res.ok) {
      const catObj = buildCategoryObj(categoryId)
      const idSet = new Set(ids)
      const changes = transactions
        .filter((tx) => idSet.has(tx.id))
        .map((tx) => ({
          wasCategorized: tx.categoryId !== null || tx.taxType !== null,
          nowCategorized: true,
        }))
      setTransactions((prev) =>
        prev.map((tx) =>
          !idSet.has(tx.id)
            ? tx
            : {
                ...tx,
                categoryId: categoryId ?? null,
                taxType: taxType ?? null,
                isReviewed: true,
                category: catObj,
              }
        )
      )
      updateMonthStats(changes)
      fetchReport()
    }
  }

  async function handleDownloadReport() {
    if (!selectedMonth) return
    setDownloading(true)
    try {
      const params = new URLSearchParams({ month: selectedMonth, format: "csv" })
      if (accountIdNumber) params.set("accountId", accountIdNumber)
      const res = await fetch(`/api/finances/report?${params}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `finances-report-${selectedMonth}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  const currentMonthStat = flatMonths.find((m) => m.month === selectedMonth)
  const monthIdx = flatMonths.findIndex((m) => m.month === selectedMonth)
  const isComplete = currentMonthStat ? currentMonthStat.progress === 100 : false

  const availableYears = useMemo(() => years.map((y) => y.year), [years])

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Finances</h1>
          <p className="text-sm text-muted-foreground">
            Bank transactions, categorization, bills, and reports
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <AccountSwitcher
            selectedAccountId={accountId}
            onAccountChange={setAccountId}
            onSync={() => setSyncVersion((v) => v + 1)}
          />
          <Button
            variant={showAnnualSummary ? "default" : "outline"}
            size="sm"
            onClick={() => setShowAnnualSummary((v) => !v)}
            title="Annual Summary"
          >
            <BarChart3 className="size-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Annual Summary</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRulesOpen(true)}
            title="Rules"
          >
            <BookMarked className="size-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Rules</span>
          </Button>
        </div>
      </div>

      {/* Mismatched banner */}
      {mismatchedCount > 0 && statusFilter !== "mismatched" && (
        <div className="flex items-center justify-between text-sm text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 rounded-md px-3 py-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            {mismatchedCount} outflow transaction{mismatchedCount === 1 ? "" : "s"} incorrectly
            marked as Service Income — review and recategorize.
          </div>
          <button
            onClick={() => {
              setShowAnnualSummary(false)
              setGlobalSearch(null)
              setStatusFilter("mismatched")
              setPage(1)
            }}
            className="text-xs font-medium underline underline-offset-2 hover:text-orange-900 dark:hover:text-orange-300 shrink-0"
          >
            Show them
          </button>
        </div>
      )}

      {/* Uncategorized income banner */}
      {uncategorizedIncomeCount > 0 && (
        <div className="flex items-center justify-between text-sm text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 rounded-md px-3 py-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            {uncategorizedIncomeCount} inflow{uncategorizedIncomeCount === 1 ? "" : "s"} need an
            income source assigned.
          </div>
          <button
            onClick={() => {
              setShowAnnualSummary(false)
              setGlobalSearch(null)
              setStatusFilter("all")
              setDirectionFilter("inflow")
              setCategoryFilter("__uncategorized__")
              setPage(1)
            }}
            className="text-xs font-medium underline underline-offset-2 hover:text-blue-900 dark:hover:text-blue-300 shrink-0"
          >
            Show them
          </button>
        </div>
      )}

      {/* Annual summary */}
      {showAnnualSummary && (
        <AnnualSummary
          year={annualYear}
          availableYears={availableYears}
          onYearChange={setAnnualYear}
          accountId={accountIdNumber ? parseInt(accountIdNumber, 10) : null}
          onGoToMonth={(m) => {
            setShowAnnualSummary(false)
            handleSelectMonth(m)
          }}
          onGoToFlagged={(m) => {
            setShowAnnualSummary(false)
            handleSelectMonth(m)
            setStatusFilter("uncategorized")
            setDirectionFilter("all")
            setCategoryFilter(null)
            setPage(1)
          }}
          onViewPersonalIncome={() => {
            setShowAnnualSummary(false)
            setGlobalSearch("")
            setStatusFilter("personal")
            setDirectionFilter("inflow")
            setCategoryFilter(null)
            setPage(1)
          }}
        />
      )}

      {/* Main layout */}
      <div className={cn("flex gap-4 flex-1 min-h-0", showAnnualSummary && "hidden")}>
        {/* Year sidebar — hidden on mobile, available via Sheet */}
        <div className="hidden lg:block w-56 shrink-0">
          <Card className="sticky top-4">
            <CardContent className="p-2 overflow-y-auto max-h-[calc(100vh-8rem)]">
              {loadingSidebar ? (
                <div className="space-y-2 p-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded" />
                  ))}
                </div>
              ) : (
                <YearMonthSidebar
                  years={years}
                  selected={selectedMonth}
                  expandedYears={expandedYears}
                  onSelect={handleSelectMonth}
                  onToggleYear={handleToggleYear}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main column */}
        <div className="flex-1 min-w-0 space-y-4 w-full">
          {loadingSidebar ? (
            <div className="space-y-4">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-32 w-full rounded-lg" />
              <Skeleton className="h-64 w-full rounded-lg" />
            </div>
          ) : !selectedMonth ? (
            <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground">
              <Upload className="size-10 mb-3 opacity-30" />
              <p className="font-medium">No data yet</p>
              <p className="text-sm mt-1">
                Link a Plaid account or import a CSV to get started.
              </p>
            </div>
          ) : (
            <>
              {/* Month header */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="lg:hidden h-7 px-2 mr-1"
                      title="Months"
                      onClick={() => setMonthsSheetOpen(true)}
                    >
                      <CalendarDays className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      disabled={monthIdx <= 0 || globalSearch !== null}
                      onClick={() => handleSelectMonth(flatMonths[monthIdx - 1].month)}
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      disabled={monthIdx >= flatMonths.length - 1 || globalSearch !== null}
                      onClick={() => handleSelectMonth(flatMonths[monthIdx + 1].month)}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                  <h2 className="font-semibold truncate">
                    {globalSearch
                      ? `Search: "${globalSearch}"`
                      : globalSearch === ""
                        ? "Search all months"
                        : formatMonthLabel(selectedMonth)}
                  </h2>
                  {globalSearch ? (
                    <span className="text-xs text-muted-foreground">
                      {totalTx} results across all months
                    </span>
                  ) : globalSearch === "" ? (
                    <span className="text-xs text-muted-foreground">Start typing to search</span>
                  ) : (
                    currentMonthStat && (
                      <span className="text-xs text-muted-foreground">
                        {currentMonthStat.categorized}/{currentMonthStat.total} categorized
                        {isComplete && " ✓"}
                      </span>
                    )
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="lg:hidden h-7 px-2 shrink-0"
                  title="Bills"
                  onClick={() => setBillsSheetOpen(true)}
                >
                  <ReceiptText className="size-4" />
                </Button>
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
                    onStatusFilterChange={(f) => {
                      setStatusFilter(f)
                      setPage(1)
                    }}
                    onDirectionFilterChange={(f) => {
                      setDirectionFilter(f)
                      setPage(1)
                    }}
                    onUpdate={handleUpdate}
                    onUpdateNotes={handleUpdateNotes}
                    onBulkUpdate={handleBulkUpdate}
                    onCategorySortChange={setCategorySortActive}
                    customerPhoneMap={customerPhoneMap}
                    existingRules={rules}
                    globalSearch={globalSearch}
                    onSearchAllMonths={(q) => {
                      setGlobalSearch(q)
                      setPage(1)
                    }}
                    searchText={searchText}
                    onSearchTextChange={setSearchText}
                    categoryFilter={categoryFilter}
                    onCategoryFilterChange={(f) => {
                      setCategoryFilter(f)
                      setPage(1)
                    }}
                  />

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
                        <span>
                          {page}/{totalPages}
                        </span>
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

        {/* Right sidebar: Bills — hidden on mobile, available via Sheet */}
        <div className="hidden lg:block w-72 shrink-0">
          <BillsPanel refreshKey={syncVersion} accountId={accountId} />
        </div>
      </div>

      {/* Mobile-only Sheets for sidebars */}
      <Sheet open={monthsSheetOpen} onOpenChange={setMonthsSheetOpen}>
        <SheetContent side="left" className="w-[88vw] sm:max-w-sm p-0 overflow-y-auto">
          <SheetHeader className="border-b">
            <SheetTitle>Months</SheetTitle>
          </SheetHeader>
          <div className="p-2">
            {loadingSidebar ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded" />
                ))}
              </div>
            ) : (
              <YearMonthSidebar
                years={years}
                selected={selectedMonth}
                expandedYears={expandedYears}
                onSelect={handleSelectMonth}
                onToggleYear={handleToggleYear}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={billsSheetOpen} onOpenChange={setBillsSheetOpen}>
        <SheetContent side="right" className="w-[88vw] sm:max-w-sm p-0 overflow-y-auto">
          <SheetHeader className="border-b">
            <SheetTitle>Bills</SheetTitle>
          </SheetHeader>
          <div className="p-2">
            <BillsPanel refreshKey={syncVersion} accountId={accountId} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Rule manager sheet */}
      <RuleManagerSheet open={rulesOpen} onOpenChange={setRulesOpen} />
    </div>
  )
}
