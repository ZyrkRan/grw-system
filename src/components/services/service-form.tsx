"use client"

import { useEffect, useState } from "react"
import {
  Loader2,
  Minus,
  Plus,
  X,
  Check,
  ChevronsUpDown,
  DollarSign,
  Clock,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { LucideIcon } from "@/components/ui/lucide-icon"
import { cn } from "@/lib/utils"

interface CustomerOption {
  id: number
  name: string
  lastService: {
    priceCharged: number
    serviceTypeId: number | null
  } | null
}

interface ServiceTypeOption {
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

export interface ServiceData {
  id?: number
  customerId: number
  serviceTypeId: number | null
  serviceDate: string
  priceCharged: number | string
  notes: string | null
  status: string
  paymentStatus: string
  paymentDate: string | null
  customer?: { id: number; name: string }
  serviceType?: { id: number; name: string; icon: string | null } | null
  timeEntries?: TimeEntryData[]
}

interface ServiceFormProps {
  service?: ServiceData
  defaultStatus?: "PENDING" | "COMPLETE"
  onSuccess: () => void
  onClose?: () => void
  resetKey?: number | string
}

function toLocalIsoDate(value: string | null | undefined | Date): string {
  if (!value) return ""
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return ""
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function todayIso(): string {
  return toLocalIsoDate(new Date())
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0m"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`
}

export function ServiceForm({
  service,
  defaultStatus = "PENDING",
  onSuccess,
  onClose,
  resetKey,
}: ServiceFormProps) {
  const isEditing = !!service?.id

  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeOption[]>([])
  const [isLoadingData, setIsLoadingData] = useState(true)

  const [customerComboOpen, setCustomerComboOpen] = useState(false)
  const [customerId, setCustomerId] = useState<string>("")
  const [serviceTypeId, setServiceTypeId] = useState<string>("")
  const [serviceDate, setServiceDate] = useState<string>(todayIso())
  const [priceCharged, setPriceCharged] = useState("")
  const [notes, setNotes] = useState("")
  const [status, setStatus] = useState<string>(defaultStatus)
  const [paid, setPaid] = useState(false)
  const [paymentDate, setPaymentDate] = useState("")
  const [timeEntries, setTimeEntries] = useState<TimeEntryInput[]>([])

  const [isSubmitting, setIsSubmitting] = useState(false)

  const selectedCustomer =
    customers.find((c) => String(c.id) === customerId) ?? null

  // Fetch customers + service types once on mount
  useEffect(() => {
    setIsLoadingData(true)
    Promise.all([
      fetch("/api/customers").then((r) => r.json()),
      fetch("/api/service-types").then((r) => r.json()),
    ])
      .then(([custResult, stResult]) => {
        if (custResult.success && Array.isArray(custResult.data)) {
          setCustomers(
            custResult.data.map(
              (c: {
                id: number
                name: string
                lastService: CustomerOption["lastService"]
              }) => ({
                id: c.id,
                name: c.name,
                lastService: c.lastService ?? null,
              })
            )
          )
        }
        if (stResult.success && Array.isArray(stResult.data)) {
          setServiceTypes(stResult.data)
        }
      })
      .catch(() => {
        /* non-critical */
      })
      .finally(() => setIsLoadingData(false))
  }, [])

  // Hydrate / reset when `service` or `resetKey` changes
  useEffect(() => {
    if (service) {
      setCustomerId(String(service.customerId))
      setServiceTypeId(
        service.serviceTypeId ? String(service.serviceTypeId) : ""
      )
      setServiceDate(toLocalIsoDate(service.serviceDate) || todayIso())
      setPriceCharged(
        service.priceCharged !== "" &&
          service.priceCharged !== null &&
          service.priceCharged !== undefined
          ? String(Number(service.priceCharged))
          : ""
      )
      setNotes(service.notes ?? "")
      setStatus(service.status || defaultStatus)
      setPaid(service.paymentStatus === "PAID")
      setPaymentDate(toLocalIsoDate(service.paymentDate))
      setTimeEntries(
        service.timeEntries?.map((te) => ({
          date: toLocalIsoDate(te.date),
          durationMinutes: String(te.durationMinutes),
          description: te.description ?? "",
        })) ?? []
      )
    } else {
      setCustomerId("")
      setServiceTypeId("")
      setServiceDate(todayIso())
      setPriceCharged("")
      setNotes("")
      setStatus(defaultStatus)
      setPaid(false)
      setPaymentDate("")
      setTimeEntries([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, resetKey])

  function handlePickCustomer(c: CustomerOption) {
    setCustomerId(String(c.id))
    setCustomerComboOpen(false)
    if (c.lastService) {
      if (!priceCharged && c.lastService.priceCharged != null) {
        setPriceCharged(String(c.lastService.priceCharged))
      }
      if (!serviceTypeId && c.lastService.serviceTypeId != null) {
        setServiceTypeId(String(c.lastService.serviceTypeId))
      }
    }
  }

  function handlePaidChange(next: boolean) {
    setPaid(next)
    if (next && !paymentDate && serviceDate) {
      setPaymentDate(serviceDate)
    }
  }

  function addTimeEntry() {
    setTimeEntries((prev) => [
      ...prev,
      {
        date: serviceDate || todayIso(),
        durationMinutes: "30",
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
      prev.map((entry, i) =>
        i === index ? { ...entry, [field]: value } : entry
      )
    )
  }

  function incrementDuration(index: number) {
    const current = parseInt(timeEntries[index].durationMinutes, 10) || 0
    updateTimeEntry(index, "durationMinutes", String(current + 30))
  }

  function decrementDuration(index: number) {
    const current = parseInt(timeEntries[index].durationMinutes, 10) || 0
    if (current > 30) {
      updateTimeEntry(index, "durationMinutes", String(current - 30))
    }
  }

  const totalDuration = timeEntries.reduce(
    (sum, entry) => sum + (parseInt(entry.durationMinutes, 10) || 0),
    0
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!customerId) {
      toast.error("Pick a customer")
      return
    }
    if (!serviceDate) {
      toast.error("Pick a service date")
      return
    }
    const price = parseFloat(priceCharged)
    if (priceCharged === "" || Number.isNaN(price) || price < 0) {
      toast.error("Enter a valid revenue amount")
      return
    }

    setIsSubmitting(true)
    try {
      const isoServiceDate = new Date(serviceDate + "T00:00:00").toISOString()
      const payload = {
        customerId: parseInt(customerId, 10),
        serviceTypeId: serviceTypeId ? parseInt(serviceTypeId, 10) : null,
        serviceDate: isoServiceDate,
        priceCharged: price,
        notes: notes.trim() || null,
        status,
        paymentStatus: paid ? "PAID" : "UNPAID",
        paymentDate:
          paid && paymentDate
            ? new Date(paymentDate + "T00:00:00").toISOString()
            : null,
        timeEntries: timeEntries
          .filter(
            (te) =>
              te.durationMinutes && parseInt(te.durationMinutes, 10) > 0
          )
          .map((te) => ({
            date: te.date
              ? new Date(te.date + "T00:00:00").toISOString()
              : isoServiceDate,
            durationMinutes: parseInt(te.durationMinutes, 10),
            description: te.description.trim() || null,
          })),
      }

      const url = isEditing ? `/api/services/${service!.id}` : "/api/services"
      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const result = await res.json()

      if (!res.ok || !result.success) {
        toast.error(result.error || "Something went wrong")
        return
      }

      const customerName =
        selectedCustomer?.name ?? service?.customer?.name ?? ""
      const label =
        serviceTypes.find((t) => String(t.id) === serviceTypeId)?.name ??
        "service"
      toast.success(
        isEditing
          ? "Service updated"
          : `Logged ${label}${customerName ? ` for ${customerName}` : ""}`
      )
      onSuccess()
      onClose?.()
    } catch {
      toast.error("Failed to save service")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoadingData) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Customer + Service Type */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 min-w-0">
          <Label className="text-xs">Customer *</Label>
          <Popover
            open={customerComboOpen}
            onOpenChange={setCustomerComboOpen}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={customerComboOpen}
                className="w-full justify-between font-normal"
              >
                {selectedCustomer ? (
                  <span className="truncate">{selectedCustomer.name}</span>
                ) : (
                  <span className="text-muted-foreground">
                    Select customer…
                  </span>
                )}
                <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[var(--radix-popover-trigger-width)] p-0"
              align="start"
            >
              <Command>
                <CommandInput placeholder="Search customers…" />
                <CommandList className="max-h-64">
                  <CommandEmpty>No customers found.</CommandEmpty>
                  {customers.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={c.name}
                      onSelect={() => handlePickCustomer(c)}
                    >
                      <Check
                        className={cn(
                          "mr-2 size-4",
                          String(c.id) === customerId
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                      <span className="truncate">{c.name}</span>
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="sf-service-type" className="text-xs">
            Service Type
          </Label>
          <Select
            value={serviceTypeId}
            onValueChange={setServiceTypeId}
          >
            <SelectTrigger id="sf-service-type" className="w-full">
              <SelectValue placeholder="Optional" />
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

      {/* Date — full row on its own */}
      <div className="space-y-1.5 min-w-0 sm:max-w-xs">
        <Label className="text-xs">Service Date *</Label>
        <DatePicker
          date={
            serviceDate ? new Date(serviceDate + "T00:00:00") : undefined
          }
          onSelect={(d) => setServiceDate(d ? toLocalIsoDate(d) : "")}
        />
      </div>

      {/* Revenue + Status */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="sf-price" className="text-xs">
            Revenue *
          </Label>
          <div className="relative">
            <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              id="sf-price"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={priceCharged}
              onChange={(e) => setPriceCharged(e.target.value)}
              placeholder="0.00"
              className="pl-7"
              required
            />
          </div>
        </div>

        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="sf-status" className="text-xs">
            Status
          </Label>
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

      {/* Paid switch */}
      <div className="flex items-center justify-between rounded-md border px-3 py-2">
        <div className="min-w-0">
          <Label htmlFor="sf-paid" className="text-sm cursor-pointer">
            Paid
          </Label>
          <p className="text-xs text-muted-foreground">
            {paid ? "Marked as paid" : "Awaiting payment"}
          </p>
        </div>
        <Switch
          id="sf-paid"
          checked={paid}
          onCheckedChange={handlePaidChange}
        />
      </div>

      {/* Payment Date — only when paid */}
      {paid && (
        <div className="space-y-1.5 min-w-0 sm:max-w-xs">
          <Label className="text-xs">Payment Date</Label>
          <DatePicker
            date={
              paymentDate
                ? new Date(paymentDate + "T00:00:00")
                : undefined
            }
            onSelect={(d) => setPaymentDate(d ? toLocalIsoDate(d) : "")}
          />
        </div>
      )}

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="sf-notes" className="text-xs">
          Notes
        </Label>
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
          <Label className="text-sm font-medium flex items-center gap-1.5">
            <Clock className="size-3.5 text-muted-foreground" />
            Time Entries
          </Label>
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
            None. Click &quot;Add Entry&quot; to track time.
          </p>
        ) : (
          <div className="space-y-2">
            {timeEntries.map((entry, index) => (
              <div
                key={index}
                className="rounded-md border p-2 flex flex-col gap-2 sm:flex-row sm:items-center"
              >
                <div className="flex items-center gap-2 sm:contents">
                  <DatePicker
                    date={
                      entry.date
                        ? new Date(entry.date + "T00:00:00")
                        : undefined
                    }
                    onSelect={(d) =>
                      updateTimeEntry(
                        index,
                        "date",
                        d ? toLocalIsoDate(d) : ""
                      )
                    }
                    className="flex-1 sm:flex-none sm:w-36"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => decrementDuration(index)}
                      disabled={
                        (parseInt(entry.durationMinutes, 10) || 0) <= 30
                      }
                    >
                      <Minus className="size-3.5" />
                    </Button>
                    <span className="w-16 text-center text-sm font-medium tabular-nums">
                      {formatDuration(
                        parseInt(entry.durationMinutes, 10) || 0
                      )}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => incrementDuration(index)}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 sm:hidden ml-auto"
                    onClick={() => removeTimeEntry(index)}
                    aria-label="Remove entry"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                <Input
                  value={entry.description}
                  onChange={(e) =>
                    updateTimeEntry(index, "description", e.target.value)
                  }
                  placeholder="Description"
                  className="w-full sm:flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 hidden sm:inline-flex shrink-0"
                  onClick={() => removeTimeEntry(index)}
                  aria-label="Remove entry"
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            <div className="text-right text-xs text-muted-foreground">
              Total: {formatDuration(totalDuration)}
            </div>
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        {onClose && (
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full sm:w-auto"
        >
          {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
          {isEditing ? "Save Changes" : "Add Service"}
        </Button>
      </div>
    </form>
  )
}
