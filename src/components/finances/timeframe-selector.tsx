"use client"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { cn } from "@/lib/utils"
import { useState, useMemo } from "react"

export type TimeframePreset = "all" | "month" | "3months" | "custom"

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
    case "all":
      return { preset: "all", dateFrom: "", dateTo: "" }

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
  { value: "all", label: "All Time" },
  { value: "month", label: "This Month" },
  { value: "3months", label: "Past 3 Months" },
  { value: "custom", label: "Custom" },
]

export function TimeframeSelector({ value, onChange }: TimeframeSelectorProps) {
  // Convert ISO strings to Date objects for DatePicker
  const [customFromDate, setCustomFromDate] = useState<Date | undefined>(() => {
    const date = new Date(value.dateFrom)
    return isNaN(date.getTime()) ? undefined : date
  })
  const [customToDate, setCustomToDate] = useState<Date | undefined>(() => {
    const date = new Date(value.dateTo)
    return isNaN(date.getTime()) ? undefined : date
  })
  const [error, setError] = useState<string | null>(null)

  // Calculate max date once to avoid hydration mismatch
  const maxDate = useMemo(() => {
    const date = new Date()
    date.setHours(23, 59, 59, 999)
    return date
  }, [])

  const handlePresetChange = (preset: TimeframePreset) => {
    setError(null)
    if (preset === "custom") {
      // Just switch to custom mode, keep current dates
      onChange({
        preset: "custom",
        dateFrom: customFromDate ? customFromDate.toISOString().split("T")[0] : value.dateFrom,
        dateTo: customToDate ? customToDate.toISOString().split("T")[0] : value.dateTo,
      })
    } else {
      const newValue = getTimeframeValue(preset)
      setCustomFromDate(new Date(newValue.dateFrom))
      setCustomToDate(new Date(newValue.dateTo))
      onChange(newValue)
    }
  }

  const handleCustomDateChange = (type: "from" | "to", date: Date | undefined) => {
    setError(null)

    if (!date) return

    const newFromDate = type === "from" ? date : customFromDate
    const newToDate = type === "to" ? date : customToDate

    // Validate dates
    const today = new Date()
    today.setHours(23, 59, 59, 999)

    if (date > today) {
      setError("Dates cannot be in the future")
      return
    }

    if (newFromDate && newToDate && newToDate < newFromDate) {
      setError("End date must be after start date")
      return
    }

    // Update local state
    if (type === "from") {
      setCustomFromDate(date)
    } else {
      setCustomToDate(date)
    }

    // Update parent if both dates are set
    if (newFromDate && newToDate) {
      onChange({
        preset: "custom",
        dateFrom: newFromDate.toISOString().split("T")[0],
        dateTo: newToDate.toISOString().split("T")[0],
      })
    }
  }

  const showCustomInputs = value.preset === "custom"

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Preset buttons */}
        <div className="flex rounded-md border border-input overflow-x-auto">
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
          <div className="flex items-center gap-2">
            <DatePicker
              date={customFromDate}
              onSelect={(date) => handleCustomDateChange("from", date)}
              placeholder="From"
              maxDate={maxDate}
              className="w-[150px]"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <DatePicker
              date={customToDate}
              onSelect={(date) => handleCustomDateChange("to", date)}
              placeholder="To"
              minDate={customFromDate}
              maxDate={maxDate}
              className="w-[150px]"
            />
          </div>
        )}
      </div>

      {/* Error message */}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
