"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  PieChart,
  Pie,
  Cell,
  Label,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import { TrendingDown, ChevronDown } from "lucide-react"
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
import type { TimeframeValue } from "@/components/finances/timeframe-selector"

interface PieDataItem {
  id: number | null
  name: string
  color: string
  value: number
  count: number
  parentId: number | null
  isGroup: boolean
}

interface AnalyticsData {
  inflowPieData: PieDataItem[]
  outflowPieData: PieDataItem[]
  trendData: Record<string, string | number>[]
  trendCategories: string[]
  trendColors: Record<string, string>
  summary: {
    totalSpend: number
    totalCount: number
    averageTransaction: number
    uncategorizedCount: number
    topCategory: string | null
    topInflowCategory: string | null
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

function SpendingPieChart({
  data,
  compact = false,
  title = "Spending by Category",
  onCategoryClick,
}: {
  data: PieDataItem[]
  compact?: boolean
  title?: string
  onCategoryClick?: (categoryId: number | null) => void
}) {
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

  const total = useMemo(() => {
    return data.reduce((sum, item) => sum + item.value, 0)
  }, [data])

  const handlePieClick = (data: any) => {
    if (onCategoryClick && data.isGroup) {
      onCategoryClick(data.id)
    }
  }

  // Custom label to render total in center
  const renderCenterLabel = ({ viewBox }: any) => {
    const { cx, cy } = viewBox
    return (
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        <tspan
          x={cx}
          y={cy - (compact ? 8 : 10)}
          className="fill-foreground text-sm font-medium"
        >
          Total
        </tspan>
        <tspan
          x={cx}
          y={cy + (compact ? 8 : 10)}
          className="fill-foreground text-base font-bold"
        >
          {formatCurrency(total)}
        </tspan>
      </text>
    )
  }

  if (compact) {
    return (
      <ChartContainer config={pieConfig} className="h-full w-full">
        <PieChart accessibilityLayer>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={75}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
            onClick={handlePieClick}
            style={onCategoryClick ? { cursor: 'pointer' } : undefined}
          >
            {chartData.map((entry, index) => (
              <Cell key={index} fill={entry.color} stroke="none" />
            ))}
            <Label content={renderCenterLabel} position="center" />
          </Pie>
          <ChartTooltip
            content={({ active, payload }) => {
              if (!active || !payload || !payload.length) return null
              const data = payload[0].payload
              return (
                <div className="rounded-lg border bg-background p-2 shadow-sm">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium">{data.name}</span>
                    <span className="text-sm font-bold">{formatCurrency(data.value)}</span>
                    <span className="text-xs text-muted-foreground">{data.count} transactions</span>
                    {data.isGroup && onCategoryClick && (
                      <span className="text-xs text-primary">Click to expand</span>
                    )}
                  </div>
                </div>
              )
            }}
          />
        </PieChart>
      </ChartContainer>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
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
              nameKey="name"
              onClick={handlePieClick}
              style={onCategoryClick ? { cursor: 'pointer' } : undefined}
            >
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.color} stroke="none" />
              ))}
              <Label content={renderCenterLabel} position="center" />
            </Pie>
            <ChartTooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null
                const data = payload[0].payload
                return (
                  <div className="rounded-lg border bg-background p-2 shadow-sm">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium">{data.name}</span>
                      <span className="text-sm font-bold">{formatCurrency(data.value)}</span>
                      <span className="text-xs text-muted-foreground">{data.count} transactions</span>
                      {data.isGroup && onCategoryClick && (
                        <span className="text-xs text-primary">Click to expand</span>
                      )}
                    </div>
                  </div>
                )
              }}
            />
            <ChartLegend
              content={({ payload }) => {
                if (!payload || !payload.length) return null
                return (
                  <div className="flex flex-wrap gap-2 justify-center mt-4">
                    {payload.map((entry, index) => (
                      <div key={index} className="flex items-center gap-1.5 text-xs">
                        <div
                          className="h-3 w-3 rounded-sm"
                          style={{ backgroundColor: entry.color }}
                        />
                        <span>{entry.value}</span>
                      </div>
                    ))}
                  </div>
                )
              }}
            />
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

export function CategoryAnalytics({
  accountId,
  timeframe,
  compact = false,
}: {
  accountId?: string
  timeframe: TimeframeValue
  compact?: boolean
}) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [expandedInflowCategory, setExpandedInflowCategory] = useState<number | null>(null)
  const [expandedOutflowCategory, setExpandedOutflowCategory] = useState<number | null>(null)

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
  }, [timeframe, accountId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Filter inflow data based on expanded state
  const filteredInflowData = useMemo(() => {
    if (!data) return []
    if (expandedInflowCategory === null) {
      // Show only top-level categories (no parent)
      return data.inflowPieData.filter((item) => item.parentId === null)
    } else {
      // Show only children of the expanded category
      return data.inflowPieData.filter((item) => item.parentId === expandedInflowCategory)
    }
  }, [data, expandedInflowCategory])

  // Filter outflow data based on expanded state
  const filteredOutflowData = useMemo(() => {
    if (!data) return []
    if (expandedOutflowCategory === null) {
      // Show only top-level categories (no parent)
      return data.outflowPieData.filter((item) => item.parentId === null)
    } else {
      // Show only children of the expanded category
      return data.outflowPieData.filter((item) => item.parentId === expandedOutflowCategory)
    }
  }, [data, expandedOutflowCategory])

  // Get expanded category name for breadcrumb
  const expandedInflowName = useMemo(() => {
    if (!data || expandedInflowCategory === null) return null
    const cat = data.inflowPieData.find((item) => item.id === expandedInflowCategory)
    return cat?.name || null
  }, [data, expandedInflowCategory])

  const expandedOutflowName = useMemo(() => {
    if (!data || expandedOutflowCategory === null) return null
    const cat = data.outflowPieData.find((item) => item.id === expandedOutflowCategory)
    return cat?.name || null
  }, [data, expandedOutflowCategory])

  const handleInflowCategoryClick = useCallback((categoryId: number | null) => {
    setExpandedInflowCategory(categoryId)
  }, [])

  const handleOutflowCategoryClick = useCallback((categoryId: number | null) => {
    setExpandedOutflowCategory(categoryId)
  }, [])

  const [compactOpen, setCompactOpen] = useState(false)

  if (compact) {
    return (
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-[200px] w-full hidden md:block" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm font-medium">Failed to load</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={fetchData}>
                Retry
              </Button>
            </div>
          ) : !data || data.summary.totalCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <TrendingDown className="size-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No data</p>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                className="flex items-center justify-between w-full md:cursor-default"
                onClick={() => setCompactOpen((o) => !o)}
              >
                <h3 className="text-sm font-semibold">Category Spending</h3>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium">{formatCurrency(data.summary.totalSpend)}</span>
                  <ChevronDown className={cn("size-4 text-muted-foreground transition-transform md:hidden", compactOpen && "rotate-180")} />
                </div>
              </button>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {data.summary.topCategory && (
                  <>
                    <span>Top: <span className="font-medium text-foreground">{data.summary.topCategory}</span></span>
                    {data.summary.uncategorizedCount > 0 && <span>·</span>}
                  </>
                )}
                {data.summary.uncategorizedCount > 0 && (
                  <span className="text-amber-600">{data.summary.uncategorizedCount} uncategorized</span>
                )}
              </div>
              <div className={cn("grid grid-cols-2 gap-3 h-[200px]", compactOpen ? "grid" : "hidden md:grid")}>
                {/* Inflow Pie */}
                <div className="flex flex-col">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-muted-foreground">Inflow</p>
                    {expandedInflowName && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-2 text-xs"
                        onClick={() => setExpandedInflowCategory(null)}
                      >
                        ← Back
                      </Button>
                    )}
                  </div>
                  {expandedInflowName && (
                    <p className="text-xs font-medium mb-1">{expandedInflowName}</p>
                  )}
                  <div className="flex-1">
                    {filteredInflowData.length > 0 ? (
                      <SpendingPieChart
                        data={filteredInflowData}
                        compact
                        onCategoryClick={handleInflowCategoryClick}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                        {expandedInflowName ? "No subcategories" : "No inflows"}
                      </div>
                    )}
                  </div>
                </div>
                {/* Outflow Pie */}
                <div className="flex flex-col">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-muted-foreground">Outflow</p>
                    {expandedOutflowName && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-2 text-xs"
                        onClick={() => setExpandedOutflowCategory(null)}
                      >
                        ← Back
                      </Button>
                    )}
                  </div>
                  {expandedOutflowName && (
                    <p className="text-xs font-medium mb-1">{expandedOutflowName}</p>
                  )}
                  <div className="flex-1">
                    {filteredOutflowData.length > 0 ? (
                      <SpendingPieChart
                        data={filteredOutflowData}
                        compact
                        onCategoryClick={handleOutflowCategoryClick}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                        {expandedOutflowName ? "No subcategories" : "No outflows"}
                      </div>
                    )}
                  </div>
                </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Top Outflow</p>
                <p className="text-lg font-semibold mt-1">
                  {data.summary.topCategory || "N/A"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Top Inflow</p>
                <p className="text-lg font-semibold mt-1">
                  {data.summary.topInflowCategory || "N/A"}
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              {expandedInflowName && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{expandedInflowName}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExpandedInflowCategory(null)}
                  >
                    ← Back
                  </Button>
                </div>
              )}
              <SpendingPieChart
                data={filteredInflowData}
                title={expandedInflowName ? "Subcategories" : "Inflow by Category"}
                onCategoryClick={handleInflowCategoryClick}
              />
            </div>
            <div className="space-y-2">
              {expandedOutflowName && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{expandedOutflowName}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExpandedOutflowCategory(null)}
                  >
                    ← Back
                  </Button>
                </div>
              )}
              <SpendingPieChart
                data={filteredOutflowData}
                title={expandedOutflowName ? "Subcategories" : "Outflow by Category"}
                onCategoryClick={handleOutflowCategoryClick}
              />
            </div>
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
