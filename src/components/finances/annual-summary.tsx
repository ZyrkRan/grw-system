"use client"

import { useState, useEffect } from "react"
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertCircle,
  ChevronDown,
  Download,
  Loader2,
  CheckCircle2,
  ArrowRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────

interface MonthBreakdown {
  month: string
  totalIncome: number
  serviceIncome: number
  personalIncome: number
  businessExpenses: number
  personalExpenses: number
  uncategorizedCount: number
  totalTransactions: number
  net: number
}

interface CategoryBreakdown {
  category: string
  total: number
}

interface FlaggedItem {
  id: number
  date: string
  description: string
  amount: number
  type: string
  reason: string
}

export interface AnnualData {
  totals: {
    income: number
    serviceIncome: number
    personalIncome: number
    businessExpenses: number
    personalExpenses: number
    net: number
    totalTransactions: number
    uncategorizedCount: number
  }
  monthlyBreakdown: MonthBreakdown[]
  businessByCategory: CategoryBreakdown[]
  personalByCategory: CategoryBreakdown[]
  businessIncomeByCategory: CategoryBreakdown[]
  personalIncomeByCategory: CategoryBreakdown[]
  flagged: FlaggedItem[]
}

interface Props {
  year: number
  availableYears: number[]
  onYearChange: (year: number) => void
  onGoToMonth: (month: string) => void
  onGoToFlagged?: (month: string) => void
  onViewPersonalIncome?: () => void
  accountId?: number | null
}

// ── Formatting ────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function fmtExact(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n)
}

function formatMonthLong(m: string) {
  const [y, mo] = m.split("-").map(Number)
  return new Date(y, mo - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" })
}

// ── Component ─────────────────────────────────────────────────────

export function AnnualSummary({
  year,
  availableYears,
  onYearChange,
  onGoToMonth,
  onGoToFlagged,
  onViewPersonalIncome,
  accountId,
}: Props) {
  const [data, setData] = useState<AnnualData | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  const accountQs = accountId ? `&accountId=${accountId}` : ""

  useEffect(() => {
    setLoading(true)
    fetch(`/api/finances/report/annual?year=${year}${accountQs}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          // Finances wraps as {year, report}; unwrap for the existing view.
          setData(d.data.report ?? d.data)
        }
      })
      .finally(() => setLoading(false))
  }, [year, accountQs])

  async function handleDownloadPdf() {
    setDownloading(true)
    try {
      const res = await fetch(`/api/finances/report/annual/pdf?year=${year}${accountQs}`)
      if (!res.ok) throw new Error("Failed to generate PDF")
      const blob = await res.blob()
      const disposition = res.headers.get("Content-Disposition") || ""
      const match = disposition.match(/filename="?([^";]+)"?/)
      const filename = match?.[1] || `finances-report-${year}.pdf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-24 text-sm text-muted-foreground">
        Failed to load annual summary.
      </div>
    )
  }

  const { totals, monthlyBreakdown, businessByCategory, personalByCategory, businessIncomeByCategory, personalIncomeByCategory, flagged } = data
  const netPositive = totals.net >= 0
  const allCategorized = totals.uncategorizedCount === 0
  const bizMax = businessByCategory[0]?.total || 1
  const persMax = personalByCategory[0]?.total || 1
  const bizIncomeMax = businessIncomeByCategory[0]?.total || 1
  const persIncomeMax = personalIncomeByCategory[0]?.total || 1

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-lg font-semibold">Annual Summary</h2>
            <p className="text-xs text-muted-foreground">
              {totals.totalTransactions} transactions across {monthlyBreakdown.length} months
              {allCategorized ? (
                <span className="text-emerald-600 dark:text-emerald-400 ml-2 inline-flex items-center gap-1">
                  <CheckCircle2 className="size-3" /> 100% categorized
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400 ml-2 inline-flex items-center gap-1">
                  <AlertCircle className="size-3" /> {totals.uncategorizedCount} uncategorized
                </span>
              )}
            </p>
          </div>
          {availableYears.length > 1 && (
            <select
              value={year}
              onChange={(e) => onYearChange(parseInt(e.target.value, 10))}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm tabular-nums"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-xs gap-1.5"
          onClick={handleDownloadPdf}
          disabled={downloading}
        >
          {downloading
            ? <><Loader2 className="size-3 animate-spin" /> Generating PDF…</>
            : <><Download className="size-3" /> Download Annual PDF</>
          }
        </Button>
      </div>

      {/* YTD Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
        <StatCard label="Total Income" value={fmt(totals.income)} icon={<TrendingUp className="size-3.5 text-emerald-500" />} />
        <StatCard label="Biz Income" value={fmt(totals.serviceIncome)} icon={<DollarSign className="size-3.5 text-blue-500" />} />
        <StatCard
          label="Pers. Income"
          value={fmt(totals.personalIncome)}
          icon={<TrendingUp className="size-3.5 text-purple-500" />}
          onClick={onViewPersonalIncome}
        />
        <StatCard label="Biz Expenses" value={fmt(totals.businessExpenses)} icon={<TrendingDown className="size-3.5 text-red-500" />} />
        <StatCard label="Personal Exp." value={fmt(totals.personalExpenses)} icon={<TrendingDown className="size-3.5 text-orange-500" />} />
        <StatCard
          label="Net"
          value={fmt(totals.net)}
          icon={<DollarSign className={cn("size-3.5", netPositive ? "text-emerald-500" : "text-red-500")} />}
          highlight={netPositive ? "emerald" : "red"}
        />
      </div>

      {/* Monthly Breakdown Table */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b">
            <h3 className="text-sm font-semibold">Monthly Breakdown</h3>
          </div>
          <div className="divide-y">
            {/* Header row */}
            <div className="grid grid-cols-[1fr_90px_90px_90px_90px_80px_32px] gap-2 px-4 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              <span>Month</span>
              <span className="text-right">Income</span>
              <span className="text-right">Biz Exp.</span>
              <span className="text-right">Personal Spending</span>
              <span className="text-right">Net</span>
              <span className="text-center">Status</span>
              <span />
            </div>
            {monthlyBreakdown.map((m) => {
              const complete = m.uncategorizedCount === 0
              const mNet = m.net
              return (
                <div
                  key={m.month}
                  className="grid grid-cols-[1fr_90px_90px_90px_90px_80px_32px] gap-2 px-4 py-2.5 text-sm hover:bg-muted/30 transition-colors group items-center"
                >
                  <span className="font-medium text-xs">{formatMonthLong(m.month)}</span>
                  <span className="text-right text-xs tabular-nums">{fmt(m.totalIncome)}</span>
                  <span className="text-right text-xs tabular-nums text-red-600 dark:text-red-400">{fmt(m.businessExpenses)}</span>
                  <span className="text-right text-xs tabular-nums text-orange-600 dark:text-orange-400">{fmt(m.personalExpenses)}</span>
                  <span className={cn("text-right text-xs tabular-nums font-medium", mNet >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                    {mNet >= 0 ? "+" : ""}{fmt(mNet)}
                  </span>
                  <span className="text-center">
                    {complete ? (
                      <CheckCircle2 className="size-3.5 text-emerald-500 mx-auto" />
                    ) : (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400">{m.uncategorizedCount} left</span>
                    )}
                  </span>
                  <button
                    onClick={() => onGoToMonth(m.month)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Go to month"
                  >
                    <ArrowRight className="size-3.5 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
              )
            })}
            {/* Totals row */}
            <div className="grid grid-cols-[1fr_90px_90px_90px_90px_80px_32px] gap-2 px-4 py-2.5 text-sm font-semibold bg-muted/20 items-center">
              <span className="text-xs">Total</span>
              <span className="text-right text-xs tabular-nums">{fmt(totals.income)}</span>
              <span className="text-right text-xs tabular-nums text-red-600 dark:text-red-400">{fmt(totals.businessExpenses)}</span>
              <span className="text-right text-xs tabular-nums text-orange-600 dark:text-orange-400">{fmt(totals.personalExpenses)}</span>
              <span className={cn("text-right text-xs tabular-nums", netPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                {netPositive ? "+" : ""}{fmt(totals.net)}
              </span>
              <span className="text-center">
                {allCategorized && <CheckCircle2 className="size-3.5 text-emerald-500 mx-auto" />}
              </span>
              <span />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Income Breakdowns — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <CategoryList
              title="Business Income by Source"
              items={businessIncomeByCategory}
              maxAmount={bizIncomeMax}
              totalLabel={fmt(totals.serviceIncome)}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <CategoryList
              title="Personal Income by Source"
              items={personalIncomeByCategory}
              maxAmount={persIncomeMax}
              totalLabel={fmt(totals.personalIncome)}
            />
          </CardContent>
        </Card>
      </div>

      {/* Expense Breakdowns — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Business */}
        <Card>
          <CardContent className="p-4">
            <CategoryList
              title="Business Expenses by Category"
              items={businessByCategory}
              maxAmount={bizMax}
              totalLabel={fmt(totals.businessExpenses)}
            />
          </CardContent>
        </Card>
        {/* Personal */}
        <Card>
          <CardContent className="p-4">
            <CategoryList
              title="Personal Expenses by Category"
              items={personalByCategory}
              maxAmount={persMax}
              totalLabel={fmt(totals.personalExpenses)}
            />
          </CardContent>
        </Card>
      </div>

      {/* Detailed YTD Summary */}
      <Card>
        <CardContent className="p-4">
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-semibold hover:text-foreground transition-colors group w-full">
              <ChevronDown className="size-3.5 transition-transform group-data-[state=closed]:-rotate-90" />
              Year-to-Date Summary
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="rounded-md border text-sm mt-3">
                <div className="divide-y">
                  <SummaryRow label="Service / Business Income" value={fmtExact(totals.serviceIncome)} positive />
                  <SummaryRow label="Personal Income" value={fmtExact(totals.personalIncome)} />
                  <SummaryRow label="Business Expenses" value={`-${fmtExact(totals.businessExpenses)}`} negative />
                  <SummaryRow label="Personal Expenses" value={`-${fmtExact(totals.personalExpenses)}`} muted />
                  <div className="px-3 py-2 flex justify-between font-semibold text-sm">
                    <span>Net (Biz Income - Biz Expenses)</span>
                    <span className={netPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                      {netPositive ? "+" : ""}{fmtExact(totals.net)}
                    </span>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* Flagged items */}
      {flagged.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-semibold hover:text-foreground transition-colors group w-full">
                <ChevronDown className="size-3.5 transition-transform group-data-[state=closed]:-rotate-90" />
                <AlertCircle className="size-3.5 text-amber-500" />
                Items to Review ({flagged.length})
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-3 space-y-1">
                  {flagged.map((f) => (
                    <div
                      key={`${f.id}-${f.reason}`}
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-xs hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => (onGoToFlagged ?? onGoToMonth)(f.date.slice(0, 7))}
                    >
                      <span className="text-muted-foreground w-20 shrink-0">{f.date}</span>
                      <span className="flex-1 truncate">{f.description}</span>
                      <span className={cn("tabular-nums font-mono shrink-0", f.type === "INFLOW" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                        {f.type === "INFLOW" ? "+" : "-"}{fmtExact(f.amount)}
                      </span>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full shrink-0",
                        f.reason === "Uncategorized" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      )}>
                        {f.reason}
                      </span>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Subcomponents ─────────────────────────────────────────────────

function StatCard({ label, value, icon, highlight, onClick }: {
  label: string
  value: string
  icon: React.ReactNode
  highlight?: "emerald" | "red"
  onClick?: () => void
}) {
  const bg = highlight === "emerald"
    ? "bg-emerald-50 dark:bg-emerald-950/20"
    : highlight === "red"
      ? "bg-red-50 dark:bg-red-950/20"
      : "bg-muted/30"

  const content = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div className="text-base font-bold tabular-nums">{value}</div>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "rounded-md px-2.5 py-2 space-y-0.5 text-left transition-colors hover:ring-1 hover:ring-primary/30 hover:bg-muted/50 cursor-pointer",
          bg
        )}
      >
        {content}
      </button>
    )
  }

  return (
    <div className={cn("rounded-md px-2.5 py-2 space-y-0.5", bg)}>
      {content}
    </div>
  )
}

function SummaryRow({ label, value, positive, negative, muted }: {
  label: string; value: string; positive?: boolean; negative?: boolean; muted?: boolean
}) {
  return (
    <div className={cn("px-3 py-1.5 flex justify-between text-sm", muted && "text-muted-foreground")}>
      <span>{label}</span>
      <span className={cn(
        positive && "text-emerald-600 dark:text-emerald-400",
        negative && "text-red-600 dark:text-red-400"
      )}>
        {value}
      </span>
    </div>
  )
}

function CategoryList({ title, items, maxAmount, totalLabel }: {
  title: string; items: { category: string; total: number }[]; maxAmount: number; totalLabel: string
}) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? items : items.slice(0, 5)

  if (items.length === 0) {
    return (
      <div>
        <h4 className="text-sm font-semibold mb-2">{title}</h4>
        <p className="text-xs text-muted-foreground">No expenses in this category.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold">{title}</h4>
        <span className="text-xs text-muted-foreground font-mono">{totalLabel}</span>
      </div>
      <div className="space-y-2">
        {visible.map((c) => (
          <div key={c.category} className="flex items-center gap-2">
            <div className="text-xs text-muted-foreground w-32 truncate shrink-0">{c.category}</div>
            <div className="flex-1">
              <Progress value={(c.total / maxAmount) * 100} className="h-1.5" />
            </div>
            <div className="text-xs font-mono w-20 text-right tabular-nums">{fmtExact(c.total)}</div>
          </div>
        ))}
        {items.length > 5 && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAll ? "Show less" : `+${items.length - 5} more`}
          </button>
        )}
      </div>
    </div>
  )
}
