"use client"

import { useState, useEffect, useCallback } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import { TrendingUp, TrendingDown, Minus, ChevronDown, ArrowUpRight, ArrowDownRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  ChartContainer,
  ChartTooltip,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { TimeframeValue } from "./timeframe-selector"

interface InflowOutflowPoint {
  date: string
  label: string
  inflow: number
  outflow: number
}

interface InflowOutflowSummary {
  totalInflow: number
  totalOutflow: number
  netChange: number
}

interface InflowOutflowData {
  points: InflowOutflowPoint[]
  summary: InflowOutflowSummary
  granularity: "daily" | "weekly" | "monthly"
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

const chartConfig = {
  inflow: {
    label: "Inflow",
    color: "#10b981", // Green
  },
  outflow: {
    label: "Outflow",
    color: "#ef4444", // Red
  },
} satisfies ChartConfig

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null

  const data = payload[0].payload
  const inflow = data.inflow || 0
  const outflow = data.outflow || 0
  const net = inflow - outflow

  return (
    <div className="rounded-lg border bg-background p-3 shadow-md">
      <p className="text-sm font-medium mb-2">{data.label}</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-muted-foreground">Inflow:</span>
          <span className="text-xs font-semibold text-green-600">
            {formatCurrency(inflow)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-muted-foreground">Outflow:</span>
          <span className="text-xs font-semibold text-red-600">
            {formatCurrency(outflow)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 pt-1 border-t">
          <span className="text-xs text-muted-foreground">Net:</span>
          <span className={cn("text-xs font-semibold", net >= 0 ? "text-green-600" : "text-red-600")}>
            {net >= 0 ? "+" : ""}{formatCurrency(net)}
          </span>
        </div>
      </div>
    </div>
  )
}

function InflowOutflowSkeleton() {
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

export function InflowOutflowChart({
  accountId,
  timeframe,
  compact = false,
}: {
  accountId?: string
  timeframe: TimeframeValue
  compact?: boolean
}) {
  const [data, setData] = useState<InflowOutflowData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const params = new URLSearchParams({
        dateFrom: timeframe.dateFrom,
        dateTo: timeframe.dateTo,
      })
      if (accountId && accountId !== "all") {
        params.set("accountId", accountId)
      }
      const res = await fetch(`/api/finances/analytics/inflow-outflow?${params}`)
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
      console.error("Failed to fetch inflow/outflow data:", err)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [timeframe, accountId])

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

  const [compactOpen, setCompactOpen] = useState(false)

  if (compact) {
    return (
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-32" />
              <div className="grid grid-cols-2 gap-2">
                <Skeleton className="h-[60px] rounded-lg" />
                <Skeleton className="h-[60px] rounded-lg" />
              </div>
              <Skeleton className="h-3 w-24" />
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
                <h3 className="text-sm font-semibold">Inflow/Outflow</h3>
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform md:hidden", compactOpen && "rotate-180")} />
              </button>

              {/* Mini stat blocks */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-2.5">
                  <div className="flex items-center gap-1 mb-0.5">
                    <ArrowUpRight className="size-3.5 text-green-600" />
                    <span className="text-xs text-muted-foreground">Inflow</span>
                  </div>
                  <p className="text-sm font-semibold text-green-600">{formatCurrency(data.summary.totalInflow)}</p>
                </div>
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-2.5">
                  <div className="flex items-center gap-1 mb-0.5">
                    <ArrowDownRight className="size-3.5 text-red-600" />
                    <span className="text-xs text-muted-foreground">Outflow</span>
                  </div>
                  <p className="text-sm font-semibold text-red-600">{formatCurrency(data.summary.totalOutflow)}</p>
                </div>
              </div>

              {/* Net change */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">Net</span>
                <span className={cn("font-semibold", netColor)}>
                  {data.summary.netChange >= 0 ? "+" : ""}
                  {formatCurrency(data.summary.netChange)}
                </span>
                {netIcon}
              </div>

              <div className={cn(compactOpen ? "block" : "hidden md:block")}>
                <Separator className="mb-3" />
                <ChartContainer config={chartConfig} className="h-[200px] w-full">
                  <BarChart accessibilityLayer data={data.points}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                    <YAxis
                      tickFormatter={(v: number) => formatCurrency(v)}
                      axisLine={false}
                      tickLine={false}
                      width={60}
                      tick={{ fontSize: 11 }}
                    />
                    <ChartTooltip content={<CustomTooltip />} />
                    <Bar
                      dataKey="inflow"
                      fill="var(--color-inflow)"
                      radius={[2, 2, 0, 0]}
                    />
                    <Bar
                      dataKey="outflow"
                      fill="var(--color-outflow)"
                      radius={[2, 2, 0, 0]}
                    />
                  </BarChart>
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
      {loading ? (
        <InflowOutflowSkeleton />
      ) : error ? (
        <div className="flex flex-col items-center justify-center rounded-md border py-12 text-center">
          <p className="text-lg font-medium">Failed to load</p>
          <p className="text-sm text-muted-foreground mt-1">
            Could not load inflow/outflow data.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={fetchData}>
            Retry
          </Button>
        </div>
      ) : !data || data.points.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border py-12 text-center">
          <Minus className="size-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium">No transaction data</p>
          <p className="text-sm text-muted-foreground mt-1">
            No transactions found for selected timeframe.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Total Inflow</p>
                <p className="text-lg font-semibold mt-1 text-green-600">
                  {formatCurrency(data.summary.totalInflow)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Total Outflow</p>
                <p className="text-lg font-semibold mt-1 text-red-600">
                  {formatCurrency(data.summary.totalOutflow)}
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
              <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
                <BarChart accessibilityLayer data={data.points}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis
                    tickFormatter={(v: number) => formatCurrency(v)}
                    axisLine={false}
                    tickLine={false}
                    width={70}
                  />
                  <ChartTooltip content={<CustomTooltip />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar
                    dataKey="inflow"
                    fill="var(--color-inflow)"
                    radius={[4, 4, 0, 0]}
                    label={{
                      position: "top",
                      formatter: (value: number) => formatCurrency(value),
                      fontSize: 11,
                      fill: "#10b981",
                    }}
                  />
                  <Bar
                    dataKey="outflow"
                    fill="var(--color-outflow)"
                    radius={[4, 4, 0, 0]}
                    label={{
                      position: "top",
                      formatter: (value: number) => formatCurrency(value),
                      fontSize: 11,
                      fill: "#ef4444",
                    }}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
