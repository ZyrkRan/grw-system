"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import { TrendingDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart"

interface PieDataItem {
  name: string
  color: string
  value: number
  count: number
}

interface AnalyticsData {
  pieData: PieDataItem[]
  trendData: Record<string, string | number>[]
  trendCategories: string[]
  trendColors: Record<string, string>
  summary: {
    totalSpend: number
    totalCount: number
    averageTransaction: number
    uncategorizedCount: number
    topCategory: string | null
  }
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function sanitizeKey(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
}

// --- Sub-components ---

function MonthRangePicker({
  month,
  year,
  trendRange,
  onMonthChange,
  onYearChange,
  onTrendRangeChange,
}: {
  month: number
  year: number
  trendRange: number
  onMonthChange: (m: number) => void
  onYearChange: (y: number) => void
  onTrendRangeChange: (r: number) => void
}) {
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

  return (
    <div className="flex items-center gap-2">
      <Select value={String(month)} onValueChange={(v) => onMonthChange(parseInt(v, 10))}>
        <SelectTrigger className="w-[130px] h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MONTHS.map((name, i) => (
            <SelectItem key={i + 1} value={String(i + 1)}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={String(year)} onValueChange={(v) => onYearChange(parseInt(v, 10))}>
        <SelectTrigger className="w-[90px] h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex rounded-md border border-input">
        {[3, 6, 12].map((r, idx, arr) => (
          <Button
            key={r}
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 rounded-none px-3 text-xs",
              idx === 0 && "rounded-l-md",
              idx === arr.length - 1 && "rounded-r-md",
              trendRange === r && "bg-muted font-medium hover:bg-muted"
            )}
            onClick={() => onTrendRangeChange(r)}
          >
            {r}mo
          </Button>
        ))}
      </div>
    </div>
  )
}

function SpendingPieChart({ data }: { data: PieDataItem[] }) {
  const pieConfig = useMemo(() => {
    const config: ChartConfig = {}
    for (const item of data) {
      config[sanitizeKey(item.name)] = { label: item.name, color: item.color }
    }
    return config
  }, [data])

  const chartData = useMemo(
    () =>
      data.map((item) => ({
        ...item,
        key: sanitizeKey(item.name),
        fill: `var(--color-${sanitizeKey(item.name)})`,
      })),
    [data]
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Spending by Category</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={pieConfig} className="mx-auto min-h-[280px] w-full">
          <PieChart accessibilityLayer>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
              nameKey="key"
            >
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.fill} stroke="none" />
              ))}
            </Pie>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  nameKey="key"
                  formatter={(value) => (
                    <span className="font-medium">{formatCurrency(Number(value))}</span>
                  )}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent nameKey="key" />} />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

function CategoryTrendChart({
  data,
  categories,
  colors,
}: {
  data: Record<string, string | number>[]
  categories: string[]
  colors: Record<string, string>
}) {
  const { config, sanitizedCategories, remappedData } = useMemo(() => {
    const config: ChartConfig = {}
    const keyMap = new Map<string, string>()
    for (const cat of categories) {
      const key = sanitizeKey(cat)
      keyMap.set(cat, key)
      config[key] = { label: cat, color: colors[cat] || "hsl(var(--muted-foreground))" }
    }
    const remappedData = data.map((row) => {
      const newRow: Record<string, string | number> = { month: row.month }
      for (const cat of categories) newRow[keyMap.get(cat)!] = row[cat] ?? 0
      return newRow
    })
    return {
      config,
      sanitizedCategories: categories.map((c) => keyMap.get(c)!),
      remappedData,
    }
  }, [data, categories, colors])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Category Trends</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="min-h-[280px] w-full">
          <BarChart accessibilityLayer data={remappedData}>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="month"
              tickFormatter={(v: string) => {
                const [, m] = v.split("-")
                return MONTH_SHORT[parseInt(m, 10) - 1]
              }}
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
                  labelFormatter={(label) => {
                    const parts = String(label).split("-")
                    return `${MONTHS[parseInt(parts[1], 10) - 1]} ${parts[0]}`
                  }}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            {sanitizedCategories.map((key, idx) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="a"
                fill={`var(--color-${key})`}
                radius={idx === sanitizedCategories.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

function AnalyticsSkeleton() {
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[280px] w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[280px] w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border py-12 text-center">
      <TrendingDown className="size-12 text-muted-foreground mb-4" />
      <p className="text-lg font-medium">No transactions found</p>
      <p className="text-sm text-muted-foreground mt-1">
        No outflow transactions for this period.
      </p>
    </div>
  )
}

// --- Main component ---

export function CategoryAnalytics({ accountId }: { accountId?: string }) {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [trendRange, setTrendRange] = useState(6)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const params = new URLSearchParams({
        month: String(month),
        year: String(year),
        months: String(trendRange),
      })
      if (accountId && accountId !== "all") {
        params.set("accountId", accountId)
      }
      const res = await fetch(`/api/finances/analytics/category?${params}`)
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
      console.error("Failed to fetch analytics:", err)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [month, year, trendRange, accountId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <div>
      <div className="flex justify-end mb-4">
        <MonthRangePicker
          month={month}
          year={year}
          trendRange={trendRange}
          onMonthChange={setMonth}
          onYearChange={setYear}
          onTrendRangeChange={setTrendRange}
        />
      </div>

      {loading ? (
        <AnalyticsSkeleton />
      ) : error ? (
        <div className="flex flex-col items-center justify-center rounded-md border py-12 text-center">
          <p className="text-lg font-medium">Failed to load</p>
          <p className="text-sm text-muted-foreground mt-1">
            Could not load analytics data.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={fetchData}>
            Retry
          </Button>
        </div>
      ) : !data || data.summary.totalCount === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Top Category</p>
                <p className="text-lg font-semibold mt-1">
                  {data.summary.topCategory || "N/A"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Uncategorized</p>
                <p className="text-lg font-semibold mt-1">
                  {data.summary.uncategorizedCount}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    transaction{data.summary.uncategorizedCount !== 1 ? "s" : ""}
                  </span>
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Avg Transaction</p>
                <p className="text-lg font-semibold mt-1">
                  {formatCurrency(data.summary.averageTransaction)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SpendingPieChart data={data.pieData} />
            <CategoryTrendChart
              data={data.trendData}
              categories={data.trendCategories}
              colors={data.trendColors}
            />
          </div>
        </div>
      )}
    </div>
  )
}
