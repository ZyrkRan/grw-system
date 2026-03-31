"use client"

import { useState, useEffect } from "react"
import {
  TrendingDown,
  TrendingUp,
  PieChart,
  Repeat,
  CreditCard,
  Briefcase,
  User,
  ArrowDown,
  ArrowUp,
} from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { InsightCard } from "./insight-card"

interface InsightsData {
  monthlySpending: { month: string; total_inflow: number; total_outflow: number }[]
  topCategories: { category_id: number; category_name: string; category_color: string; total: number; count: number }[]
  recurringCharges: { description: string; avg_amount: number; occurrences: number; merchant: string | null }[]
  debtProjections: { accountName: string; balance: number; avgMonthlyPayment: number; monthsToPayoff: number | null; projectedPayoffDate: string | null }[]
  personalBusinessSplit: { group_name: string; total: number; count: number }[]
  currentMonthSpending: number
  lastMonthSpending: number
  monthOverMonthChange: number
  currentMonthTransactionCount: number
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount)
}

function formatMonth(monthStr: string) {
  const [year, month] = monthStr.split("-")
  return new Date(Number(year), Number(month) - 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
}

export function InsightsDashboard() {
  const [data, setData] = useState<InsightsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchInsights() {
      try {
        const res = await fetch("/api/ai/insights")
        const result = await res.json()
        if (result.success) setData(result.data)
      } catch (error) {
        console.error("Failed to fetch insights:", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchInsights()
  }, [])

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-6 space-y-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Failed to load insights data.
      </div>
    )
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Month-over-Month Summary */}
      <InsightCard
        title="Monthly Spending Trend"
        icon={data.monthOverMonthChange >= 0
          ? <TrendingUp className="size-4 text-destructive" />
          : <TrendingDown className="size-4 text-success" />}
        section="spending-trend"
        data={data.monthlySpending}
      >
        <div className="space-y-3">
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold">{formatCurrency(data.currentMonthSpending)}</span>
            <Badge variant={data.monthOverMonthChange >= 0 ? "destructive" : "secondary"} className="text-xs">
              {data.monthOverMonthChange >= 0 ? <ArrowUp className="size-3 mr-0.5" /> : <ArrowDown className="size-3 mr-0.5" />}
              {Math.abs(data.monthOverMonthChange)}%
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            vs {formatCurrency(data.lastMonthSpending)} last month ({data.currentMonthTransactionCount} transactions)
          </p>

          {/* Mini bar chart */}
          <div className="flex items-end gap-1 h-16">
            {data.monthlySpending.slice(-6).map((m) => {
              const maxVal = Math.max(...data.monthlySpending.slice(-6).map((x) => x.total_outflow), 1)
              const height = (m.total_outflow / maxVal) * 100
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-0.5">
                  <div
                    className="w-full rounded-t bg-chart-1 transition-all"
                    style={{ height: `${Math.max(height, 4)}%` }}
                  />
                  <span className="text-[9px] text-muted-foreground">{formatMonth(m.month)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </InsightCard>

      {/* Personal vs Business */}
      <InsightCard
        title="Personal vs Business"
        icon={<Briefcase className="size-4" />}
        section="personal-business"
        data={data.personalBusinessSplit}
      >
        <div className="space-y-3">
          {data.personalBusinessSplit.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No categorized transactions yet. Categorize transactions under Personal or Business groups to see the split.
            </p>
          ) : (
            <>
              {data.personalBusinessSplit.map((group) => {
                const total = data.personalBusinessSplit.reduce((a, b) => a + b.total, 0)
                const pct = total > 0 ? (group.total / total * 100) : 0
                const isBusiness = group.group_name?.toLowerCase() === "business"

                return (
                  <div key={group.group_name} className="flex items-center gap-3">
                    <div className={`flex items-center justify-center size-8 rounded-full ${isBusiness ? "bg-info/10 text-info" : "bg-chart-5/10 text-chart-5"}`}>
                      {isBusiness ? <Briefcase className="size-4" /> : <User className="size-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{group.group_name || "Uncategorized"}</span>
                        <span className="text-sm font-medium">{formatCurrency(group.total)}</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${isBusiness ? "bg-info" : "bg-chart-5"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground w-10 text-right">{pct.toFixed(0)}%</span>
                  </div>
                )
              })}
            </>
          )}
        </div>
      </InsightCard>

      {/* Top Categories */}
      <InsightCard
        title="Top Expense Categories"
        icon={<PieChart className="size-4" />}
        section="top-categories"
        data={data.topCategories}
      >
        <div className="space-y-2">
          {data.topCategories.slice(0, 5).map((cat, i) => (
            <div key={cat.category_id} className="flex items-center gap-2.5">
              <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}</span>
              <span
                className="size-2.5 rounded-full shrink-0"
                style={{ backgroundColor: cat.category_color }}
              />
              <span className="text-sm flex-1 truncate">{cat.category_name}</span>
              <span className="text-sm font-medium">{formatCurrency(cat.total)}</span>
              <span className="text-xs text-muted-foreground">{cat.count} txns</span>
            </div>
          ))}
        </div>
      </InsightCard>

      {/* Recurring Charges */}
      <InsightCard
        title="Recurring Charges"
        icon={<Repeat className="size-4" />}
        section="recurring-charges"
        data={data.recurringCharges}
      >
        <div className="space-y-2">
          {data.recurringCharges.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No recurring charges detected yet. Need at least 3 months of data.
            </p>
          ) : (
            <>
              {data.recurringCharges.slice(0, 6).map((charge, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span className="text-sm flex-1 truncate">
                    {charge.merchant || charge.description}
                  </span>
                  <span className="text-sm font-medium">{formatCurrency(charge.avg_amount)}/mo</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {charge.occurrences}x
                  </Badge>
                </div>
              ))}
              <div className="pt-1 border-t flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Total monthly recurring</span>
                <span className="text-sm font-bold">
                  {formatCurrency(data.recurringCharges.reduce((a, b) => a + b.avg_amount, 0))}
                </span>
              </div>
            </>
          )}
        </div>
      </InsightCard>

      {/* Debt Payoff */}
      <InsightCard
        title="Debt Payoff Projection"
        icon={<CreditCard className="size-4" />}
        section="debt-payoff"
        data={data.debtProjections}
      >
        <div className="space-y-3">
          {data.debtProjections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No credit accounts found. Add a credit account to see debt payoff projections.
            </p>
          ) : (
            data.debtProjections.map((debt) => (
              <div key={debt.accountName} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{debt.accountName}</span>
                  <span className="text-sm font-bold text-destructive">{formatCurrency(debt.balance)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Avg payment: {formatCurrency(debt.avgMonthlyPayment)}/mo</span>
                  {debt.monthsToPayoff ? (
                    <span>~{debt.monthsToPayoff} months to payoff</span>
                  ) : (
                    <span>Insufficient payment data</span>
                  )}
                </div>
                {debt.projectedPayoffDate && (
                  <p className="text-xs text-muted-foreground">
                    Projected debt-free: {new Date(debt.projectedPayoffDate).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </InsightCard>
    </div>
  )
}
