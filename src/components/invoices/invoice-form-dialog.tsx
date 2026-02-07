"use client"

import { useState, useEffect } from "react"
import { Loader2, Plus, X, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { Separator } from "@/components/ui/separator"

interface Customer {
  id: number
  name: string
}

interface LineItemInput {
  description: string
  serviceDate: string
  quantity: string
  rate: string
  serviceLogId: number | null
}

interface InvoiceItemData {
  id?: number
  description: string
  serviceDate: string
  quantity: number | string
  rate: number | string
  amount: number | string
  serviceLogId: number | null
}

interface InvoiceData {
  id?: number
  invoiceNumber?: string
  customerId: number
  issueDate: string
  dueDate: string | null
  status?: string
  subtotal: number | string
  total: number | string
  amountPaid: number | string
  notes: string | null
  terms: string | null
  customer?: { id: number; name: string }
  items?: InvoiceItemData[]
}

interface ServiceLog {
  id: number
  serviceName: string
  serviceDate: string
  priceCharged: number | string
  status: string
  paymentStatus: string
}

interface InvoiceFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice?: InvoiceData
  onSuccess: () => void
}

function toDateInputValue(dateString: string | null | undefined): string {
  if (!dateString) return ""
  const d = new Date(dateString)
  if (isNaN(d.getTime())) return ""
  return d.toISOString().split("T")[0]
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value)
}

export function InvoiceFormDialog({
  open,
  onOpenChange,
  invoice,
  onSuccess,
}: InvoiceFormDialogProps) {
  const isEditing = !!invoice?.id

  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoadingData, setIsLoadingData] = useState(true)

  // Form fields
  const [customerId, setCustomerId] = useState("")
  const [issueDate, setIssueDate] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [notes, setNotes] = useState("")
  const [terms, setTerms] = useState("")
  const [lineItems, setLineItems] = useState<LineItemInput[]>([])

  // Import services state
  const [isLoadingServices, setIsLoadingServices] = useState(false)
  const [availableServices, setAvailableServices] = useState<ServiceLog[]>([])
  const [showImportSection, setShowImportSection] = useState(false)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  // Fetch customers when dialog opens
  useEffect(() => {
    if (!open) return
    setIsLoadingData(true)

    fetch("/api/customers")
      .then((r) => r.json())
      .then((result) => {
        if (result.success) setCustomers(result.data)
      })
      .catch((err) => console.error("Failed to load customers:", err))
      .finally(() => setIsLoadingData(false))
  }, [open])

  // Reset form when dialog opens
  useEffect(() => {
    if (!open) return

    if (invoice) {
      setCustomerId(String(invoice.customerId))
      setIssueDate(toDateInputValue(invoice.issueDate))
      setDueDate(toDateInputValue(invoice.dueDate))
      setNotes(invoice.notes ?? "")
      setTerms(invoice.terms ?? "")
      setLineItems(
        invoice.items?.map((item) => ({
          description: item.description,
          serviceDate: toDateInputValue(item.serviceDate),
          quantity: String(Number(item.quantity)),
          rate: String(Number(item.rate)),
          serviceLogId: item.serviceLogId ?? null,
        })) ?? []
      )
    } else {
      setCustomerId("")
      setIssueDate(new Date().toISOString().split("T")[0])
      setDueDate("")
      setNotes("")
      setTerms("")
      setLineItems([])
    }

    setError("")
    setShowImportSection(false)
    setAvailableServices([])
  }, [open, invoice])

  // Calculate line item amounts and totals
  function getLineItemAmount(item: LineItemInput): number {
    const qty = parseFloat(item.quantity) || 0
    const rate = parseFloat(item.rate) || 0
    return qty * rate
  }

  const subtotal = lineItems.reduce(
    (sum, item) => sum + getLineItemAmount(item),
    0
  )
  const total = subtotal

  function addLineItem() {
    setLineItems((prev) => [
      ...prev,
      {
        description: "",
        serviceDate: issueDate || new Date().toISOString().split("T")[0],
        quantity: "1",
        rate: "",
        serviceLogId: null,
      },
    ])
  }

  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index))
  }

  function updateLineItem(
    index: number,
    field: keyof LineItemInput,
    value: string | number | null
  ) {
    setLineItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    )
  }

  // Fetch unpaid services for selected customer
  async function handleImportFromServices() {
    if (!customerId) {
      setError("Please select a customer first to import services.")
      return
    }

    setIsLoadingServices(true)
    setShowImportSection(true)

    try {
      const res = await fetch(
        `/api/services?customerId=${customerId}&paymentStatus=UNPAID`
      )
      const result = await res.json()

      if (result.success) {
        setAvailableServices(result.data)
      }
    } catch (err) {
      console.error("Failed to fetch services:", err)
    } finally {
      setIsLoadingServices(false)
    }
  }

  function importService(service: ServiceLog) {
    const alreadyImported = lineItems.some(
      (item) => item.serviceLogId === service.id
    )
    if (alreadyImported) return

    setLineItems((prev) => [
      ...prev,
      {
        description: service.serviceName,
        serviceDate: toDateInputValue(service.serviceDate),
        quantity: "1",
        rate: String(Number(service.priceCharged)),
        serviceLogId: service.id,
      },
    ])
  }

  function importAllServices() {
    const newItems: LineItemInput[] = []

    for (const service of availableServices) {
      const alreadyImported = lineItems.some(
        (item) => item.serviceLogId === service.id
      )
      if (!alreadyImported) {
        newItems.push({
          description: service.serviceName,
          serviceDate: toDateInputValue(service.serviceDate),
          quantity: "1",
          rate: String(Number(service.priceCharged)),
          serviceLogId: service.id,
        })
      }
    }

    if (newItems.length > 0) {
      setLineItems((prev) => [...prev, ...newItems])
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!customerId) {
      setError("Customer is required.")
      return
    }
    if (!issueDate) {
      setError("Issue date is required.")
      return
    }
    if (lineItems.length === 0) {
      setError("At least one line item is required.")
      return
    }

    // Validate all line items have description and rate
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i]
      if (!item.description.trim()) {
        setError(`Line item ${i + 1}: Description is required.`)
        return
      }
      if (!item.rate || parseFloat(item.rate) <= 0) {
        setError(`Line item ${i + 1}: Rate must be greater than zero.`)
        return
      }
      if (!item.serviceDate) {
        setError(`Line item ${i + 1}: Service date is required.`)
        return
      }
    }

    setIsSubmitting(true)

    try {
      const payload = {
        customerId: parseInt(customerId, 10),
        issueDate: new Date(issueDate).toISOString(),
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        notes: notes.trim() || null,
        terms: terms.trim() || null,
        items: lineItems.map((item) => ({
          description: item.description.trim(),
          serviceDate: new Date(item.serviceDate).toISOString(),
          quantity: parseFloat(item.quantity) || 1,
          rate: parseFloat(item.rate) || 0,
          serviceLogId: item.serviceLogId ?? undefined,
        })),
      }

      const url = isEditing
        ? `/api/invoices/${invoice.id}`
        : "/api/invoices"

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
      setError("Failed to save invoice. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-screen flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Invoice" : "Create Invoice"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the invoice details below."
              : "Fill in the details to create a new invoice."}
          </DialogDescription>
        </DialogHeader>

        {isLoadingData ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0 pr-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              {/* Header Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="inv-customer">Customer *</Label>
                  <Select value={customerId} onValueChange={setCustomerId}>
                    <SelectTrigger id="inv-customer" className="w-full">
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
                  <Label htmlFor="inv-issue-date">Issue Date *</Label>
                  <Input
                    id="inv-issue-date"
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="inv-due-date">Due Date</Label>
                  <Input
                    id="inv-due-date"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
                <div />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inv-notes">Notes</Label>
                <Textarea
                  id="inv-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes to include on the invoice"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inv-terms">Terms</Label>
                <Textarea
                  id="inv-terms"
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  placeholder="Payment terms, e.g. Net 30"
                  rows={2}
                />
              </div>

              <Separator />

              {/* Line Items */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Line Items</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleImportFromServices}
                    >
                      <Download className="mr-1 size-3.5" />
                      Import from Services
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addLineItem}
                    >
                      <Plus className="mr-1 size-3.5" />
                      Add Item
                    </Button>
                  </div>
                </div>

                {/* Import Services Section */}
                {showImportSection && (
                  <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">
                        Unpaid Services for Customer
                      </p>
                      <div className="flex gap-2">
                        {availableServices.length > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={importAllServices}
                          >
                            Import All
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowImportSection(false)}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                    {isLoadingServices ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : availableServices.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">
                        No unpaid services found for this customer.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {availableServices.map((service) => {
                          const alreadyImported = lineItems.some(
                            (item) => item.serviceLogId === service.id
                          )
                          return (
                            <div
                              key={service.id}
                              className="flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-muted/50"
                            >
                              <div className="flex-1">
                                <span className="font-medium">
                                  {service.serviceName}
                                </span>
                                <span className="text-muted-foreground ml-2">
                                  {new Date(
                                    service.serviceDate
                                  ).toLocaleDateString()}{" "}
                                  &middot;{" "}
                                  {formatCurrency(Number(service.priceCharged))}
                                </span>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={alreadyImported}
                                onClick={() => importService(service)}
                              >
                                {alreadyImported ? "Added" : "Import"}
                              </Button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Line Item Rows */}
                {lineItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No line items. Click &quot;Add Item&quot; or &quot;Import
                    from Services&quot; to add items.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {/* Column headers */}
                    <div className="hidden md:grid md:grid-cols-12 items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
                      <span className="col-span-3">Description</span>
                      <span className="col-span-3">Service Date</span>
                      <span className="col-span-2">Qty</span>
                      <span className="col-span-2">Rate</span>
                      <span className="col-span-2 text-right">Amount</span>
                    </div>

                    {lineItems.map((item, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-1 md:grid-cols-12 items-start md:items-center gap-2 rounded-md border p-2"
                      >
                        <div className="md:col-span-3">
                          <Label className="md:hidden text-xs text-muted-foreground">Description</Label>
                          <Input
                            value={item.description}
                            onChange={(e) =>
                              updateLineItem(index, "description", e.target.value)
                            }
                            placeholder="Description"
                            className="h-8"
                          />
                        </div>
                        <div className="md:col-span-3">
                          <Label className="md:hidden text-xs text-muted-foreground">Service Date</Label>
                          <Input
                            type="date"
                            value={item.serviceDate}
                            onChange={(e) =>
                              updateLineItem(
                                index,
                                "serviceDate",
                                e.target.value
                              )
                            }
                            className="h-8"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label className="md:hidden text-xs text-muted-foreground">Qty</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={item.quantity}
                            onChange={(e) =>
                              updateLineItem(index, "quantity", e.target.value)
                            }
                            placeholder="1"
                            className="h-8"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label className="md:hidden text-xs text-muted-foreground">Rate</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.rate}
                            onChange={(e) =>
                              updateLineItem(index, "rate", e.target.value)
                            }
                            placeholder="0.00"
                            className="h-8"
                          />
                        </div>
                        <div className="md:col-span-2 flex items-center justify-between md:justify-end gap-2">
                          <span className="md:hidden text-xs text-muted-foreground">Amount:</span>
                          <div className="text-right text-sm font-medium tabular-nums">
                            {formatCurrency(getLineItemAmount(item))}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0 md:hidden"
                            onClick={() => removeLineItem(index)}
                          >
                            <X className="size-4" />
                            <span className="sr-only">Remove item</span>
                          </Button>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="hidden md:flex size-8 shrink-0"
                          onClick={() => removeLineItem(index)}
                        >
                          <X className="size-4" />
                          <span className="sr-only">Remove item</span>
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Totals */}
              {lineItems.length > 0 && (
                <div className="flex justify-end">
                  <div className="w-64 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-medium tabular-nums">
                        {formatCurrency(subtotal)}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-base font-semibold">
                      <span>Total</span>
                      <span className="tabular-nums">
                        {formatCurrency(total)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}
                  {isEditing ? "Save Changes" : "Create Invoice"}
                </Button>
              </div>
            </form>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
