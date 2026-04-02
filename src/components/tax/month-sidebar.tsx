"use client"

import { CheckCircle2, Circle } from "lucide-react"
import { cn } from "@/lib/utils"

export interface MonthStat {
  month: string // "YYYY-MM"
  total: number
  categorized: number
  progress: number // 0-100
  income: number
  businessExpenses: number
}

interface Props {
  months: MonthStat[]
  selected: string | null
  onSelect: (month: string) => void
}

function formatMonth(m: string) {
  const [y, mo] = m.split("-").map(Number)
  return new Date(y, mo - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" })
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
}

export function MonthSidebar({ months, selected, onSelect }: Props) {
  if (months.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-center text-sm text-muted-foreground px-4">
        <Circle className="size-6 mb-2 opacity-30" />
        Upload a CSV to get started
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {months.map((m) => {
        const isComplete = m.total > 0 && m.categorized === m.total
        const isStarted = m.categorized > 0
        const isActive = m.month === selected

        return (
          <button
            key={m.month}
            onClick={() => onSelect(m.month)}
            className={cn(
              "w-full text-left rounded-md px-3 py-2.5 transition-colors group",
              isActive
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted/60"
            )}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">{formatMonth(m.month)}</span>
              {isComplete ? (
                <CheckCircle2 className={cn("size-4", isActive ? "text-primary-foreground" : "text-emerald-500")} />
              ) : (
                <span className={cn(
                  "text-xs tabular-nums",
                  isActive ? "text-primary-foreground/70" : "text-muted-foreground"
                )}>
                  {m.categorized}/{m.total}
                </span>
              )}
            </div>

            {/* Progress bar */}
            <div className={cn(
              "h-1 rounded-full overflow-hidden",
              isActive ? "bg-primary-foreground/20" : "bg-muted"
            )}>
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  isComplete
                    ? isActive ? "bg-primary-foreground" : "bg-emerald-500"
                    : isStarted
                      ? isActive ? "bg-primary-foreground/70" : "bg-primary"
                      : "bg-transparent"
                )}
                style={{ width: `${m.progress}%` }}
              />
            </div>

            {/* Quick stats */}
            {m.total > 0 && (
              <div className={cn(
                "flex justify-between text-xs mt-1.5",
                isActive ? "text-primary-foreground/70" : "text-muted-foreground"
              )}>
                <span>{fmt(m.income)} in</span>
                <span>{fmt(m.businessExpenses)} biz</span>
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
