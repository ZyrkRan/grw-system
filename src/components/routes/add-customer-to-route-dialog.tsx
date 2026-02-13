"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Button } from "@/components/ui/button"
import { Loader2, Star, MapPin, Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface CustomerOption {
  id: number
  name: string
  phone: string
  address: string
  isVip: boolean
}

interface AddCustomerToRouteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  routeId: number
  existingCustomerIds: number[]
  onSuccess: () => void
}

export function AddCustomerToRouteDialog({
  open,
  onOpenChange,
  routeId,
  existingCustomerIds,
  onSuccess,
}: AddCustomerToRouteDialogProps) {
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [error, setError] = useState("")

  const fetchCustomers = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/customers")
      const result = await res.json()
      if (result.success) {
        setCustomers(result.data)
      }
    } catch {
      console.error("Failed to fetch customers")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      fetchCustomers()
      setSelectedIds(new Set())
      setError("")
    }
  }, [open, fetchCustomers])

  const availableCustomers = customers.filter(
    (c) => !existingCustomerIds.includes(c.id)
  )

  function toggleCustomer(customerId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(customerId)) {
        next.delete(customerId)
      } else {
        next.add(customerId)
      }
      return next
    })
  }

  async function handleAdd() {
    if (selectedIds.size === 0) return

    setIsAdding(true)
    setError("")

    try {
      const results = await Promise.all(
        Array.from(selectedIds).map((customerId) =>
          fetch(`/api/routes/${routeId}/customers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ customerId }),
          }).then((r) => r.json())
        )
      )

      const failed = results.filter((r) => !r.success)
      if (failed.length > 0) {
        setError(`Failed to add ${failed.length} customer(s).`)
      } else {
        onSuccess()
        onOpenChange(false)
      }
    } catch {
      setError("Failed to add customers. Please try again.")
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle>Add Customers to Route</DialogTitle>
          <DialogDescription>
            Search and select customers to add to this route.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="mx-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <Command className="border-t">
          <CommandInput placeholder="Search customers..." />
          <CommandList className="max-h-72">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <CommandEmpty>No customers found.</CommandEmpty>
                <CommandGroup>
                  {availableCustomers.map((customer) => {
                    const isSelected = selectedIds.has(customer.id)
                    return (
                      <CommandItem
                        key={customer.id}
                        value={`${customer.name} ${customer.address} ${customer.phone}`}
                        onSelect={() => toggleCustomer(customer.id)}
                        className="flex items-center gap-3 py-3"
                      >
                        <div
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/30"
                          )}
                        >
                          {isSelected && <Check className="size-3" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{customer.name}</span>
                            {customer.isVip && (
                              <Star className="size-3 fill-yellow-400 text-yellow-400" />
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="size-3 shrink-0" />
                            <span className="truncate">{customer.address}</span>
                          </div>
                        </div>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
        <DialogFooter className="border-t px-4 py-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isAdding}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={selectedIds.size === 0 || isAdding}
          >
            {isAdding && <Loader2 className="mr-2 size-4 animate-spin" />}
            Add {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
