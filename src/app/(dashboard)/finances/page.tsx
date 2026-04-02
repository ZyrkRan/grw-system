"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
import { cn } from "@/lib/utils"
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  AlertCircle,
  Wallet,
  BarChart3,
  PieChart,
  LineChart,
  Settings2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { TimeframeSelector, getTimeframeValue, type TimeframeValue } from "@/components/finances/timeframe-selector"
import { AccountSwitcher } from "@/components/finances/account-switcher"
import { BillsPanel } from "@/components/finances/bills-panel"

const TransactionsTable = dynamic(() => import("@/components/finances/transactions-table").then((m) => m.TransactionsTable))
const CategoriesManager = dynamic(() => import("@/components/finances/categories-manager").then((m) => m.CategoriesManager))
const CategoryAnalytics = dynamic(
  () => import("@/components/finances/category-analytics").then((m) => m.CategoryAnalytics),
  { loading: () => <Skeleton className="h-[300px] rounded-xl" /> }
)
const BalanceChart = dynamic(
  () => import("@/components/finances/balance-chart").then((m) => m.BalanceChart),
  { loading: () => <Skeleton className="h-[300px] rounded-xl" /> }
)
const InflowOutflowChart = dynamic(
  () => import("@/components/finances/inflow-outflow-chart").then((m) => m.InflowOutflowChart),
  { loading: () => <Skeleton className="h-[300px] rounded-xl" /> }
)

type CategoryFilter = "all" | "business" | "personal"
type ChartView = "flow" | "categories" | "balance"

const TIMEFRAME_STORAGE_KEY = "finances-timeframe"
const ACCOUNT_STORAGE_KEY = "finances-selected-account"
const CATEGORY_FILTER_STORAGE_KEY = "finances-category-filter"
const CHART_VIEW_STORAGE_KEY = "finances-chart-view"

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  trend,
  color,
  subtitle,
}: {
  label: string
  value: string
  icon: React.ReactNode
  trend?: "up" | "down" | "neutral"
  color?: "green" | "red" | "blue" | "amber" | "default"
  subtitle?: string
}) {
  const colorMap = {
    green: "text-green-600",
    red: "text-red-600",
    blue: "text-blue-600",
    amber: "text-amber-600",
    default: "text-foreground",
  }
  const bgMap = {
    green: "bg-green-50 dark:bg-green-950/30 text-green-600",
    red: "bg-red-50 dark:bg-red-950/30 text-red-600",
    blue: "bg-blue-50 dark:bg-blue-950/30 text-blue-600",
    amber: "bg-amber-50 dark:bg-amber-950/30 text-amber-600",
    default: "bg-muted text-muted-foreground",
  }

  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className={cn("text-lg font-bold tabular-nums", colorMap[color || "default"])}>
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className={cn("size-8 rounded-lg flex items-center justify-center", bgMap[color || "default"])}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Format Currency ─────────────────────────────────────────────────────────

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

// ─── Summary Data ────────────────────────────────────────────────────────────

interface FlowChartData {
  points: Array<{
    date: string
    label: string
    inflow: number
    outflow: number
  }>
  granularity: "daily" | "weekly" | "monthly"
}

interface BalanceChartData {
  points: Array<{
    date: string
    balance: number
    label: string
  }>
  summary: {
    startBalance: number
    endBalance: number
    netChange: number
    highBalance: number
    lowBalance: number
  }
}

interface CategoryBreakdownItem {
  id: number | null
  name: string
  color: string
  total: number
  count: number
}

interface SummaryData {
  stats: {
    totalInflow: number
    totalOutflow: number
    netChange: number
    uncategorizedCount: number
    transactionCount: number
    currentBalance: number
  }
  bills: {
    total: number
    paid: number
    expectedAmount: number
  }
  flowChart: FlowChartData
  balanceChart: BalanceChartData
  categoryBreakdown: CategoryBreakdownItem[]
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function FinancesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [selectedAccountId, setSelectedAccountId] = useState("all")
  const [timeframe, setTimeframe] = useState<TimeframeValue>(() => getTimeframeValue("month"))
  const [syncVersion, setSyncVersion] = useState(0)
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all")
  const [chartView, setChartView] = useState<ChartView>("flow")
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [showCategories, setShowCategories] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  const handleSync = useCallback(() => {
    setSyncVersion((v) => v + 1)
  }, [])

  // ─── Initialize state from URL params with localStorage fallback ─────
  useEffect(() => {
    // URL params take priority, then localStorage, then defaults

    // Timeframe
    const tfParam = searchParams.get("tf")
    if (tfParam) {
      try {
        const parsed = JSON.parse(decodeURIComponent(tfParam))
        setTimeframe(parsed)
      } catch {
        try {
          const stored = localStorage.getItem(TIMEFRAME_STORAGE_KEY)
          if (stored) setTimeframe(JSON.parse(stored))
        } catch { /* use default */ }
      }
    } else {
      try {
        const stored = localStorage.getItem(TIMEFRAME_STORAGE_KEY)
        if (stored) setTimeframe(JSON.parse(stored))
      } catch { /* use default */ }
    }

    // Account
    const accountParam = searchParams.get("account")
    if (accountParam) {
      setSelectedAccountId(accountParam)
    } else {
      const stored = localStorage.getItem(ACCOUNT_STORAGE_KEY)
      if (stored) setSelectedAccountId(stored)
    }

    // Category filter
    const groupParam = searchParams.get("group")
    if (groupParam && ["all", "business", "personal"].includes(groupParam)) {
      setCategoryFilter(groupParam as CategoryFilter)
    } else {
      const stored = localStorage.getItem(CATEGORY_FILTER_STORAGE_KEY)
      if (stored && ["all", "business", "personal"].includes(stored)) {
        setCategoryFilter(stored as CategoryFilter)
      }
    }

    // Chart view
    const chartParam = searchParams.get("chart")
    if (chartParam && ["flow", "categories", "balance"].includes(chartParam)) {
      setChartView(chartParam as ChartView)
    } else {
      const stored = localStorage.getItem(CHART_VIEW_STORAGE_KEY)
      if (stored && ["flow", "categories", "balance"].includes(stored)) {
        setChartView(stored as ChartView)
      }
    }

    setIsHydrated(true)
  }, [searchParams])

  // ─── Fetch consolidated summary ────────────────────────────────────
  useEffect(() => {
    if (!isHydrated) return

    setSummaryLoading(true)
    const params = new URLSearchParams()
    if (timeframe.dateFrom) params.set("dateFrom", timeframe.dateFrom)
    if (timeframe.dateTo) params.set("dateTo", timeframe.dateTo)
    if (selectedAccountId && selectedAccountId !== "all") {
      params.set("accountId", selectedAccountId)
    }
    if (categoryFilter !== "all") {
      params.set("categoryGroup", categoryFilter)
    }

    fetch(`/api/finances/analytics/summary?${params}`)
      .then((r) => r.json())
      .then((result) => {
        if (result.success) {
          setSummaryData(result.data)
        }
      })
      .catch(console.error)
      .finally(() => setSummaryLoading(false))
  }, [timeframe, selectedAccountId, categoryFilter, syncVersion, isHydrated])

  // ─── Handlers ──────────────────────────────────────────────────────
  const updateUrlParams = useCallback(
    (updates: Partial<{ tf: string; account: string; group: string; chart: string }>) => {
      const params = new URLSearchParams(searchParams)
      if (updates.tf !== undefined) {
        if (updates.tf) params.set("tf", updates.tf)
        else params.delete("tf")
      }
      if (updates.account !== undefined) {
        if (updates.account && updates.account !== "all") params.set("account", updates.account)
        else params.delete("account")
      }
      if (updates.group !== undefined) {
        if (updates.group && updates.group !== "all") params.set("group", updates.group)
        else params.delete("group")
      }
      if (updates.chart !== undefined) {
        if (updates.chart && updates.chart !== "flow") params.set("chart", updates.chart)
        else params.delete("chart")
      }
      router.replace(`?${params.toString()}`)
    },
    [router, searchParams]
  )

  const handleTimeframeChange = (newTimeframe: TimeframeValue) => {
    setTimeframe(newTimeframe)
    localStorage.setItem(TIMEFRAME_STORAGE_KEY, JSON.stringify(newTimeframe))
    updateUrlParams({ tf: encodeURIComponent(JSON.stringify(newTimeframe)) })
  }

  const handleAccountChange = (accountId: string) => {
    setSelectedAccountId(accountId)
    localStorage.setItem(ACCOUNT_STORAGE_KEY, accountId)
    updateUrlParams({ account: accountId })
  }

  const handleCategoryFilterChange = (filter: CategoryFilter) => {
    setCategoryFilter(filter)
    localStorage.setItem(CATEGORY_FILTER_STORAGE_KEY, filter)
    updateUrlParams({ group: filter })
  }

  const handleChartViewChange = (view: ChartView) => {
    setChartView(view)
    localStorage.setItem(CHART_VIEW_STORAGE_KEY, view)
    updateUrlParams({ chart: view })
  }

  const stats = summaryData?.stats
  const billsStats = summaryData?.bills

  return (
    <div className="space-y-4">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold">Finances</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCategories(true)}
          >
            <Settings2 className="size-4 mr-1.5" />
            Categories
          </Button>
          <AccountSwitcher
            selectedAccountId={selectedAccountId}
            onAccountChange={handleAccountChange}
            onSync={handleSync}
          />
        </div>
      </div>

      {/* ─── Unified Filter Bar ─────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TimeframeSelector value={timeframe} onChange={handleTimeframeChange} />
        <div className="inline-flex items-center rounded-lg border bg-muted p-0.5">
          {(["all", "business", "personal"] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => handleCategoryFilterChange(filter)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                categoryFilter === filter
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {filter === "all" ? "All" : filter === "business" ? "Business" : "Personal"}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Stat Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {summaryLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-4 pb-3 px-4">
                <Skeleton className="h-3 w-16 mb-2" />
                <Skeleton className="h-6 w-24" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <StatCard
              label="Inflow"
              value={formatCurrency(stats?.totalInflow || 0)}
              icon={<ArrowUpRight className="size-4" />}
              color="green"
            />
            <StatCard
              label="Outflow"
              value={formatCurrency(stats?.totalOutflow || 0)}
              icon={<ArrowDownRight className="size-4" />}
              color="red"
            />
            <StatCard
              label="Net Change"
              value={`${(stats?.netChange || 0) >= 0 ? "+" : ""}${formatCurrency(stats?.netChange || 0)}`}
              icon={
                (stats?.netChange || 0) > 0
                  ? <TrendingUp className="size-4" />
                  : (stats?.netChange || 0) < 0
                    ? <TrendingDown className="size-4" />
                    : <Minus className="size-4" />
              }
              color={(stats?.netChange || 0) >= 0 ? "green" : "red"}
            />
            <StatCard
              label="Balance"
              value={formatCurrency(stats?.currentBalance || 0)}
              icon={<Wallet className="size-4" />}
              color="blue"
            />
            <StatCard
              label="Bills"
              value={billsStats ? `${billsStats.paid}/${billsStats.total}` : "0/0"}
              icon={<DollarSign className="size-4" />}
              color={billsStats && billsStats.paid < billsStats.total ? "amber" : "green"}
              subtitle={billsStats && billsStats.total > 0
                ? `${formatCurrency(billsStats.expectedAmount)} expected`
                : "No bills set up"}
            />
          </>
        )}
      </div>

      {/* ─── Main Content: Chart + Bills side by side ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart area (2/3 width on large screens) */}
        <div className="lg:col-span-2 space-y-3">
          {/* Chart switcher tabs */}
          <div className="flex items-center gap-1">
            {([
              { key: "flow" as const, icon: BarChart3, label: "Inflow/Outflow" },
              { key: "categories" as const, icon: PieChart, label: "Categories" },
              { key: "balance" as const, icon: LineChart, label: "Balance" },
            ]).map(({ key, icon: Icon, label }) => (
              <Button
                key={key}
                variant={chartView === key ? "secondary" : "ghost"}
                size="sm"
                onClick={() => handleChartViewChange(key)}
                className="gap-1.5"
              >
                <Icon className="size-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </Button>
            ))}
          </div>

          {/* Active chart */}
          {chartView === "flow" && (
            <InflowOutflowChart
              data={summaryData?.flowChart}
              isLoading={summaryLoading}
            />
          )}
          {chartView === "categories" && (
            <CategoryAnalytics
              data={summaryData?.categoryBreakdown}
              isLoading={summaryLoading}
            />
          )}
          {chartView === "balance" && (
            <BalanceChart
              data={summaryData?.balanceChart}
              isLoading={summaryLoading}
            />
          )}
        </div>

        {/* Bills panel (1/3 width on large screens) */}
        <div>
          <BillsPanel refreshKey={syncVersion} accountId={selectedAccountId} />
        </div>
      </div>

      {/* ─── Transactions Table ─────────────────────────────────────── */}
      <TransactionsTable
        accountId={selectedAccountId}
        timeframe={timeframe}
        refreshKey={syncVersion}
        categoryGroupFilter={categoryFilter}
      />

      {/* ─── Categories Manager (Sheet modal) ──────────────────────── */}
      <Sheet open={showCategories} onOpenChange={setShowCategories}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Manage Categories</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <CategoriesManager />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
