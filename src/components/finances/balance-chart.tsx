"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import { TrendingUp, TrendingDown, Minus, Loader2, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { TimeframeValue } from "@/components/finances/timeframe-selector"
import { BalanceChartAccountSelector } from "./balance-chart-account-selector"

interface Account {
  id: number
  name: string
  type: string
  isActive: boolean
  currentBalance: string | number | null
}

interface BalancePoint {
  date: string
  balance: number
  label: string
}

interface BalanceSummary {
  startBalance: number
  endBalance: number
  netChange: number
  highBalance: number
  lowBalance: number
}

interface BalanceData {
  points: BalancePoint[]
  summary: BalanceSummary
}

interface AccountBalanceData {
  accountId: number
  accountName: string
  data: BalanceData
}

interface MultiAccountBalancePoint {
  date: string
  label: string
  [accountId: string]: string | number // Dynamic keys like "1": 1500.50
}

type Granularity = "daily" | "weekly" | "monthly"

// Color palette for different accounts
const ACCOUNT_COLORS = [
  "#3b82f6", // Blue
  "#10b981", // Green
  "#f59e0b", // Amber
  "#ef4444", // Red
  "#8b5cf6", // Violet
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#f97316", // Orange
]

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

const balanceChartConfig = {
  balance: {
    label: "Balance",
    color: "#3b82f6", // Blue
  },
} satisfies ChartConfig

function BalanceSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-4 w-24 mb-1" />
              <Skeleton className="h-7 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    </div>
  )
}

export function BalanceChart({
  accountId,
  timeframe,
  compact = false,
}: {
  accountId?: string
  timeframe: TimeframeValue
  compact?: boolean
}) {
  const [data, setData] = useState<BalanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // Multi-account state (only for full-size mode)
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [multiAccountData, setMultiAccountData] = useState<MultiAccountBalancePoint[]>([])
  const [multiAccountLoading, setMultiAccountLoading] = useState(false)
  const [dynamicChartConfig, setDynamicChartConfig] = useState<ChartConfig>({})

  // Auto-calculate granularity based on timeframe duration
  const granularity: Granularity = (() => {
    const fromDate = new Date(timeframe.dateFrom)
    const toDate = new Date(timeframe.dateTo)
    const durationMs = toDate.getTime() - fromDate.getTime()
    const durationDays = durationMs / (1000 * 60 * 60 * 24)

    if (durationDays < 32) {
      return "daily"
    } else if (durationDays <= 90) {
      return "weekly"
    } else {
      return "monthly"
    }
  })()

  // Fetch accounts list (only for full-size mode)
  const fetchAccounts = useCallback(async () => {
    if (compact) return

    try {
      const res = await fetch("/api/finances/accounts")
      if (res.ok) {
        const result = await res.json()
        if (result.success) {
          setAccounts(result.data.filter((acc: Account) => acc.isActive))
        }
      }
    } catch (err) {
      console.error("Failed to fetch accounts:", err)
    }
  }, [compact])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  // Merge balance points by date
  const mergeBalancePoints = useCallback(
    (accountsData: AccountBalanceData[]): MultiAccountBalancePoint[] => {
      // Collect all unique dates
      const dateSet = new Set<string>()
      accountsData.forEach(({ data }) => {
        data.points.forEach((point) => dateSet.add(point.date))
      })

      // Sort dates chronologically
      const sortedDates = Array.from(dateSet).sort()

      // Build merged points
      const merged: MultiAccountBalancePoint[] = sortedDates.map((date) => {
        const point: MultiAccountBalancePoint = {
          date,
          label: "", // Will set from first account's label
        }

        accountsData.forEach(({ accountId, data }) => {
          const matchingPoint = data.points.find((p) => p.date === date)
          if (matchingPoint) {
            point[String(accountId)] = matchingPoint.balance
            if (!point.label) point.label = matchingPoint.label
          }
        })

        return point
      })

      return merged
    },
    []
  )

  // Fetch multi-account data
  const fetchMultiAccountData = useCallback(async () => {
    if (selectedAccountIds.length === 0) {
      setMultiAccountData([])
      return
    }

    setMultiAccountLoading(true)
    setError(false)

    try {
      // Fetch data for all selected accounts in parallel
      const results = await Promise.all(
        selectedAccountIds.map(async (accId) => {
          const params = new URLSearchParams({
            granularity,
            dateFrom: timeframe.dateFrom,
            dateTo: timeframe.dateTo,
            accountId: String(accId),
          })
          const res = await fetch(`/api/finances/analytics/balance?${params}`)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const result = await res.json()
          if (!result.success) throw new Error("API returned success: false")

          const account = accounts.find((a) => a.id === accId)
          return {
            accountId: accId,
            accountName: account?.name || `Account ${accId}`,
            data: result.data as BalanceData,
          }
        })
      )

      // Merge data points by date
      const mergedPoints = mergeBalancePoints(results)
      setMultiAccountData(mergedPoints)

      // Build dynamic chart config
      const config: ChartConfig = {}
      selectedAccountIds.forEach((accId, idx) => {
        const account = accounts.find((a) => a.id === accId)
        config[String(accId)] = {
          label: account?.name || `Account ${accId}`,
          color: ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length],
        }
      })
      setDynamicChartConfig(config)
    } catch (err) {
      console.error("Failed to fetch multi-account data:", err)
      setError(true)
    } finally {
      setMultiAccountLoading(false)
    }
  }, [selectedAccountIds, granularity, timeframe, accounts, mergeBalancePoints])

  useEffect(() => {
    if (!compact && selectedAccountIds.length > 0) {
      fetchMultiAccountData()
    }
  }, [compact, fetchMultiAccountData])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const params = new URLSearchParams({
        granularity,
        dateFrom: timeframe.dateFrom,
        dateTo: timeframe.dateTo,
      })
      if (accountId && accountId !== "all") {
        params.set("accountId", accountId)
      }
      const res = await fetch(`/api/finances/analytics/balance?${params}`)
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const result = await res.json()
      if (result.success) {
        setData(result.data)
      } else {
        setError(true)
      }
    } catch (err) {
      console.error("Failed to fetch balance data:", err)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [granularity, timeframe, accountId])

  useEffect(() => {
    // Only fetch single-account data when NOT in multi-account mode
    if (compact || selectedAccountIds.length === 0) {
      fetchData()
    }
  }, [fetchData, compact, selectedAccountIds.length])

  // Multi-account tooltip component
  function MultiAccountTooltip({ active, payload, label }: any) {
    if (!active || !payload || payload.length === 0) return null

    return (
      <div className="rounded-lg border bg-background p-3 shadow-md">
        <p className="text-sm font-medium mb-2">{label}</p>
        <div className="space-y-1">
          {payload.map((entry: any) => {
            const config = dynamicChartConfig[entry.dataKey]
            return (
              <div key={entry.dataKey} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-xs">{config?.label || "Account"}</span>
                </div>
                <span className="text-xs font-semibold">
                  {formatCurrency(Number(entry.value))}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Aggregated summary for multi-account mode
  const aggregatedSummary = useMemo(() => {
    if (selectedAccountIds.length === 0 || !multiAccountData.length) {
      return data?.summary || null
    }

    // Calculate from multi-account data
    const firstPoint = multiAccountData[0]
    const lastPoint = multiAccountData[multiAccountData.length - 1]

    const startBalance = selectedAccountIds.reduce(
      (sum, id) => sum + (Number(firstPoint[String(id)]) || 0),
      0
    )
    const endBalance = selectedAccountIds.reduce(
      (sum, id) => sum + (Number(lastPoint[String(id)]) || 0),
      0
    )

    return {
      startBalance,
      endBalance,
      netChange: endBalance - startBalance,
      highBalance: endBalance, // Simplified
      lowBalance: startBalance, // Simplified
    }
  }, [selectedAccountIds, multiAccountData, data])

  const summary = selectedAccountIds.length > 0 ? aggregatedSummary : data?.summary

  const netIcon =
    summary && summary.netChange > 0 ? (
      <TrendingUp className="h-4 w-4 text-green-500" />
    ) : summary && summary.netChange < 0 ? (
      <TrendingDown className="h-4 w-4 text-red-500" />
    ) : (
      <Minus className="h-4 w-4 text-muted-foreground" />
    )

  const netColor =
    summary && summary.netChange > 0
      ? "text-green-600"
      : summary && summary.netChange < 0
        ? "text-red-600"
        : ""

  const [compactOpen, setCompactOpen] = useState(false)

  if (compact) {
    return (
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <div className="flex items-end justify-between gap-3">
                <div className="space-y-1">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-[50px] w-[100px]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Skeleton className="h-[52px] rounded-lg" />
                <Skeleton className="h-[52px] rounded-lg" />
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm font-medium">Failed to load</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={fetchData}>
                Retry
              </Button>
            </div>
          ) : !data || data.points.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Minus className="size-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No data</p>
            </div>
          ) : (
            <div className="space-y-3 min-h-[180px]">
              <button
                type="button"
                className="flex items-center justify-between w-full md:cursor-default"
                onClick={() => setCompactOpen((o) => !o)}
              >
                <h3 className="text-sm font-semibold">Balance</h3>
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform md:hidden", compactOpen && "rotate-180")} />
              </button>

              {/* Hero balance + sparkline */}
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">{formatCurrency(data.summary.endBalance)}</p>
                  <p className="text-xs text-muted-foreground">Current Balance</p>
                </div>
                <ChartContainer config={balanceChartConfig} className="h-[50px] w-[100px] shrink-0">
                  <LineChart data={data.points}>
                    <Line
                      type="monotone"
                      dataKey="balance"
                      stroke="var(--color-balance)"
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </LineChart>
                </ChartContainer>
              </div>

              {/* Start balance + Net change mini grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <span className="text-xs text-muted-foreground">Start</span>
                  <p className="text-sm font-semibold">{formatCurrency(data.summary.startBalance)}</p>
                </div>
                <div className={cn("rounded-lg p-2.5", data.summary.netChange >= 0 ? "bg-green-50 dark:bg-green-950/30" : "bg-red-50 dark:bg-red-950/30")}>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Change</span>
                    {netIcon}
                  </div>
                  <p className={cn("text-sm font-semibold", netColor)}>
                    {data.summary.netChange >= 0 ? "+" : ""}{formatCurrency(data.summary.netChange)}
                  </p>
                </div>
              </div>

              {/* Full chart — toggleable on mobile, always visible on desktop */}
              <div className={cn(compactOpen ? "block" : "hidden md:block")}>
                <Separator className="mb-3" />
                <ChartContainer config={balanceChartConfig} className="h-[200px] w-full">
                  <LineChart accessibilityLayer data={data.points}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      tickFormatter={(v: number) => formatCurrency(v)}
                      axisLine={false}
                      tickLine={false}
                      width={60}
                      tick={{ fontSize: 11 }}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value) => (
                            <span className="font-medium">{formatCurrency(Number(value))}</span>
                          )}
                        />
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="balance"
                      stroke="var(--color-balance)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3, strokeWidth: 1 }}
                    />
                  </LineChart>
                </ChartContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // Full-size mode
  return (
    <div>
      {loading || multiAccountLoading ? (
        <BalanceSkeleton />
      ) : error ? (
        <div className="flex flex-col items-center justify-center rounded-md border py-12 text-center">
          <p className="text-lg font-medium">Failed to load</p>
          <p className="text-sm text-muted-foreground mt-1">
            Could not load balance data.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={fetchData}>
            Retry
          </Button>
        </div>
      ) : selectedAccountIds.length === 0 && (!data || data.points.length === 0) ? (
        <div className="flex flex-col items-center justify-center rounded-md border py-12 text-center">
          <Minus className="size-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium">No balance data</p>
          <p className="text-sm text-muted-foreground mt-1">
            No transactions found for this period.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary Cards */}
          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Starting Balance</p>
                  <p className="text-lg font-semibold mt-1">
                    {formatCurrency(summary.startBalance)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Current Balance</p>
                  <p className="text-lg font-semibold mt-1">
                    {formatCurrency(summary.endBalance)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    Net Change {netIcon}
                  </p>
                  <p className={cn("text-lg font-semibold mt-1", netColor)}>
                    {summary.netChange >= 0 ? "+" : ""}
                    {formatCurrency(summary.netChange)}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Chart Card */}
          <Card>
            <CardContent className="pt-6">
              {/* Account Selector Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">
                  {selectedAccountIds.length === 0
                    ? "Balance History"
                    : "Balance Comparison"}
                </h3>
                <BalanceChartAccountSelector
                  selectedAccountIds={selectedAccountIds}
                  onSelectionChange={setSelectedAccountIds}
                  disabled={loading || multiAccountLoading}
                />
              </div>

              {/* Chart */}
              {selectedAccountIds.length === 0 ? (
                // Single-account mode (existing chart)
                <ChartContainer config={balanceChartConfig} className="min-h-[300px] w-full">
                  <LineChart accessibilityLayer data={data?.points || []}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis
                      tickFormatter={(v: number) => formatCurrency(v)}
                      axisLine={false}
                      tickLine={false}
                      width={70}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value) => (
                            <span className="font-medium">{formatCurrency(Number(value))}</span>
                          )}
                        />
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="balance"
                      stroke="var(--color-balance)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 2 }}
                    />
                  </LineChart>
                </ChartContainer>
              ) : (
                // Multi-account mode (new)
                <ChartContainer config={dynamicChartConfig} className="min-h-[300px] w-full">
                  <LineChart accessibilityLayer data={multiAccountData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis
                      tickFormatter={(v: number) => formatCurrency(v)}
                      axisLine={false}
                      tickLine={false}
                      width={70}
                    />
                    <ChartTooltip content={<MultiAccountTooltip />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    {selectedAccountIds.map((accountId, idx) => (
                      <Line
                        key={accountId}
                        type="monotone"
                        dataKey={String(accountId)}
                        stroke={ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 2 }}
                      />
                    ))}
                  </LineChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
