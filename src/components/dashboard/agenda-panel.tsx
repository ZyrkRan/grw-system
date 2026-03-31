"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  Wrench,
  FileText,
  UserCheck,
  Calendar,
} from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  format,
  isSameDay,
  isToday,
  isTomorrow,
  addDays,
  isBefore,
  startOfDay,
} from "date-fns"
import type { CalendarEvent } from "./calendar-view"

interface AgendaPanelProps {
  selectedDate?: Date
  onEventClick?: (event: CalendarEvent) => void
}

export function AgendaPanel({ selectedDate, onEventClick }: AgendaPanelProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchUpcoming = useCallback(async () => {
    setIsLoading(true)
    try {
      const now = new Date()
      const month = now.getMonth() + 1
      const year = now.getFullYear()
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
      console.error("Failed to fetch agenda:", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUpcoming()
  }, [fetchUpcoming])

  // Filter and group events
  const displayEvents = useMemo(() => {
    const today = startOfDay(new Date())
    const twoWeeksOut = addDays(today, 14)

    let filtered: CalendarEvent[]
    if (selectedDate) {
      // Show events for the selected date
      filtered = events.filter((e) => isSameDay(new Date(e.date), selectedDate))
    } else {
      // Show upcoming events for the next 14 days
      filtered = events.filter((e) => {
        const eventDate = new Date(e.date)
        return eventDate >= today && eventDate <= twoWeeksOut
      })
    }

    // Sort by date
    filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // Group by date
    const groups: { date: Date; label: string; events: CalendarEvent[] }[] = []
    for (const event of filtered) {
      const eventDate = startOfDay(new Date(event.date))
      const existing = groups.find((g) => isSameDay(g.date, eventDate))
      if (existing) {
        existing.events.push(event)
      } else {
        let label = format(eventDate, "EEEE, MMM d")
        if (isToday(eventDate)) label = "Today"
        else if (isTomorrow(eventDate)) label = "Tomorrow"

        groups.push({ date: eventDate, label, events: [event] })
      }
    }

    return groups
  }, [events, selectedDate])

  const eventIcon = (type: string) => {
    switch (type) {
      case "service": return <Wrench className="size-3.5" />
      case "invoice": return <FileText className="size-3.5" />
      case "customer-due": return <UserCheck className="size-3.5" />
      default: return <Calendar className="size-3.5" />
    }
  }

  const eventColor = (event: CalendarEvent) => {
    if (event.type === "service") {
      return event.status === "COMPLETE" ? "text-success" : "text-warning"
    }
    if (event.type === "invoice") {
      const isOverdue = isBefore(new Date(event.date), startOfDay(new Date()))
      return isOverdue ? "text-destructive" : "text-info"
    }
    return "text-chart-5"
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Upcoming
        </h3>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-12 w-full" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        {selectedDate ? format(selectedDate, "MMM d") : "Upcoming"}
      </h3>

      {displayEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Calendar className="size-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            {selectedDate ? "Nothing scheduled" : "No upcoming events"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayEvents.map((group) => (
            <div key={group.label} className="space-y-1.5">
              <p className={cn(
                "text-xs font-medium",
                isToday(group.date) ? "text-primary" : "text-muted-foreground"
              )}>
                {group.label}
              </p>
              {group.events.map((event) => (
                <button
                  key={`${event.type}-${event.id}`}
                  onClick={() => onEventClick?.(event)}
                  className="flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors hover:bg-accent"
                >
                  <span className={cn("mt-0.5", eventColor(event))}>
                    {eventIcon(event.type)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{event.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {event.customerName}
                    </p>
                  </div>
                  {event.amount && (
                    <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                      ${event.amount.toFixed(2)}
                    </span>
                  )}
                  {event.status && (
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {event.status}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
