"use client"

import Link from "next/link"
import { format } from "date-fns"
import { X, Wrench, Users, Route, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { DueStatusBadge } from "@/components/ui/due-status-badge"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import type { DueStatus } from "@/lib/due-date"
import type { CalendarDayData } from "./calendar-view"

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

function formatCurrency(value: number | string | null | undefined): string {
  const num = typeof value === "string" ? parseFloat(value) : (value ?? 0)
  return currencyFormatter.format(num)
}

function intervalLabel(days: number): string {
  if (days === 14) return "2 Weeks"
  if (days === 21) return "3 Weeks"
  if (days === 28) return "Monthly"
  return `${days} days`
}

interface CalendarDayPanelProps {
  date: Date
  dayData: CalendarDayData | undefined
  onClose: () => void
}

// Desktop inline panel
function DayPanelContent({
  date,
  dayData,
  onClose,
}: CalendarDayPanelProps) {
  const dueCustomers = dayData?.dueCustomers ?? []
  const services = dayData?.services ?? []
  const routes = dayData?.routes ?? []
  const isEmpty = dueCustomers.length === 0 && services.length === 0 && routes.length === 0

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between border-b p-4">
        <div>
          <h3 className="text-base font-semibold">
            {format(date, "EEEE, MMMM d, yyyy")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {dueCustomers.length} due &middot; {services.length} services &middot; {routes.length} routes
          </p>
        </div>
        <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={onClose} aria-label="Close panel">
          <X className="size-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 px-4 pb-4">
        {isEmpty && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing scheduled for this day
          </p>
        )}

        {/* Due Customers Section */}
        {dueCustomers.length > 0 && (
          <section className="py-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Users className="size-3.5" />
              <span>Customers Due ({dueCustomers.length})</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {dueCustomers.map((customer) => (
                <Link
                  key={customer.id}
                  href={`/customers/${customer.id}`}
                  className="group flex items-center justify-between rounded-md border px-3 py-2 transition-colors hover:bg-accent"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{customer.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {intervalLabel(customer.serviceInterval)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DueStatusBadge
                      daysUntilDue={customer.daysUntilDue}
                      dueStatus={customer.dueStatus as DueStatus}
                    />
                    <ExternalLink className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {dueCustomers.length > 0 && services.length > 0 && <Separator />}

        {/* Services Section */}
        {services.length > 0 && (
          <section className="py-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Wrench className="size-3.5" />
              <span>Services ({services.length})</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {services.map((service) => (
                <Link
                  key={service.id}
                  href={`/customers/${service.customer.id}`}
                  className="group flex items-center justify-between rounded-md border px-3 py-2 transition-colors hover:bg-accent"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">
                      {service.customer.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {service.serviceName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        service.status === "COMPLETE" ? "outline" : "secondary"
                      }
                      className={cn(
                        "text-[10px]",
                        service.status === "COMPLETE" &&
                          "border-green-500 text-green-600",
                        service.status === "PENDING" &&
                          "border-amber-500 text-amber-600"
                      )}
                    >
                      {service.status === "COMPLETE" ? "Done" : "Pending"}
                    </Badge>
                    <span className="text-xs font-medium">
                      {formatCurrency(service.priceCharged)}
                    </span>
                    <ExternalLink className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {(dueCustomers.length > 0 || services.length > 0) && routes.length > 0 && <Separator />}

        {/* Routes Section */}
        {routes.length > 0 && (
          <section className="py-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Route className="size-3.5" />
              <span>Routes ({routes.length})</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {routes.map((route) => (
                <Link
                  key={route.id}
                  href={`/routes/${route.id}`}
                  className="group flex items-center justify-between rounded-md border px-3 py-2 transition-colors hover:bg-accent"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="size-3 rounded-full"
                      style={{
                        backgroundColor:
                          route.color || "var(--color-muted-foreground)",
                      }}
                    />
                    <span className="text-sm font-medium">{route.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {route._count.customers} customers
                    </span>
                    <ExternalLink className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </ScrollArea>
    </>
  )
}

// Mobile: uses Sheet (bottom drawer)
export function CalendarDayPanelMobile({
  date,
  dayData,
  open,
  onClose,
}: CalendarDayPanelProps & { open: boolean }) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="h-[70vh]" showCloseButton={false}>
        <SheetHeader className="sr-only">
          <SheetTitle>{format(date, "EEEE, MMMM d, yyyy")}</SheetTitle>
          <SheetDescription>Day details</SheetDescription>
        </SheetHeader>
        <DayPanelContent date={date} dayData={dayData} onClose={onClose} />
      </SheetContent>
    </Sheet>
  )
}

// Desktop: inline card panel
export function CalendarDayPanelDesktop({
  date,
  dayData,
  onClose,
}: CalendarDayPanelProps) {
  return (
    <div className="flex w-[380px] shrink-0 flex-col rounded-lg border bg-card">
      <DayPanelContent date={date} dayData={dayData} onClose={onClose} />
    </div>
  )
}
