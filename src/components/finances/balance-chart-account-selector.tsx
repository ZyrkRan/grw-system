"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, Landmark, CreditCard, Building2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Account {
  id: number
  name: string
  type: string
  isActive: boolean
  currentBalance: string | number | null
}

interface BalanceChartAccountSelectorProps {
  selectedAccountIds: number[]
  onSelectionChange: (accountIds: number[]) => void
  disabled?: boolean
}

function formatCurrency(amount: number | string | null): string {
  if (amount === null || amount === undefined) return "$0.00"
  const num = typeof amount === "string" ? parseFloat(amount) : amount
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

function AccountIcon({ type, className }: { type: string; className?: string }) {
  const iconClass = cn("size-4", className)
  switch (type) {
    case "CREDIT":
      return <CreditCard className={iconClass} />
    case "SAVINGS":
      return <Building2 className={iconClass} />
    default:
      return <Landmark className={iconClass} />
  }
}

export function BalanceChartAccountSelector({
  selectedAccountIds,
  onSelectionChange,
  disabled = false,
}: BalanceChartAccountSelectorProps) {
  const [open, setOpen] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/finances/accounts")
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const result = await res.json()
      if (result.success) {
        // Filter to only active accounts
        setAccounts(result.data.filter((acc: Account) => acc.isActive))
      } else {
        setError("Failed to load accounts")
      }
    } catch (err) {
      console.error("Failed to fetch accounts:", err)
      setError("Failed to load accounts")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      fetchAccounts()
    }
  }, [open, fetchAccounts])

  const handleToggleAccount = (accountId: number, checked: boolean | string) => {
    if (typeof checked !== "boolean") return

    if (checked) {
      // Add account if not at limit
      if (selectedAccountIds.length < 5) {
        onSelectionChange([...selectedAccountIds, accountId])
      }
    } else {
      // Remove account
      onSelectionChange(selectedAccountIds.filter((id) => id !== accountId))
    }
  }

  const atLimit = selectedAccountIds.length >= 5

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Plus className="mr-2 h-4 w-4" />
          {selectedAccountIds.length === 0
            ? "Compare Accounts"
            : `${selectedAccountIds.length} Selected`}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-3" align="end">
        <div className="space-y-3">
          <p className="text-sm font-medium">Select accounts to compare</p>

          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Loading accounts...
            </div>
          ) : error ? (
            <div className="py-8 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="ghost" size="sm" onClick={fetchAccounts} className="mt-2">
                Retry
              </Button>
            </div>
          ) : accounts.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No active accounts found
            </div>
          ) : (
            <>
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {accounts.map((account) => {
                    const isSelected = selectedAccountIds.includes(account.id)
                    const isDisabled = !isSelected && atLimit

                    return (
                      <div
                        key={account.id}
                        className={cn(
                          "flex items-start gap-2 rounded-md p-2 hover:bg-accent transition-colors",
                          isDisabled && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <Checkbox
                          id={`account-${account.id}`}
                          checked={isSelected}
                          onCheckedChange={(checked) =>
                            handleToggleAccount(account.id, checked)
                          }
                          disabled={isDisabled}
                          className="mt-0.5"
                        />
                        <label
                          htmlFor={`account-${account.id}`}
                          className={cn(
                            "text-sm flex-1 cursor-pointer",
                            isDisabled && "cursor-not-allowed"
                          )}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <AccountIcon type={account.type} />
                            <span className="font-medium">{account.name}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatCurrency(account.currentBalance)}
                          </div>
                        </label>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>

              {atLimit && (
                <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 px-2 py-1.5 rounded">
                  Max 5 accounts for clarity. Deselect one to add another.
                </div>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
