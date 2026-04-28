"use client"

import { useEffect, useRef, useState } from "react"
import {
  Loader2,
  Minus,
  Plus,
  Check,
  ChevronDown,
  DollarSign,
  Clock,
  Calendar as CalendarIcon,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { Calendar } from "@/components/ui/calendar"
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { LucideIcon } from "@/components/ui/lucide-icon"
import { cn } from "@/lib/utils"

interface CustomerOption {
  id: number
  name: string
  serviceInterval: number | null
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
  paymentMethod: string | null
  paymentDate: string | null
  customer?: { id: number; name: string }
  serviceType?: { id: number; name: string; icon: string | null } | null
  timeEntries?: TimeEntryData[]
}

const PAYMENT_METHODS = [
  { value: "ATH", label: "ATH Móvil" },
  { value: "PAYPAL", label: "PayPal" },
  { value: "CASH", label: "Cash" },
  { value: "OTHER", label: "Other" },
] as const

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

function dayDelta(isoDate: string): number {
  if (!isoDate) return NaN
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(isoDate + "T00:00:00")
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

function shortDateLabel(isoDate: string): string {
  if (!isoDate) return "Pick a date"
  const delta = dayDelta(isoDate)
  if (delta === 0) return "Today"
  if (delta === -1) return "Yesterday"
  if (delta === 1) return "Tomorrow"
  const d = new Date(isoDate + "T00:00:00")
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00")
  d.setDate(d.getDate() + days)
  return toLocalIsoDate(d)
}

export function ServiceForm({
  service,
  defaultStatus = "COMPLETE",
  onSuccess,
  onClose,
  resetKey,
}: ServiceFormProps) {
  const isEditing = !!service?.id

  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeOption[]>([])
  const [isLoadingData, setIsLoadingData] = useState(true)

  const customerInputRef = useRef<HTMLInputElement>(null)
  const [customerComboOpen, setCustomerComboOpen] = useState(false)
  const [customerSearch, setCustomerSearch] = useState("")
  const [datePopoverOpen, setDatePopoverOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(isEditing)
  const [customerId, setCustomerId] = useState<string>("")
  const [serviceTypeId, setServiceTypeId] = useState<string>("")
  const [serviceDate, setServiceDate] = useState<string>(todayIso())
  const [priceCharged, setPriceCharged] = useState("")
  const [notes, setNotes] = useState("")
  const [status, setStatus] = useState<string>(defaultStatus)
  const [paid, setPaid] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<string>("")
  const [paymentDate, setPaymentDate] = useState("")
  const [timeMinutes, setTimeMinutes] = useState(0)

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
                serviceInterval: number | null
                lastService: CustomerOption["lastService"]
              }) => ({
                id: c.id,
                name: c.name,
                serviceInterval: c.serviceInterval ?? null,
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
      setPaymentMethod(service.paymentMethod ?? "")
      setPaymentDate(toLocalIsoDate(service.paymentDate))
      setTimeMinutes(
        service.timeEntries?.reduce(
          (sum, te) => sum + (te.durationMinutes ?? 0),
          0
        ) ?? 0
      )
    } else {
      setCustomerId("")
      setServiceTypeId("")
      setServiceDate(todayIso())
      setPriceCharged("")
      setNotes("")
      setStatus(defaultStatus)
      setPaid(false)
      setPaymentMethod("")
      setPaymentDate("")
      setTimeMinutes(0)
      setMoreOpen(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, resetKey])

  function handlePickCustomer(c: CustomerOption) {
    setCustomerId(String(c.id))
    setCustomerComboOpen(false)
    setCustomerSearch("")
    customerInputRef.current?.blur()
    if (c.lastService) {
      if (!priceCharged && c.lastService.priceCharged != null) {
        setPriceCharged(String(c.lastService.priceCharged))
      }
      if (!serviceTypeId && c.lastService.serviceTypeId != null) {
        setServiceTypeId(String(c.lastService.serviceTypeId))
      }
    }
  }

  const filteredCustomers =
    customerSearch.trim() === ""
      ? customers
      : customers.filter((c) =>
          c.name.toLowerCase().includes(customerSearch.trim().toLowerCase())
        )

  function handlePaidChange(next: boolean) {
    setPaid(next)
    if (next && !paymentDate && serviceDate) {
      setPaymentDate(serviceDate)
    }
    if (!next) {
      setPaymentMethod("")
    }
  }

  function bumpTime(delta: number) {
    setTimeMinutes((prev) => Math.max(0, prev + delta))
  }

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
        paymentMethod: paid && paymentMethod ? paymentMethod : null,
        paymentDate:
          paid && paymentDate
            ? new Date(paymentDate + "T00:00:00").toISOString()
            : null,
        timeEntries:
          timeMinutes > 0
            ? [
                {
                  date: isoServiceDate,
                  durationMinutes: timeMinutes,
                  description: null,
                },
              ]
            : [],
      }

      const url = isEditing ? `/api/services/${service!.id}` : "/api/services"
      const customerName =
        selectedCustomer?.name ?? service?.customer?.name ?? ""
      const label =
        serviceTypes.find((t) => String(t.id) === serviceTypeId)?.name ??
        "service"

      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = (await res.json().catch(() => null)) as {
        success?: boolean
        error?: string
      } | null

      if (!res.ok || (json && json.success === false)) {
        toast.error(json?.error ?? `Request failed (${res.status})`)
        return
      }

      if (isEditing) {
        toast.success("Service updated")
      } else {
        const priceLabel = `$${price.toFixed(2).replace(/\.00$/, "")}`
        const head = `Logged ${priceLabel} ${label}${customerName ? ` · ${customerName}` : ""}`
        const interval = selectedCustomer?.serviceInterval ?? null
        const nextDue =
          interval && status === "COMPLETE"
            ? shortDateLabel(addDaysIso(serviceDate, interval))
            : null
        toast.success(head, {
          description: nextDue ? `Next service due ${nextDue}` : undefined,
        })
      }
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

  const lastPrice = selectedCustomer?.lastService?.priceCharged ?? null
  const showLastPriceChip =
    !isEditing && lastPrice != null && String(lastPrice) !== priceCharged

  function bumpPrice(amount: number) {
    const current = parseFloat(priceCharged) || 0
    const next = Math.max(0, current + amount)
    setPriceCharged(String(Number.isInteger(next) ? next : next.toFixed(2)))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Customer + Service Type */}
      <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="sf-customer" className="text-xs">
            Customer *
          </Label>
          <Input
            id="sf-customer"
            ref={customerInputRef}
            type="text"
            role="combobox"
            aria-expanded={customerComboOpen}
            autoComplete="off"
            placeholder="Search customers…"
            value={
              customerComboOpen
                ? customerSearch
                : selectedCustomer?.name ?? ""
            }
            onFocus={() => {
              setCustomerSearch("")
              setCustomerComboOpen(true)
            }}
            onChange={(e) => {
              setCustomerSearch(e.target.value)
              if (!customerComboOpen) setCustomerComboOpen(true)
            }}
            onBlur={() => setCustomerComboOpen(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault()
                customerInputRef.current?.blur()
              }
            }}
            className={cn(
              "h-11 w-full sm:h-10",
              customerComboOpen &&
                "rounded-b-none focus-visible:ring-0 focus-visible:border-input"
            )}
          />

          {customerComboOpen && (
            <div
              className="-mt-px rounded-md rounded-t-none border border-t-0 bg-popover"
              onMouseDown={(e) => e.preventDefault()}
            >
              <div className="max-h-60 overflow-y-auto overscroll-contain">
                {filteredCustomers.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-muted-foreground">
                    No customers found.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {filteredCustomers.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => handlePickCustomer(c)}
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-accent",
                            String(c.id) === customerId && "bg-accent"
                          )}
                        >
                          <Check
                            className={cn(
                              "size-4 shrink-0",
                              String(c.id) === customerId
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          <span className="truncate">{c.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="sf-service-type" className="text-xs">
            Service Type
          </Label>
          <Select
            value={serviceTypeId}
            onValueChange={setServiceTypeId}
          >
            <SelectTrigger
              id="sf-service-type"
              className="h-11 w-full sm:h-10"
            >
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

      {/* Inline Service Date pill */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">
          Service date
        </span>
        <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-2.5 font-normal"
            >
              <CalendarIcon className="size-3.5 text-muted-foreground" />
              <span>{shortDateLabel(serviceDate)}</span>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={
                serviceDate ? new Date(serviceDate + "T00:00:00") : undefined
              }
              onSelect={(d) => {
                if (d) setServiceDate(toLocalIsoDate(d))
                setDatePopoverOpen(false)
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Revenue */}
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
            className="h-11 pl-7 text-base [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none sm:h-10 sm:text-sm"
            required
          />
        </div>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {showLastPriceChip && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setPriceCharged(String(lastPrice))}
            >
              Last ${lastPrice}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => bumpPrice(10)}
          >
            +$10
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => bumpPrice(25)}
          >
            +$25
          </Button>
          {priceCharged !== "" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => setPriceCharged("")}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Paid + Payment Date */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="sf-paid" className="text-xs">
            Paid
          </Label>
          <label
            htmlFor="sf-paid"
            className="flex h-11 items-center justify-between rounded-md border px-3 cursor-pointer sm:h-10"
          >
            <span className="text-sm text-muted-foreground truncate">
              {paid ? "Marked as paid" : "Awaiting payment"}
            </span>
            <Switch
              id="sf-paid"
              checked={paid}
              onCheckedChange={handlePaidChange}
            />
          </label>
        </div>

        <div className="space-y-1.5 min-w-0">
          <Label className="text-xs">Payment Date</Label>
          <DatePicker
            date={
              paymentDate
                ? new Date(paymentDate + "T00:00:00")
                : undefined
            }
            onSelect={(d) => setPaymentDate(d ? toLocalIsoDate(d) : "")}
            disabled={!paid}
            className="h-11 sm:h-10"
          />
        </div>
      </div>

      {/* Payment method pills — always visible, disabled when not paid */}
      <div className="space-y-1.5">
        <Label
          className={cn(
            "text-xs",
            !paid && "text-muted-foreground/60"
          )}
        >
          Payment Method
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {PAYMENT_METHODS.map((m) => {
            const active = paid && paymentMethod === m.value
            return (
              <Button
                key={m.value}
                type="button"
                variant={active ? "default" : "outline"}
                size="sm"
                className="h-9 px-3 text-xs sm:h-8"
                disabled={!paid}
                onClick={() =>
                  setPaymentMethod(active ? "" : m.value)
                }
                aria-pressed={active}
              >
                {m.label}
              </Button>
            )
          })}
        </div>
      </div>

      {/* Time on job — single +/- control */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5 text-xs">
          <Clock className="size-3.5 text-muted-foreground" />
          Time on job
        </Label>
        <div className="flex items-center justify-center gap-3 rounded-md border p-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 w-20 text-sm sm:h-10"
            onClick={() => bumpTime(-30)}
            disabled={timeMinutes === 0}
            aria-label="Subtract 30 minutes"
          >
            <Minus className="mr-1 size-3.5" />
            30m
          </Button>
          <span className="min-w-20 text-center text-lg font-semibold tabular-nums">
            {formatDuration(timeMinutes)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 w-20 text-sm sm:h-10"
            onClick={() => bumpTime(30)}
            aria-label="Add 30 minutes"
          >
            <Plus className="mr-1 size-3.5" />
            30m
          </Button>
        </div>
      </div>

      {/* More options (Status + Notes) */}
      <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
        <CollapsibleTrigger className="group flex w-full items-center gap-2 border-t pt-3 text-left text-xs font-medium text-muted-foreground hover:text-foreground">
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform",
              !moreOpen && "-rotate-90"
            )}
          />
          More options
          {!moreOpen && (
            <span className="ml-auto text-muted-foreground/70">
              status · notes
            </span>
          )}
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4">
          {/* Status */}
          <div className="space-y-1.5 min-w-0 sm:max-w-xs">
            <Label htmlFor="sf-status" className="text-xs">
              Status
            </Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="sf-status" className="h-11 w-full sm:h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="COMPLETE">Complete</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
        </CollapsibleContent>
      </Collapsible>

      {/* Submit — sticky on mobile */}
      <div className="sticky bottom-0 z-10 mt-2 flex flex-col-reverse gap-2 border-t bg-background pb-2 pt-3 sm:static sm:border-t-0 sm:bg-transparent sm:pb-0 sm:pt-2 sm:flex-row sm:justify-end">
        {onClose && (
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-11 w-full sm:h-10 sm:w-auto"
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={isSubmitting}
          className="h-11 w-full sm:h-10 sm:w-auto"
        >
          {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
          {isEditing ? "Save Changes" : "Add Service"}
        </Button>
      </div>
    </form>
  )
}
