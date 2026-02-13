"use client"

import { useState, useEffect } from "react"
import { Loader2, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { LucideIcon } from "@/components/ui/lucide-icon"

interface Customer {
  id: number
  name: string
}

interface ServiceType {
  id: number
  name: string
  icon: string | null
}

interface TimeEntryInput {
  date: string
  durationMinutes: string
  description: string
}

interface TimeEntryData {
  id?: number
  date: string
  durationMinutes: number
  description: string | null
}

interface ServiceData {
  id?: number
  customerId: number
  serviceTypeId: number | null
  serviceName: string
  serviceDate: string
  priceCharged: number | string
  notes: string | null
  status: string
  paymentStatus: string
  amountPaid: number | string | null
  paymentDate: string | null
  customer?: { id: number; name: string }
  serviceType?: { id: number; name: string; icon: string | null } | null
  timeEntries?: TimeEntryData[]
}

interface ServiceFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  service?: ServiceData
  onSuccess: () => void
}

function toDateInputValue(dateString: string | null | undefined): string {
  if (!dateString) return ""
  const d = new Date(dateString)
  if (isNaN(d.getTime())) return ""
  return d.toISOString().split("T")[0]
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0m"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`
}

export function ServiceFormDialog({
  open,
  onOpenChange,
  service,
  onSuccess,
}: ServiceFormDialogProps) {
  const isEditing = !!service?.id

  const [customers, setCustomers] = useState<Customer[]>([])
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([])
  const [isLoadingData, setIsLoadingData] = useState(true)

  const [customerId, setCustomerId] = useState("")
  const [serviceTypeId, setServiceTypeId] = useState("")
  const [serviceName, setServiceName] = useState("")
  const [serviceDate, setServiceDate] = useState("")
  const [priceCharged, setPriceCharged] = useState("")
  const [notes, setNotes] = useState("")
  const [status, setStatus] = useState("PENDING")
  const [paymentStatus, setPaymentStatus] = useState("UNPAID")
  const [amountPaid, setAmountPaid] = useState("")
  const [paymentDate, setPaymentDate] = useState("")
  const [timeEntries, setTimeEntries] = useState<TimeEntryInput[]>([])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  // Fetch customers and service types when dialog opens
  useEffect(() => {
    if (!open) return
    setIsLoadingData(true)

    Promise.all([
      fetch("/api/customers").then((r) => r.json()),
      fetch("/api/service-types").then((r) => r.json()),
    ])
      .then(([custResult, stResult]) => {
        if (custResult.success) setCustomers(custResult.data)
        if (stResult.success) setServiceTypes(stResult.data)
      })
      .catch((err) => console.error("Failed to load form data:", err))
      .finally(() => setIsLoadingData(false))
  }, [open])

  // Reset form when dialog opens
  useEffect(() => {
    if (!open) return

    if (service) {
      setCustomerId(String(service.customerId))
      setServiceTypeId(service.serviceTypeId ? String(service.serviceTypeId) : "")
      setServiceName(service.serviceName)
      setServiceDate(toDateInputValue(service.serviceDate))
      setPriceCharged(String(Number(service.priceCharged)))
      setNotes(service.notes ?? "")
      setStatus(service.status)
      setPaymentStatus(service.paymentStatus)
      setAmountPaid(
        service.amountPaid ? String(Number(service.amountPaid)) : ""
      )
      setPaymentDate(toDateInputValue(service.paymentDate))
      setTimeEntries(
        service.timeEntries?.map((te) => ({
          date: toDateInputValue(te.date),
          durationMinutes: String(te.durationMinutes),
          description: te.description ?? "",
        })) ?? []
      )
    } else {
      setCustomerId("")
      setServiceTypeId("")
      setServiceName("")
      setServiceDate(new Date().toISOString().split("T")[0])
      setPriceCharged("")
      setNotes("")
      setStatus("PENDING")
      setPaymentStatus("UNPAID")
      setAmountPaid("")
      setPaymentDate("")
      setTimeEntries([])
    }

    setError("")
  }, [open, service])

  function handleServiceTypeChange(value: string) {
    setServiceTypeId(value)
    if (value) {
      const st = serviceTypes.find((t) => String(t.id) === value)
      if (st && !serviceName) {
        setServiceName(st.name)
      }
    }
  }

  function addTimeEntry() {
    setTimeEntries((prev) => [
      ...prev,
      {
        date: serviceDate || new Date().toISOString().split("T")[0],
        durationMinutes: "",
        description: "",
      },
    ])
  }

  function removeTimeEntry(index: number) {
    setTimeEntries((prev) => prev.filter((_, i) => i !== index))
  }

  function updateTimeEntry(
    index: number,
    field: keyof TimeEntryInput,
    value: string
  ) {
    setTimeEntries((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry))
    )
  }

  const totalDuration = timeEntries.reduce(
    (sum, entry) => sum + (parseInt(entry.durationMinutes, 10) || 0),
    0
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!customerId) {
      setError("Customer is required.")
      return
    }
    if (!serviceName.trim()) {
      setError("Service name is required.")
      return
    }
    if (!serviceDate) {
      setError("Service date is required.")
      return
    }
    if (!priceCharged || Number(priceCharged) < 0) {
      setError("Price charged is required and must be non-negative.")
      return
    }

    setIsSubmitting(true)

    try {
      const payload = {
        customerId: parseInt(customerId, 10),
        serviceTypeId: serviceTypeId ? parseInt(serviceTypeId, 10) : null,
        serviceName: serviceName.trim(),
        serviceDate: new Date(serviceDate).toISOString(),
        priceCharged: parseFloat(priceCharged),
        notes: notes.trim() || null,
        status,
        paymentStatus,
        amountPaid: amountPaid ? parseFloat(amountPaid) : null,
        paymentDate: paymentDate
          ? new Date(paymentDate).toISOString()
          : null,
        timeEntries: timeEntries
          .filter((te) => te.durationMinutes)
          .map((te) => ({
            date: new Date(te.date).toISOString(),
            durationMinutes: parseInt(te.durationMinutes, 10),
            description: te.description.trim() || null,
          })),
      }

      const url = isEditing
        ? `/api/services/${service.id}`
        : "/api/services"

      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const result = await res.json()

      if (!result.success) {
        setError(result.error || "Something went wrong.")
        return
      }

      onOpenChange(false)
      onSuccess()
    } catch {
      setError("Failed to save service. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Service" : "Add Service"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the service details below."
              : "Fill in the details to log a new service."}
          </DialogDescription>
        </DialogHeader>

        {isLoadingData ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="max-h-[calc(90vh-10rem)] pr-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sf-customer">Customer *</Label>
                  <Select value={customerId} onValueChange={setCustomerId}>
                    <SelectTrigger id="sf-customer" className="w-full">
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sf-service-type">Service Type</Label>
                  <Select
                    value={serviceTypeId}
                    onValueChange={handleServiceTypeChange}
                  >
                    <SelectTrigger id="sf-service-type" className="w-full">
                      <SelectValue placeholder="Select type (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {serviceTypes.map((st) => (
                        <SelectItem key={st.id} value={String(st.id)}>
                          <span className="flex items-center gap-2">
                            {st.icon && (
                              <LucideIcon
                                name={st.icon}
                                className="size-3.5 text-muted-foreground"
                              />
                            )}
                            {st.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sf-name">Service Name *</Label>
                  <Input
                    id="sf-name"
                    value={serviceName}
                    onChange={(e) => setServiceName(e.target.value)}
                    placeholder="e.g. Lawn Mowing"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Service Date *</Label>
                  <DatePicker
                    date={serviceDate ? new Date(serviceDate + "T00:00:00") : undefined}
                    onSelect={(d) => setServiceDate(d ? d.toISOString().split("T")[0] : "")}
                    placeholder="Pick a date"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sf-price">Price Charged *</Label>
                  <Input
                    id="sf-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={priceCharged}
                    onChange={(e) => setPriceCharged(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sf-status">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger id="sf-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="COMPLETE">Complete</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sf-payment-status">Payment Status</Label>
                  <Select
                    value={paymentStatus}
                    onValueChange={setPaymentStatus}
                  >
                    <SelectTrigger id="sf-payment-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UNPAID">Unpaid</SelectItem>
                      <SelectItem value="PAID">Paid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sf-amount-paid">Amount Paid</Label>
                  <Input
                    id="sf-amount-paid"
                    type="number"
                    step="0.01"
                    min="0"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>

              {paymentStatus === "PAID" && (
                <div className="space-y-2">
                  <Label>Payment Date</Label>
                  <DatePicker
                    date={paymentDate ? new Date(paymentDate + "T00:00:00") : undefined}
                    onSelect={(d) => setPaymentDate(d ? d.toISOString().split("T")[0] : "")}
                    placeholder="Pick a date"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="sf-notes">Notes</Label>
                <Textarea
                  id="sf-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes about this service"
                  rows={3}
                />
              </div>

              {/* Time Entries */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Time Entries</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addTimeEntry}
                  >
                    <Plus className="mr-1 size-3.5" />
                    Add Entry
                  </Button>
                </div>

                {timeEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No time entries. Click &quot;Add Entry&quot; to track time.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {timeEntries.map((entry, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 rounded-md border p-2"
                      >
                        <DatePicker
                          date={entry.date ? new Date(entry.date + "T00:00:00") : undefined}
                          onSelect={(d) =>
                            updateTimeEntry(index, "date", d ? d.toISOString().split("T")[0] : "")
                          }
                          className="w-36"
                        />
                        <Input
                          type="number"
                          min="1"
                          value={entry.durationMinutes}
                          onChange={(e) =>
                            updateTimeEntry(
                              index,
                              "durationMinutes",
                              e.target.value
                            )
                          }
                          placeholder="Minutes"
                          className="w-24"
                        />
                        <Input
                          value={entry.description}
                          onChange={(e) =>
                            updateTimeEntry(
                              index,
                              "description",
                              e.target.value
                            )
                          }
                          placeholder="Description"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0"
                          onClick={() => removeTimeEntry(index)}
                        >
                          <X className="size-4" />
                          <span className="sr-only">Remove entry</span>
                        </Button>
                      </div>
                    ))}
                    <div className="text-right text-sm text-muted-foreground">
                      Total: {formatDuration(totalDuration)}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}
                  {isEditing ? "Save Changes" : "Add Service"}
                </Button>
              </div>
            </form>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
