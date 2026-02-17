"use client"

import { memo } from "react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import type { CalendarDayData, VisibleLayers } from "./calendar-view"

const MAX_VISIBLE = 2

interface CalendarDayCellProps {
  date: Date
  dateKey: string
  dayData: CalendarDayData | undefined
  isToday: boolean
  isOutsideMonth: boolean
  isSelected: boolean
  onClick: (date: Date) => void
  onKeyDown: (e: React.KeyboardEvent, date: Date) => void
  visibleLayers: VisibleLayers
}

export const CalendarDayCell = memo(function CalendarDayCell({
  date,
  dateKey,
  dayData,
  isToday,
  isOutsideMonth,
  isSelected,
  onClick,
  onKeyDown,
  visibleLayers,
}: CalendarDayCellProps) {
  const dayNum = date.getDate()

  const dueCustomers = dayData?.dueCustomers ?? []
  const services = dayData?.services ?? []
  const routes = dayData?.routes ?? []

  return (
    <button
      type="button"
      role="gridcell"
      data-date={dateKey}
      aria-label={format(date, "EEEE, MMMM d")}
      aria-selected={isSelected}
      tabIndex={isSelected || isToday ? 0 : -1}
      onClick={() => onClick(date)}
      onKeyDown={(e) => onKeyDown(e, date)}
      className={cn(
        "flex min-h-[5.5rem] flex-col gap-0.5 overflow-hidden rounded-md border p-1.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-[6.5rem] md:p-2",
        isOutsideMonth && "opacity-40",
        isSelected && "border-primary bg-accent/30",
        !isSelected && "border-transparent"
      )}
    >
      {/* Day number */}
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium md:size-7 md:text-sm",
          isToday && "bg-primary text-primary-foreground",
          !isToday && isOutsideMonth && "text-muted-foreground"
        )}
      >
        {dayNum}
      </span>

      {/* Indicators - name-based */}
      <div className="mt-auto flex min-w-0 flex-col gap-px">
        {/* Due customers - primary layer */}
        {visibleLayers.dueCustomers && dueCustomers.length > 0 && (
          <>
            {dueCustomers.slice(0, MAX_VISIBLE).map((customer) => (
              <div
                key={customer.id}
                className={cn(
                  "truncate rounded px-1 py-px text-[10px] font-medium leading-tight md:text-[11px]",
                  customer.dueStatus === "late" &&
                    "bg-red-500/15 text-red-600 dark:text-red-400",
                  (customer.dueStatus === "due-soon" || customer.dueStatus === "due-today") &&
                    "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                  customer.dueStatus === "on-track" &&
                    "bg-muted text-muted-foreground"
                )}
              >
                {customer.name}
              </div>
            ))}
            {dueCustomers.length > MAX_VISIBLE && (
              <span className="px-1 text-[9px] text-muted-foreground">
                +{dueCustomers.length - MAX_VISIBLE} more
              </span>
            )}
          </>
        )}

        {/* Services */}
        {visibleLayers.services && services.length > 0 && (
          <>
            {services.slice(0, MAX_VISIBLE).map((service) => (
              <div
                key={service.id}
                className={cn(
                  "truncate rounded px-1 py-px text-[10px] font-medium leading-tight md:text-[11px]",
                  service.status === "PENDING"
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : "bg-green-500/15 text-green-600 dark:text-green-400"
                )}
              >
                {service.customer.name}
              </div>
            ))}
            {services.length > MAX_VISIBLE && (
              <span className="px-1 text-[9px] text-muted-foreground">
                +{services.length - MAX_VISIBLE} more
              </span>
            )}
          </>
        )}

        {/* Routes */}
        {visibleLayers.routes && routes.length > 0 &&
          routes.slice(0, MAX_VISIBLE).map((route) => (
            <div
              key={route.id}
              className="flex items-center gap-1 truncate rounded px-1 py-px text-[10px] font-medium leading-tight text-muted-foreground md:text-[11px]"
            >
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: route.color || "var(--color-muted-foreground)",
                }}
              />
              <span className="truncate">{route.name}</span>
            </div>
          ))}
      </div>
    </button>
  )
})
