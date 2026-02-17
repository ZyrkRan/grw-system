"use client"

import { useState, useEffect, useCallback } from "react"
import { addMonths, subMonths, format, startOfMonth } from "date-fns"
import { AlertCircle } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { CalendarToolbar } from "./calendar-toolbar"
import { CalendarGrid } from "./calendar-grid"
import {
  CalendarDayPanelDesktop,
  CalendarDayPanelMobile,
} from "./calendar-day-panel"

// --- Shared types ---

export interface CalendarService {
  id: number
  serviceName: string
  serviceDate: string
  priceCharged: number | string
  status: string
  paymentStatus: string
  totalDurationMinutes: number | null
  customer: { id: number; name: string }
  serviceType: { id: number; name: string; icon: string | null } | null
}

export interface CalendarDueCustomer {
  id: number
  name: string
  serviceInterval: number
  daysUntilDue: number
  dueStatus: string
}

export interface CalendarRoute {
  id: number
  name: string
  color: string | null
  date: string | null
  _count: { customers: number }
}

export interface CalendarDayData {
  services: CalendarService[]
  dueCustomers: CalendarDueCustomer[]
  routes: CalendarRoute[]
}

export type CalendarDayMap = Record<string, CalendarDayData>

export interface VisibleLayers {
  dueCustomers: boolean
  services: boolean
  routes: boolean
}

// --- Component ---

export function CalendarView() {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [dayMap, setDayMap] = useState<CalendarDayMap>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visibleLayers, setVisibleLayers] = useState<VisibleLayers>({
    dueCustomers: true,
    services: true,
    routes: true,
  })

  const fetchCalendarData = useCallback(async (month: Date) => {
    setIsLoading(true)
    setError(null)
    try {
      const monthStr = format(month, "yyyy-MM")
      const res = await fetch(`/api/calendar?month=${monthStr}`)
      const json = await res.json()
      if (json.success) {
        setDayMap(json.data)
      } else {
        setError(json.error || "Failed to load calendar data")
      }
    } catch (err) {
      console.error("Failed to load calendar data:", err)
      setError("Failed to load calendar data")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCalendarData(currentMonth)
  }, [currentMonth, fetchCalendarData])

  function handleMonthChange(direction: "prev" | "next") {
    setCurrentMonth((m) =>
      direction === "prev" ? subMonths(m, 1) : addMonths(m, 1)
    )
  }

  function handleToday() {
    setCurrentMonth(startOfMonth(new Date()))
    setSelectedDate(new Date())
  }

  function handleSelectDate(date: Date) {
    setSelectedDate((prev) =>
      prev && prev.getTime() === date.getTime() ? null : date
    )
  }

  function handleToggleLayer(layer: keyof VisibleLayers) {
    setVisibleLayers((prev) => ({ ...prev, [layer]: !prev[layer] }))
  }

  function handleClosePanel() {
    setSelectedDate(null)
  }

  const selectedDayKey = selectedDate
    ? format(selectedDate, "yyyy-MM-dd")
    : null

  return (
    <div className="flex flex-col gap-4">
      <CalendarToolbar
        currentMonth={currentMonth}
        onMonthChange={handleMonthChange}
        onToday={handleToday}
        visibleLayers={visibleLayers}
        onToggleLayer={handleToggleLayer}
      />

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-md border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">Legend</span>

        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-red-500" />
          Late
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-amber-500" />
          Due Soon
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-muted-foreground/40" />
          On Track
        </div>

        <span className="text-border">|</span>

        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-green-500" />
          Complete
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-amber-500" />
          Pending
        </div>

        <span className="text-border">|</span>

        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full border bg-gradient-to-r from-blue-400 to-purple-400" />
          Route
        </div>
      </div>

      <div className="flex gap-4">
        {/* Calendar grid */}
        <div className="min-w-0 flex-1">
          {isLoading ? (
            <CalendarSkeleton />
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <AlertCircle className="size-8" />
              <p className="text-sm">{error}</p>
              <button
                onClick={() => fetchCalendarData(currentMonth)}
                className="text-sm text-primary underline hover:no-underline"
              >
                Try again
              </button>
            </div>
          ) : (
            <CalendarGrid
              currentMonth={currentMonth}
              dayMap={dayMap}
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              visibleLayers={visibleLayers}
            />
          )}
        </div>

        {/* Desktop panel */}
        {selectedDate && selectedDayKey && (
          <div className="hidden lg:flex">
            <CalendarDayPanelDesktop
              date={selectedDate}
              dayData={dayMap[selectedDayKey]}
              onClose={handleClosePanel}
            />
          </div>
        )}
      </div>

      {/* Mobile panel (Sheet) */}
      {selectedDate && selectedDayKey && (
        <div className="lg:hidden">
          <CalendarDayPanelMobile
            date={selectedDate}
            dayData={dayMap[selectedDayKey]}
            open={!!selectedDate}
            onClose={handleClosePanel}
          />
        </div>
      )}
    </div>
  )
}

function CalendarSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {/* Header row */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
      {/* Day cells - 6 rows */}
      {Array.from({ length: 6 }).map((_, row) => (
        <div key={row} className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }).map((_, col) => (
            <Skeleton key={col} className="h-24 w-full rounded-md" />
          ))}
        </div>
      ))}
    </div>
  )
}
