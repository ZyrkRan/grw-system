"use client"

import { useState } from "react"
import { Download, Loader2, TrendingUp, TrendingDown, DollarSign, AlertCircle, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

interface CategoryBreakdown {
  category: string
  total: number
}

export interface ReportData {
  month: string
  summary: {
    totalIncome: number
    serviceIncome: number
    personalIncome: number
    businessExpenses: number
    personalExpenses: number
    net: number
    uncategorizedCount: number
    totalTransactions: number
  }
  businessByCategory: CategoryBreakdown[]
}

interface Props {
  data: ReportData
  onDownload: () => void
  downloading: boolean
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function fmtExact(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n)
}

function formatMonth(m: string) {
  const [y, mo] = m.split("-").map(Number)
  return new Date(y, mo - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" })
}

export function MonthlyReport({ data, onDownload, downloading }: Props) {
  const { summary, businessByCategory } = data
  const [showAllCats, setShowAllCats] = useState(false)

  const visibleCategories = showAllCats ? businessByCategory : businessByCategory.slice(0, 3)
  const maxAmount = businessByCategory[0]?.total || 1

  const netPositive = summary.net >= 0
  const categorizedPct = summary.totalTransactions > 0
    ? Math.round(((summary.totalTransactions - summary.uncategorizedCount) / summary.totalTransactions) * 100)
    : 100

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">{formatMonth(data.month)}</h3>
          <span className="text-xs text-muted-foreground">{summary.totalTransactions} txns</span>
          {summary.uncategorizedCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle className="size-3" />
              {summary.uncategorizedCount} uncategorized
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onDownload} disabled={downloading}>
          {downloading
            ? <Loader2 className="size-3 animate-spin" />
            : <Download className="size-3" />
          }
          CSV
        </Button>
      </div>

      {/* Stat cards — compact */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <StatCard label="Income" value={fmt(summary.totalIncome)} icon={<TrendingUp className="size-3.5 text-emerald-500" />} />
        <StatCard label="Biz Income" value={fmt(summary.serviceIncome)} icon={<DollarSign className="size-3.5 text-blue-500" />} />
        <StatCard label="Biz Expenses" value={fmt(summary.businessExpenses)} icon={<TrendingDown className="size-3.5 text-red-500" />} />
        <StatCard
          label="Net"
          value={fmt(summary.net)}
          icon={<DollarSign className={cn("size-3.5", netPositive ? "text-emerald-500" : "text-red-500")} />}
          highlight={netPositive ? "emerald" : "red"}
        />
      </div>

      {/* Business expenses by category — collapsible */}
      {businessByCategory.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors group w-full">
            <ChevronDown className="size-3 transition-transform group-data-[state=closed]:-rotate-90" />
            Business Expenses by Category
            <span className="text-muted-foreground/60 ml-1">({businessByCategory.length})</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-1.5 mt-2">
              {visibleCategories.map((c) => (
                <div key={c.category} className="flex items-center gap-2">
                  <div className="text-xs text-muted-foreground w-28 truncate shrink-0">{c.category}</div>
                  <div className="flex-1">
                    <Progress value={(c.total / maxAmount) * 100} className="h-1" />
                  </div>
                  <div className="text-xs font-mono w-18 text-right">{fmtExact(c.total)}</div>
                </div>
              ))}
              {businessByCategory.length > 3 && (
                <button
                  onClick={() => setShowAllCats((v) => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showAllCats ? "Show less" : `+${businessByCategory.length - 3} more`}
                </button>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Summary table — collapsible */}
      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors group w-full">
          <ChevronDown className="size-3 transition-transform group-data-[state=closed]:-rotate-90" />
          Detailed Summary
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="rounded-md border text-sm mt-2">
            <div className="divide-y">
              <SummaryRow label="Service / Business Income" value={fmtExact(summary.serviceIncome)} positive />
              <SummaryRow label="Personal Income" value={fmtExact(summary.personalIncome)} />
              <SummaryRow label="Business Expenses" value={`-${fmtExact(summary.businessExpenses)}`} negative />
              <SummaryRow label="Personal Expenses" value={`-${fmtExact(summary.personalExpenses)}`} muted />
              <div className="px-3 py-2 flex justify-between font-semibold text-sm">
                <span>Net (Biz Income − Biz Expenses)</span>
                <span className={netPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                  {netPositive ? "+" : ""}{fmtExact(summary.net)}
                </span>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function StatCard({ label, value, icon, highlight }: {
  label: string
  value: string
  icon: React.ReactNode
  highlight?: "emerald" | "red"
}) {
  const bg = highlight === "emerald"
    ? "bg-emerald-50 dark:bg-emerald-950/20"
    : highlight === "red"
      ? "bg-red-50 dark:bg-red-950/20"
      : "bg-muted/30"

  return (
    <div className={cn("rounded-md px-2.5 py-2 space-y-0.5", bg)}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div className="text-base font-bold tabular-nums">{value}</div>
    </div>
  )
}

function SummaryRow({ label, value, positive, negative, muted }: {
  label: string
  value: string
  positive?: boolean
  negative?: boolean
  muted?: boolean
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
