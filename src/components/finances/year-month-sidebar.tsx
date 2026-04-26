"use client"

import { CheckCircle2, ChevronDown, ChevronRight, Circle } from "lucide-react"
import { cn } from "@/lib/utils"

export interface MonthStat {
  month: string // "YYYY-MM"
  total: number
  categorized: number
  progress: number // 0-100
  income: number
  businessExpenses: number
}

export interface YearGroup {
  year: number
  total: number
  categorized: number
  progress: number
  months: MonthStat[]
}

interface Props {
  years: YearGroup[]
  selected: string | null
  expandedYears: Set<number>
  onSelect: (month: string) => void
  onToggleYear: (year: number) => void
}

function formatMonth(m: string) {
  const [y, mo] = m.split("-").map(Number)
  return new Date(y, mo - 1, 1).toLocaleString("en-US", { month: "short" })
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n)
}

export function YearMonthSidebar({
  years,
  selected,
  expandedYears,
  onSelect,
  onToggleYear,
}: Props) {
  if (years.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-center text-sm text-muted-foreground px-4">
        <Circle className="size-6 mb-2 opacity-30" />
        No transactions yet. Link an account or import a CSV to get started.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {years.map((yg) => {
        const isExpanded = expandedYears.has(yg.year)
        const yearComplete = yg.total > 0 && yg.categorized === yg.total

        return (
          <div key={yg.year} className="space-y-0.5">
            <button
              onClick={() => onToggleYear(yg.year)}
              className="w-full text-left rounded-md px-2 py-2 hover:bg-muted/60 transition-colors group flex items-center gap-2"
            >
              {isExpanded ? (
                <ChevronDown className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
              ) : (
                <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
              )}
              <span className="font-semibold text-sm flex-1 tabular-nums">{yg.year}</span>
              {yearComplete ? (
                <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
              ) : (
                <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                  {yg.categorized}/{yg.total}
                </span>
              )}
            </button>

            {/* Year-level progress bar under the header */}
            <div className="h-0.5 rounded-full overflow-hidden bg-muted mx-2">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  yearComplete ? "bg-emerald-500" : "bg-primary"
                )}
                style={{ width: `${yg.progress}%` }}
              />
            </div>

            {isExpanded && (
              <div className="space-y-0.5 pl-2 pt-1">
                {yg.months.map((m) => {
                  const isComplete = m.total > 0 && m.categorized === m.total
                  const isStarted = m.categorized > 0
                  const isActive = m.month === selected

                  return (
                    <button
                      key={m.month}
                      onClick={() => onSelect(m.month)}
                      className={cn(
                        "w-full text-left rounded-md px-3 py-2 transition-colors",
                        isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted/60"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{formatMonth(m.month)}</span>
                        {isComplete ? (
                          <CheckCircle2
                            className={cn(
                              "size-3.5",
                              isActive ? "text-primary-foreground" : "text-emerald-500"
                            )}
                          />
                        ) : (
                          <span
                            className={cn(
                              "text-xs tabular-nums",
                              isActive
                                ? "text-primary-foreground/70"
                                : "text-muted-foreground"
                            )}
                          >
                            {m.categorized}/{m.total}
                          </span>
                        )}
                      </div>

                      <div
                        className={cn(
                          "h-1 rounded-full overflow-hidden",
                          isActive ? "bg-primary-foreground/20" : "bg-muted"
                        )}
                      >
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            isComplete
                              ? isActive
                                ? "bg-primary-foreground"
                                : "bg-emerald-500"
                              : isStarted
                                ? isActive
                                  ? "bg-primary-foreground/70"
                                  : "bg-primary"
                                : "bg-transparent"
                          )}
                          style={{ width: `${m.progress}%` }}
                        />
                      </div>

                      {m.total > 0 && (
                        <div
                          className={cn(
                            "flex justify-between text-[11px] mt-1",
                            isActive
                              ? "text-primary-foreground/70"
                              : "text-muted-foreground"
                          )}
                        >
                          <span>{fmt(m.income)} in</span>
                          <span>{fmt(m.businessExpenses)} biz</span>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
