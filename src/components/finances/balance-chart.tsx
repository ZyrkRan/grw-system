"use client"

import { useState, useEffect, useCallback } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { TimeframeValue } from "@/components/finances/timeframe-selector"

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

type Granularity = "daily" | "weekly" | "monthly"

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

  // Auto-calculate granularity based on timeframe duration
  const granularity: Granularity = (() => {
    const fromDate = new Date(timeframe.dateFrom)
    const toDate = new Date(timeframe.dateTo)
    const durationMs = toDate.getTime() - fromDate.getTime()
    const durationDays = durationMs / (1000 * 60 * 60 * 24)

    if (durationDays <= 7) {
      return "daily"
    } else if (durationDays <= 90) {
      return "weekly"
    } else {
      return "monthly"
    }
  })()

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
    fetchData()
  }, [fetchData])

  const netIcon =
    data && data.summary.netChange > 0 ? (
      <TrendingUp className="h-4 w-4 text-green-500" />
    ) : data && data.summary.netChange < 0 ? (
      <TrendingDown className="h-4 w-4 text-red-500" />
    ) : (
      <Minus className="h-4 w-4 text-muted-foreground" />
    )

  const netColor =
    data && data.summary.netChange > 0
      ? "text-green-600"
      : data && data.summary.netChange < 0
        ? "text-red-600"
        : ""

  if (compact) {
    return (
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-[200px] w-full" />
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
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Balance History</h3>
                <span className="text-xs font-medium">
                  {formatCurrency(data.summary.endBalance)}
                </span>
              </div>
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
          )}
        </CardContent>
      </Card>
    )
  }

  // Full-size mode
  return (
    <div>
      {loading ? (
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
      ) : !data || data.points.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border py-12 text-center">
          <Minus className="size-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium">No balance data</p>
          <p className="text-sm text-muted-foreground mt-1">
            No transactions found for this period.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Starting Balance</p>
                <p className="text-lg font-semibold mt-1">
                  {formatCurrency(data.summary.startBalance)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Current Balance</p>
                <p className="text-lg font-semibold mt-1">
                  {formatCurrency(data.summary.endBalance)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  Net Change {netIcon}
                </p>
                <p className={cn("text-lg font-semibold mt-1", netColor)}>
                  {data.summary.netChange >= 0 ? "+" : ""}
                  {formatCurrency(data.summary.netChange)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-6">
              <ChartContainer config={balanceChartConfig} className="min-h-[300px] w-full">
                <LineChart accessibilityLayer data={data.points}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                  />
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
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
