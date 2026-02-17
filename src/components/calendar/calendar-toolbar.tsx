"use client"

import { ChevronLeft, ChevronRight, Users, Wrench, Route } from "lucide-react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { VisibleLayers } from "./calendar-view"

interface CalendarToolbarProps {
  currentMonth: Date
  onMonthChange: (direction: "prev" | "next") => void
  onToday: () => void
  visibleLayers: VisibleLayers
  onToggleLayer: (layer: keyof VisibleLayers) => void
}

export function CalendarToolbar({
  currentMonth,
  onMonthChange,
  onToday,
  visibleLayers,
  onToggleLayer,
}: CalendarToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {/* Left: Month navigation */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => onMonthChange("prev")}
          aria-label="Previous month"
        >
          <ChevronLeft className="size-4" />
        </Button>

        <h2 className="min-w-[10rem] text-center text-lg font-semibold">
          {format(currentMonth, "MMMM yyyy")}
        </h2>

        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => onMonthChange("next")}
          aria-label="Next month"
        >
          <ChevronRight className="size-4" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="ml-1 text-xs"
          onClick={onToday}
        >
          Today
        </Button>
      </div>

      {/* Right: Layer toggles */}
      <div className="flex items-center gap-1" role="group" aria-label="Toggle calendar layers">
        <Button
          variant="outline"
          size="sm"
          aria-pressed={visibleLayers.dueCustomers}
          aria-label="Toggle due customers"
          className={cn(
            "gap-1.5 text-xs",
            visibleLayers.dueCustomers &&
              "border-primary bg-primary/10 text-primary"
          )}
          onClick={() => onToggleLayer("dueCustomers")}
        >
          <Users className="size-3.5" />
          <span className="hidden sm:inline">Due</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={visibleLayers.services}
          aria-label="Toggle services"
          className={cn(
            "gap-1.5 text-xs",
            visibleLayers.services &&
              "border-primary bg-primary/10 text-primary"
          )}
          onClick={() => onToggleLayer("services")}
        >
          <Wrench className="size-3.5" />
          <span className="hidden sm:inline">Services</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={visibleLayers.routes}
          aria-label="Toggle routes"
          className={cn(
            "gap-1.5 text-xs",
            visibleLayers.routes &&
              "border-primary bg-primary/10 text-primary"
          )}
          onClick={() => onToggleLayer("routes")}
        >
          <Route className="size-3.5" />
          <span className="hidden sm:inline">Routes</span>
        </Button>
      </div>
    </div>
  )
}
