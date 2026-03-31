"use client"

import { useState, useEffect, useCallback } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Wrench,
  FileText,
  UserCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns"

export interface CalendarEvent {
  id: number
  type: "service" | "invoice" | "customer-due"
  title: string
  date: string
  status?: string
  customerName: string
  customerId?: number
  amount?: number
}

interface CalendarViewProps {
  onDateSelect?: (date: Date) => void
  onEventClick?: (event: CalendarEvent) => void
  selectedDate?: Date
}

export function CalendarView({ onDateSelect, onEventClick, selectedDate }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchCalendarData = useCallback(async () => {
    setIsLoading(true)
    try {
      const month = currentMonth.getMonth() + 1
      const year = currentMonth.getFullYear()
      const res = await fetch(`/api/dashboard/calendar?month=${month}&year=${year}`)
      const result = await res.json()

      if (result.success) {
        const allEvents: CalendarEvent[] = [
          ...result.data.services,
          ...result.data.invoices,
          ...(result.data.customerDueDates || []).map((d: any) => ({
            id: d.customerId,
            type: "customer-due" as const,
            title: `${d.customerName} — service due`,
            date: d.nextServiceDate,
            customerName: d.customerName,
            customerId: d.customerId,
          })),
        ]
        setEvents(allEvents)
      }
    } catch (error) {
      console.error("Failed to fetch calendar data:", error)
    } finally {
      setIsLoading(false)
    }
  }, [currentMonth])

  useEffect(() => {
    fetchCalendarData()
  }, [fetchCalendarData])

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calendarStart = startOfWeek(monthStart)
  const calendarEnd = endOfWeek(monthEnd)

  // Build weeks array
  const weeks: Date[][] = []
  let day = calendarStart
  while (day <= calendarEnd) {
    const week: Date[] = []
    for (let i = 0; i < 7; i++) {
      week.push(day)
      day = addDays(day, 1)
    }
    weeks.push(week)
  }

  function getEventsForDate(date: Date): CalendarEvent[] {
    return events.filter((e) => isSameDay(new Date(e.date), date))
  }

  function getEventDots(date: Date) {
    const dayEvents = getEventsForDate(date)
    const dots: { color: string; count: number }[] = []

    const services = dayEvents.filter((e) => e.type === "service")
    const completedServices = services.filter((e) => e.status === "COMPLETE")
    const pendingServices = services.filter((e) => e.status !== "COMPLETE")
    const invoices = dayEvents.filter((e) => e.type === "invoice")
    const customerDue = dayEvents.filter((e) => e.type === "customer-due")

    if (completedServices.length > 0) dots.push({ color: "bg-success", count: completedServices.length })
    if (pendingServices.length > 0) dots.push({ color: "bg-warning", count: pendingServices.length })
    if (invoices.length > 0) dots.push({ color: "bg-info", count: invoices.length })
    if (customerDue.length > 0) dots.push({ color: "bg-chart-5", count: customerDue.length })

    return dots
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {format(currentMonth, "MMMM yyyy")}
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-xs"
            onClick={() => setCurrentMonth(new Date())}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 text-center">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-1.5 text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px rounded-lg bg-border overflow-hidden">
        {weeks.flat().map((date, i) => {
          const dots = getEventDots(date)
          const isCurrentMonth = isSameMonth(date, currentMonth)
          const isSelected = selectedDate && isSameDay(date, selectedDate)
          const dayIsToday = isToday(date)

          return (
            <button
              key={i}
              onClick={() => onDateSelect?.(date)}
              className={cn(
                "relative flex flex-col items-center gap-0.5 bg-background p-1.5 transition-colors hover:bg-accent min-h-[3.5rem]",
                !isCurrentMonth && "opacity-40",
                isSelected && "bg-accent",
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-xs",
                  dayIsToday && "bg-primary text-primary-foreground font-semibold",
                )}
              >
                {format(date, "d")}
              </span>
              {dots.length > 0 && (
                <div className="flex gap-0.5">
                  {dots.slice(0, 4).map((dot, j) => (
                    <span
                      key={j}
                      className={cn("size-1.5 rounded-full", dot.color)}
                    />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-success" /> Completed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-warning" /> Pending
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-info" /> Invoice due
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-chart-5" /> Service due
        </span>
      </div>
    </div>
  )
}
