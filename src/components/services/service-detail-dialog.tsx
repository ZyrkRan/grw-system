"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LucideIcon } from "@/components/ui/lucide-icon"

interface TimeEntry {
  id?: number
  date: string
  durationMinutes: number
  description: string | null
}

interface ServiceDetailData {
  id: number
  serviceName: string
  serviceDate: string
  priceCharged: number | string
  notes: string | null
  status: string
  paymentStatus: string
  amountPaid: number | string | null
  paymentDate: string | null
  customer: { id: number; name: string }
  serviceType: { id: number; name: string; icon: string | null } | null
  timeEntries: TimeEntry[]
}

interface ServiceDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  service: ServiceDetailData | null
}

function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "$0.00"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value))
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString()
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`
}

export function ServiceDetailDialog({
  open,
  onOpenChange,
  service,
}: ServiceDetailDialogProps) {
  if (!service) return null

  const totalDuration = service.timeEntries.reduce(
    (sum, entry) => sum + entry.durationMinutes,
    0
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {service.serviceType?.icon && (
              <LucideIcon
                name={service.serviceType.icon}
                className="size-4 shrink-0 text-muted-foreground"
              />
            )}
            {service.serviceName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div className="text-muted-foreground">Customer</div>
            <div className="font-medium">{service.customer.name}</div>

            <div className="text-muted-foreground">Service Type</div>
            <div className="font-medium">
              {service.serviceType?.name || (
                <span className="text-muted-foreground">--</span>
              )}
            </div>

            <div className="text-muted-foreground">Date</div>
            <div className="font-medium">
              {formatDate(service.serviceDate)}
            </div>

            <div className="text-muted-foreground">Status</div>
            <div>
              <Badge
                variant={
                  service.status === "COMPLETE" ? "default" : "outline"
                }
                className={
                  service.status === "COMPLETE"
                    ? "bg-green-600 text-white"
                    : "border-amber-500 text-amber-600"
                }
              >
                {service.status}
              </Badge>
            </div>

            <div className="text-muted-foreground">Payment</div>
            <div>
              <Badge
                variant={
                  service.paymentStatus === "PAID"
                    ? "default"
                    : "destructive"
                }
                className={
                  service.paymentStatus === "PAID"
                    ? "bg-green-600 text-white"
                    : ""
                }
              >
                {service.paymentStatus}
              </Badge>
            </div>

            <div className="text-muted-foreground">Price Charged</div>
            <div className="font-medium">
              {formatCurrency(service.priceCharged)}
            </div>

            <div className="text-muted-foreground">Amount Paid</div>
            <div className="font-medium">
              {formatCurrency(service.amountPaid)}
            </div>

            {service.paymentDate && (
              <>
                <div className="text-muted-foreground">Payment Date</div>
                <div className="font-medium">
                  {formatDate(service.paymentDate)}
                </div>
              </>
            )}
          </div>

          {service.notes && (
            <>
              <Separator />
              <div>
                <div className="mb-1 text-sm font-medium">Notes</div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {service.notes}
                </p>
              </div>
            </>
          )}

          {service.timeEntries.length > 0 && (
            <>
              <Separator />
              <div>
                <div className="mb-2 text-sm font-medium">Time Entries</div>
                <div className="space-y-2">
                  {service.timeEntries.map((entry, index) => (
                    <div
                      key={entry.id ?? index}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">
                          {formatDate(entry.date)}
                        </span>
                        <span className="font-medium">
                          {formatDuration(entry.durationMinutes)}
                        </span>
                      </div>
                      {entry.description && (
                        <span className="text-muted-foreground truncate ml-2 max-w-[200px]">
                          {entry.description}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-right text-sm font-medium">
                  Total: {formatDuration(totalDuration)}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
