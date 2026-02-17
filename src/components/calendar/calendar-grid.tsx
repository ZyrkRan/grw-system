"use client"

import { useCallback } from "react"
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  format,
  addDays,
  subDays,
} from "date-fns"
import { CalendarDayCell } from "./calendar-day-cell"
import type { CalendarDayMap, VisibleLayers } from "./calendar-view"

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

interface CalendarGridProps {
  currentMonth: Date
  dayMap: CalendarDayMap
  selectedDate: Date | null
  onSelectDate: (date: Date) => void
  visibleLayers: VisibleLayers
}

export function CalendarGrid({
  currentMonth,
  dayMap,
  selectedDate,
  onSelectDate,
  visibleLayers,
}: CalendarGridProps) {
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, currentDate: Date) => {
      let nextDate: Date | null = null

      switch (e.key) {
        case "ArrowRight":
          nextDate = addDays(currentDate, 1)
          break
        case "ArrowLeft":
          nextDate = subDays(currentDate, 1)
          break
        case "ArrowDown":
          nextDate = addDays(currentDate, 7)
          break
        case "ArrowUp":
          nextDate = subDays(currentDate, 7)
          break
        default:
          return
      }

      e.preventDefault()

      // Focus the next cell if it exists in the grid
      if (nextDate >= gridStart && nextDate <= gridEnd) {
        const nextKey = format(nextDate, "yyyy-MM-dd")
        const nextEl = document.querySelector<HTMLButtonElement>(
          `[data-date="${nextKey}"]`
        )
        nextEl?.focus()
      }
    },
    [gridStart, gridEnd]
  )

  return (
    <div className="flex flex-col" role="grid" aria-label="Calendar">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b pb-2" role="row">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            role="columnheader"
            className="text-center text-xs font-medium text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7" role="rowgroup">
        {days.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd")
          return (
            <CalendarDayCell
              key={dateKey}
              date={day}
              dateKey={dateKey}
              dayData={dayMap[dateKey]}
              isToday={isToday(day)}
              isOutsideMonth={!isSameMonth(day, currentMonth)}
              isSelected={selectedDate ? isSameDay(day, selectedDate) : false}
              onClick={onSelectDate}
              onKeyDown={handleKeyDown}
              visibleLayers={visibleLayers}
            />
          )
        })}
      </div>
    </div>
  )
}
