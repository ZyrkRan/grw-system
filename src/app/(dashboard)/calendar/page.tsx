"use client"

import { CalendarView } from "@/components/calendar/calendar-view"

export default function CalendarPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
      <CalendarView />
    </div>
  )
}
