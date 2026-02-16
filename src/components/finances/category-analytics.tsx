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
import { TrendingDown, Minus, ChevronDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  onSliceSelect,
  tooltipSide,
}: {
  data: PieDataItem[]
  compact?: boolean
  title?: string
  onCategoryClick?: (categoryId: number | null) => void
  onSliceSelect?: (categoryId: number | null, categoryName: string) => void
  tooltipSide?: "left" | "right"
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
    if (data.isGroup && onCategoryClick) {
      onCategoryClick(data.id)
    } else if (!data.isGroup && onSliceSelect) {
      onSliceSelect(data.id, data.name)
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
          y={cy - (compact ? 6 : 10)}
          className={cn("fill-foreground font-medium", compact ? "text-[10px]" : "text-sm")}
        >
          Total
        </tspan>
        <tspan
          x={cx}
          y={cy + (compact ? 7 : 10)}
          className={cn("fill-foreground font-bold", compact ? "text-xs" : "text-base")}
        >
          {formatCurrency(total)}
        </tspan>
      </text>
    )
  }

  // Key that changes when data changes to retrigger Recharts animation
  const animationKey = useMemo(
    () => data.map((d) => `${d.id}-${d.value}`).join(","),
    [data]
  )

  // Custom cursor-following tooltip for compact charts
  const [hoveredSlice, setHoveredSlice] = useState<typeof chartData[number] | null>(null)
  const [mousePos, setMousePos] = useState<{x: number, y: number} | null>(null)

  const handleChartMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!tooltipSide) return
    const rect = e.currentTarget.getBoundingClientRect()
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }, [tooltipSide])

  const handleChartMouseLeave = useCallback(() => {
    setMousePos(null)
    setHoveredSlice(null)
  }, [])

  if (compact) {
    return (
      <div
        onMouseMove={handleChartMouseMove}
        onMouseLeave={handleChartMouseLeave}
        className="h-full w-full relative"
      >
        <ChartContainer config={pieConfig} className="h-full w-full">
          <PieChart accessibilityLayer>
            <Pie
              key={animationKey}
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={38}
              outerRadius={65}
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
              animationBegin={0}
              animationDuration={500}
              animationEasing="ease-out"
              onClick={handlePieClick}
              style={onCategoryClick || onSliceSelect ? { cursor: 'pointer' } : undefined}
              onMouseLeave={() => setHoveredSlice(null)}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={index}
                  fill={entry.color}
                  stroke="none"
                  onMouseEnter={() => setHoveredSlice(entry)}
                />
              ))}
              <Label content={renderCenterLabel} position="center" />
            </Pie>
          </PieChart>
        </ChartContainer>
        {tooltipSide && hoveredSlice && mousePos && (
          <div
            className="pointer-events-none absolute z-50 min-w-[180px] rounded-lg border bg-background p-2 shadow-sm"
            style={{
              top: mousePos.y,
              left: mousePos.x,
              transform: tooltipSide === "right"
                ? "translateX(16px) translateY(-50%)"
                : "translateX(calc(-100% - 16px)) translateY(-50%)",
            }}
          >
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium">{hoveredSlice.name}</span>
              <span className="text-sm font-bold">{formatCurrency(hoveredSlice.value)}</span>
              <span className="text-xs text-muted-foreground">{hoveredSlice.count} transactions</span>
              {hoveredSlice.isGroup && onCategoryClick && (
                <span className="text-xs text-primary">Click to expand</span>
              )}
              {!hoveredSlice.isGroup && onSliceSelect && (
                <span className="text-xs text-primary">Click to view transactions</span>
              )}
            </div>
          </div>
        )}
      </div>
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
              key={animationKey}
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
              animationBegin={0}
              animationDuration={500}
              animationEasing="ease-out"
              onClick={handlePieClick}
              style={onCategoryClick || onSliceSelect ? { cursor: 'pointer' } : undefined}
            >
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.color} stroke="none" />
              ))}
              <Label content={renderCenterLabel} position="center" />
            </Pie>
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

// --- Transaction dialog ---

function CategoryTransactionsDialog({
  open,
  onOpenChange,
  category,
  transactions,
  loading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: { id: number; name: string; color: string } | null
  transactions: DialogTransaction[]
  loading: boolean
}) {
  const total = transactions.reduce((sum, tx) => sum + Math.abs(Number(tx.amount)), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {category && (
              <div
                className="size-3 rounded-full shrink-0"
                style={{ backgroundColor: category.color }}
              />
            )}
            {category?.name || "Transactions"}
          </DialogTitle>
          {!loading && transactions.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {transactions.length} transaction{transactions.length !== 1 ? "s" : ""} &middot; {formatCurrency(total)}
            </p>
          )}
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            No transactions found
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto -mx-6 px-6">
            <div className="space-y-1">
              {transactions.map((tx) => {
                const amount = Number(tx.amount)
                const isInflow = tx.type === "INFLOW"
                return (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between gap-3 rounded-md px-3 py-2 hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {tx.merchantName || tx.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                        {tx.merchantName && tx.description !== tx.merchantName && (
                          <span className="ml-1.5">&middot; {tx.description}</span>
                        )}
                      </p>
                    </div>
                    <span className={cn(
                      "text-sm font-medium shrink-0",
                      isInflow ? "text-emerald-600" : "text-foreground"
                    )}>
                      {isInflow ? "+" : "-"}{formatCurrency(Math.abs(amount))}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// --- Main component ---

interface DialogTransaction {
  id: number
  date: string
  description: string
  amount: number | string
  type: string
  merchantName: string | null
}

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

  // Transaction dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogCategory, setDialogCategory] = useState<{ id: number; name: string; color: string } | null>(null)
  const [dialogTransactions, setDialogTransactions] = useState<DialogTransaction[]>([])
  const [dialogLoading, setDialogLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const params = new URLSearchParams()
      if (timeframe.dateFrom) params.set("dateFrom", timeframe.dateFrom)
      if (timeframe.dateTo) params.set("dateTo", timeframe.dateTo)
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

  const handleSliceSelect = useCallback(async (categoryId: number | null, categoryName: string) => {
    if (categoryId === null) return
    // Find the color from the pie data
    const item = data?.inflowPieData.find((d) => d.id === categoryId)
      || data?.outflowPieData.find((d) => d.id === categoryId)
    setDialogCategory({ id: categoryId, name: categoryName, color: item?.color || "#6b7280" })
    setDialogOpen(true)
    setDialogLoading(true)
    setDialogTransactions([])

    try {
      const params = new URLSearchParams()
      params.set("categoryId", String(categoryId))
      if (timeframe.dateFrom) params.set("dateFrom", timeframe.dateFrom)
      if (timeframe.dateTo) params.set("dateTo", timeframe.dateTo)
      if (accountId && accountId !== "all") params.set("accountId", accountId)
      params.set("pageSize", "50")
      const res = await fetch(`/api/finances/transactions?${params}`)
      const result = await res.json()
      if (result.success) {
        setDialogTransactions(result.data)
      }
    } catch (err) {
      console.error("Failed to fetch category transactions:", err)
    } finally {
      setDialogLoading(false)
    }
  }, [data, timeframe, accountId])

  const [compactOpen, setCompactOpen] = useState(false)

  if (compact) {
    return (
    <>
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-32" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
              <Skeleton className="h-3 w-28" />
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
                <h3 className="text-sm font-semibold">Categories</h3>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium">{formatCurrency(data.summary.totalSpend)}</span>
                  <ChevronDown className={cn("size-4 text-muted-foreground transition-transform md:hidden", compactOpen && "rotate-180")} />
                </div>
              </button>

              {/* Top outflow categories */}
              {(() => {
                const topCategories = data.outflowPieData
                  .filter((item) => item.parentId === null)
                  .sort((a, b) => b.value - a.value)
                const shown = topCategories.slice(0, 3)
                const remaining = topCategories.length - shown.length

                return (
                  <div className="space-y-1.5">
                    {shown.map((cat) => (
                      <div key={cat.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="size-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="truncate">{cat.name}</span>
                        </div>
                        <span className="font-medium shrink-0 ml-2">{formatCurrency(cat.value)}</span>
                      </div>
                    ))}
                    {remaining > 0 && (
                      <p className="text-xs text-muted-foreground pl-[18px]">+ {remaining} more</p>
                    )}
                  </div>
                )
              })()}

              {/* Footer stats */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{data.summary.totalCount} transactions</span>
                {data.summary.uncategorizedCount > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-amber-600">{data.summary.uncategorizedCount} uncategorized</span>
                  </>
                )}
              </div>

              <div className={cn(compactOpen ? "block" : "hidden md:block")}>
                <Separator className="mb-3" />
                <div className="grid grid-cols-2 gap-3 h-[180px]">
                {/* Inflow Pie */}
                <div className="flex flex-col min-h-0">
                  <div className="flex items-center justify-between h-5 mb-1">
                    <p className="text-xs text-muted-foreground truncate">
                      {expandedInflowName ? expandedInflowName : "Inflow"}
                    </p>
                    {expandedInflowName && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-2 text-xs shrink-0"
                        onClick={() => setExpandedInflowCategory(null)}
                      >
                        ← Back
                      </Button>
                    )}
                  </div>
                  <div className="flex-1 min-h-0">
                    {filteredInflowData.length > 0 ? (
                      <SpendingPieChart
                        data={filteredInflowData}
                        compact
                        onCategoryClick={handleInflowCategoryClick}
                        onSliceSelect={handleSliceSelect}
                        tooltipSide="right"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                        {expandedInflowName ? "No subcategories" : "No inflows"}
                      </div>
                    )}
                  </div>
                </div>
                {/* Outflow Pie */}
                <div className="flex flex-col min-h-0">
                  <div className="flex items-center justify-between h-5 mb-1">
                    <p className="text-xs text-muted-foreground truncate">
                      {expandedOutflowName ? expandedOutflowName : "Outflow"}
                    </p>
                    {expandedOutflowName && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-2 text-xs shrink-0"
                        onClick={() => setExpandedOutflowCategory(null)}
                      >
                        ← Back
                      </Button>
                    )}
                  </div>
                  <div className="flex-1 min-h-0">
                    {filteredOutflowData.length > 0 ? (
                      <SpendingPieChart
                        data={filteredOutflowData}
                        compact
                        onCategoryClick={handleOutflowCategoryClick}
                        onSliceSelect={handleSliceSelect}
                        tooltipSide="left"
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
            </div>
          )}
        </CardContent>
      </Card>
      <CategoryTransactionsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={dialogCategory}
        transactions={dialogTransactions}
        loading={dialogLoading}
      />
    </>
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
                onSliceSelect={handleSliceSelect}
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
                onSliceSelect={handleSliceSelect}
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
      <CategoryTransactionsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={dialogCategory}
        transactions={dialogTransactions}
        loading={dialogLoading}
      />
    </div>
  )
}
