"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useState, useMemo } from "react"

export type TimeframePreset = "today" | "week" | "month" | "3months" | "custom"

export interface TimeframeValue {
  preset: TimeframePreset
  dateFrom: string // ISO date string (YYYY-MM-DD)
  dateTo: string // ISO date string (YYYY-MM-DD)
}

interface TimeframeSelectorProps {
  value: TimeframeValue
  onChange: (value: TimeframeValue) => void
}

// Helper function to get date range from preset
export function getTimeframeValue(preset: TimeframePreset): TimeframeValue {
  const today = new Date()
  const todayStr = today.toISOString().split("T")[0]

  switch (preset) {
    case "today":
      return {
        preset: "today",
        dateFrom: todayStr,
        dateTo: todayStr,
      }

    case "week": {
      // Get start of this week (Monday)
      const startOfWeek = new Date(today)
      const day = startOfWeek.getDay()
      const diff = day === 0 ? -6 : 1 - day // Adjust to Monday
      startOfWeek.setDate(startOfWeek.getDate() + diff)
      return {
        preset: "week",
        dateFrom: startOfWeek.toISOString().split("T")[0],
        dateTo: todayStr,
      }
    }

    case "month": {
      // Start of this month to today
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      return {
        preset: "month",
        dateFrom: startOfMonth.toISOString().split("T")[0],
        dateTo: todayStr,
      }
    }

    case "3months": {
      // 3 months ago to today
      const threeMonthsAgo = new Date(today)
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
      return {
        preset: "3months",
        dateFrom: threeMonthsAgo.toISOString().split("T")[0],
        dateTo: todayStr,
      }
    }

    case "custom":
      // Default to this month for custom
      return getTimeframeValue("month")

    default:
      return getTimeframeValue("month")
  }
}

// Format timeframe for display
export function formatTimeframeLabel(timeframe: TimeframeValue): string {
  const fromDate = new Date(timeframe.dateFrom)
  const toDate = new Date(timeframe.dateTo)

  const formatOptions: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  }

  const from = fromDate.toLocaleDateString("en-US", formatOptions)
  const to = toDate.toLocaleDateString("en-US", formatOptions)

  return `${from} - ${to}`
}

const presets: Array<{ value: TimeframePreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "3months", label: "Past 3 Months" },
  { value: "custom", label: "Custom" },
]

export function TimeframeSelector({ value, onChange }: TimeframeSelectorProps) {
  const [customFrom, setCustomFrom] = useState(value.dateFrom)
  const [customTo, setCustomTo] = useState(value.dateTo)
  const [error, setError] = useState<string | null>(null)

  // Calculate max date once to avoid hydration mismatch
  const maxDate = useMemo(() => new Date().toISOString().split("T")[0], [])

  const handlePresetChange = (preset: TimeframePreset) => {
    setError(null)
    if (preset === "custom") {
      // Just switch to custom mode, keep current dates
      onChange({
        preset: "custom",
        dateFrom: customFrom,
        dateTo: customTo,
      })
    } else {
      const newValue = getTimeframeValue(preset)
      setCustomFrom(newValue.dateFrom)
      setCustomTo(newValue.dateTo)
      onChange(newValue)
    }
  }

  const handleCustomDateChange = (type: "from" | "to", dateStr: string) => {
    setError(null)

    const newFrom = type === "from" ? dateStr : customFrom
    const newTo = type === "to" ? dateStr : customTo

    // Validate dates
    const fromDate = new Date(newFrom)
    const toDate = new Date(newTo)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (toDate < fromDate) {
      setError("End date must be after start date")
      return
    }

    if (fromDate > today || toDate > today) {
      setError("Dates cannot be in the future")
      return
    }

    // Update local state
    if (type === "from") {
      setCustomFrom(dateStr)
    } else {
      setCustomTo(dateStr)
    }

    // Update parent
    onChange({
      preset: "custom",
      dateFrom: newFrom,
      dateTo: newTo,
    })
  }

  const showCustomInputs = value.preset === "custom"

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Preset buttons */}
        <div className="flex rounded-md border border-input">
          {presets.map((preset) => (
            <Button
              key={preset.value}
              variant="ghost"
              size="sm"
              className={cn(
                "rounded-none first:rounded-l-md last:rounded-r-md border-r last:border-r-0",
                value.preset === preset.value && "bg-muted"
              )}
              onClick={() => handlePresetChange(preset.value)}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        {/* Custom date inputs */}
        {showCustomInputs && (
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => handleCustomDateChange("from", e.target.value)}
              className="w-auto"
              max={maxDate}
            />
            <span className="text-sm text-muted-foreground">to</span>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => handleCustomDateChange("to", e.target.value)}
              className="w-auto"
              max={maxDate}
            />
          </div>
        )}
      </div>

      {/* Error message */}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
